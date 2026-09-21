import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { installLikeSchema,seedPair,token,command,identify } from './like-test-database.mjs';
const db = new PGlite();
// PGlite's query takes one statement; exec supports migrations.
const adapter = { query: (sql, args) => args ? db.query(sql,args) : db.exec(sql).then(results=>results.at(-1)) };
try {
await installLikeSchema(adapter);
// Parent rows may already be gone when child invalidation triggers run, before
// the authorization table's own cascade has executed. Test every parent path.
for (const parent of ['venues','venue_nights','profiles']) {
 const fixture=await seedPair(adapter);
 await token(db,fixture.a,fixture.venue,fixture.b);
 const ids={venues:fixture.venue,venue_nights:fixture.night,profiles:fixture.a};
 await db.query(`delete from ${parent} where id=$1`,[ids[parent]]);
 assert.equal((await db.query('select count(*)::int n from private.like_pair_authorizations where $1 in (profile_a,profile_b)',[fixture.a])).rows[0].n,0,`${parent} cascade removes pair state`);
}
const {a,b,c,venue,night} = await seedPair(adapter);
const original = await token(db,a,venue,b);
assert.ok(original);
const click = {actor:a,target:b,night,token:original};
const request = crypto.randomUUID();
await db.query("update profiles set interested_in=array['man','woman'] where id=$1",[b]);
assert.equal(await token(db,a,venue,b),original,'compatible preference edit keeps click');
assert.equal((await command(db,{...click,request})).accepted,true);
assert.equal((await command(db,{...click,request})).liked,true);
await assert.rejects(command(db,{...click,request,target:c}),/identifier reused/);
await db.query("update profiles set bio='bio only' where id=$1",[b]);
assert.equal(await token(db,a,venue,b),original);
await db.query("update profiles set interested_in=array['woman','man'] where id=$1",[b]);
assert.equal(await token(db,a,venue,b),original,'semantic no-op');
await assert.rejects(db.query("update profiles set gender='invalid' where id=$1",[b]));
assert.equal(await token(db,a,venue,b),original,'refused edits roll back');
const unrelated = await token(db,a,venue,c);
await command(db,{actor:a,target:c,night,token:unrelated});
await db.query("update profiles set interested_in=array['man'] where id=$1",[b]);
assert.equal((await db.query('select * from likes where liked_id=$1',[b])).rows.length,0);
await db.query("update profiles set interested_in=array['woman'] where id=$1",[b]);
assert.equal((await command(db,{...click,request})).accepted,false,'replay never revives cleaned like');
assert.equal((await command(db,click)).accepted,false,'old gesture refused after round trip');
assert.equal((await db.query('select * from likes where liked_id=$1',[c])).rows.length,1);
const fresh = await token(db,a,venue,b);
assert.notEqual(fresh,original);
assert.equal((await command(db,{...click,token:fresh})).accepted,true);
const reciprocal = await token(db,b,venue,a);
const matched = await command(db,{actor:b,target:a,night,token:reciprocal});
assert.ok(matched.match_id);
assert.equal((await db.query('select * from venue_match_events')).rows.length,1);
await db.query("update profiles set interested_in=array['man'] where id=$1",[b]);
assert.equal((await db.query('select * from matches')).rows.length,1,'established match preserved');
await db.query("update profiles set interested_in=array['woman'] where id=$1",[b]);
// Unlike stays explicit and repeating it cannot delete a later new gesture.
const removal={actor:a,target:b,night,action:'unlike',request:crypto.randomUUID()};
await command(db,removal);
await command(db,{...click,token:await token(db,a,venue,b)});
assert.equal((await command(db,removal)).liked,true);
for (const [change,restore] of [
 ["update presence set is_visible=false where profile_id=$1","update presence set is_visible=true where profile_id=$1"],
 ["update presence set left_at=now() where profile_id=$1","update presence set left_at=null where profile_id=$1"],
 ["update photo_state set correction_required=true where profile_id=$1","update photo_state set correction_required=false where profile_id=$1"],
]) {
 const before=await token(db,a,venue,b);
 await db.query(change,[b]); await db.query(restore,[b]);
 assert.equal((await command(db,{...click,token:before})).accepted,false,change);
 assert.notEqual(await token(db,a,venue,b),before);
}
const beforeBlock=await token(db,a,venue,b);
await db.query('insert into blocks values($1,$2)',[a,b]);
await db.query('delete from blocks');
assert.equal((await command(db,{...click,token:beforeBlock})).accepted,false);
assert.equal((await db.query('select * from matches')).rows.length,0,'existing block cleanup retained');
const beforeEjection=await token(db,a,venue,b);
await db.query('insert into venue_ejections(profile_id,venue_night_id) values($1,$2)',[b,night]);
assert.equal(await token(db,a,venue,b),undefined);
await db.query('delete from venue_ejections');
assert.equal((await command(db,{...click,token:beforeEjection})).accepted,false);
// Revocation in either direction includes the recipient's prior one-sided like.
const reverse = await token(db,b,venue,a);
await command(db,{actor:b,target:a,night,token:reverse});
await db.query("update profiles set interested_in=array['man'] where id=$1",[a]);
assert.equal((await db.query('select * from likes where liker_id=$1 and liked_id=$2',[b,a])).rows.length,0);
await db.query("update profiles set interested_in=array['woman'] where id=$1",[a]);
const second = await seedPair(adapter);
assert.equal((await command(db,{...click,night:second.night,token:await token(db,a,venue,b)})).accepted,false,'token cannot authorize another night');
await identify(db,a);
await assert.rejects(db.query("select * from write_like('malformed',gen_random_uuid(),'like',gen_random_uuid(),gen_random_uuid())"),/invalid input syntax/);
await db.query('reset role');
assert.equal((await db.query("select count(*)::int n from pg_publication_tables where schemaname='private'")).rows[0].n,0);
assert.equal((await db.query("select has_function_privilege('anon','public.write_like(uuid,uuid,text,uuid,uuid)','execute') allowed")).rows[0].allowed,false);
for (const role of ['anon','authenticated']) for (const table of ['likes','matches']) for (const privilege of ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) {
 assert.equal((await db.query('select has_table_privilege($1,$2,$3) allowed',[role,table,privilege])).rows[0].allowed,false,`${role} ${table} ${privilege}`);
}
// Direct API writes, private state reads, missing identity, malformed commands.
await identify(db,a);
for(const sql of ['insert into likes(liker_id,liked_id) values(auth.uid(),gen_random_uuid())','delete from likes','select * from private.like_pair_authorizations','select * from private.like_request_receipts']) await assert.rejects(db.query(sql),/permission denied/);
await db.query('reset role');
for(const extra of [{actor:null},{target:a},{action:'LIKE'},{action:null},{token:null},{request:null},{night:null},{token:crypto.randomUUID()}]) {
 const fn=()=>command(db,{...click,...extra});
 if(extra.token && extra.token!==original) assert.equal((await fn()).accepted,false);
 else await assert.rejects(fn());
}
assert.equal((await command(db,{...click,token:unrelated})).accepted,false,'cross-pair token');
await db.query("update venue_nights set status='closed' where id=$1",[night]);
await db.query("update venue_nights set status='live' where id=$1",[night]);
assert.equal((await command(db,{...click,token:await token(db,a,venue,c)})).accepted,false);
await db.query('update venue_nights set terminal_at=now() where id=$1',[night]);
assert.equal((await db.query('select * from private.like_request_receipts where venue_night_id=$1',[night])).rows.length,0);
assert.equal((await db.query('select * from private.like_pair_authorizations where venue_night_id=$1',[night])).rows.length,0);
console.log('Like SQL: authorization, cleanup, compatible edits, interruption, replay, privacy and terminal cleanup passed.');
} finally {await db.close();}

// Exercise the actual cutover against likes created under the old contract.
const legacy = new PGlite();
const oldDb = { query: (sql, args) => args ? legacy.query(sql,args) : legacy.exec(sql).then(results=>results.at(-1)) };
try {
  let fixture;
  await installLikeSchema(oldDb, async () => {
    fixture = await seedPair(oldDb);
    const {a,b,c,venue,night}=fixture;
    for (const [actor,target] of [[a,b],[b,c],[a,c]]) {
      await legacy.query("insert into likes(liker_id,liked_id,venue_id,venue_night_id,expires_at) values($1,$2,$3,$4,now()+interval '1 day')",[actor,target,venue,night]);
    }
    await legacy.query("update profiles set interested_in=array['man'] where id=$1",[b]);
  });
  assert.deepEqual((await legacy.query('select liker_id,liked_id from likes')).rows,[{liker_id:fixture.a,liked_id:fixture.c}]);
  assert.equal((await legacy.query('select count(*)::int n from private.like_pair_authorizations')).rows[0].n,3,'seed only actual legacy pairs');
  assert.ok(await token(legacy,fixture.a,fixture.venue,fixture.c));
  console.log('Like cutover: seeded legacy pairs and cleaned both incompatible directions while retaining unrelated likes.');
} finally { await legacy.close(); }

// Discovery must authorize only the requester's exact live night and must not
// invoke the shared, comparatively expensive predicate for unrelated venues.
const discovery = new PGlite();
const discoveryDb = { query: (sql, args) => args ? discovery.query(sql,args) : discovery.exec(sql).then(results=>results.at(-1)) };
try {
  await installLikeSchema(discoveryDb);
  const local = await seedPair(discoveryDb);
  const elsewhere = await seedPair(discoveryDb);
  const localRows = (await discovery.query('select id,profile_id from presence where venue_night_id=$1',[local.night])).rows;
  const originalDefinition = (await discovery.query(
    "select pg_get_functiondef('private.like_pair_eligible(uuid,uuid,uuid)'::regprocedure) definition",
  )).rows[0].definition;
  const probeDefinition = originalDefinition.replace(
    'FUNCTION private.like_pair_eligible(',
    'FUNCTION private.like_pair_eligible_probe_logic(',
  );
  assert.notEqual(probeDefinition,originalDefinition,'predicate definition can be copied for the probe');
  await discovery.exec(probeDefinition);
  const unrelatedTargets = [elsewhere.a,elsewhere.b,elsewhere.c].map(id=>`'${id}'`).join(',');
  await discovery.exec(`create or replace function private.like_pair_eligible(p_actor uuid,p_target uuid,p_night uuid)
    returns boolean language plpgsql volatile security definer set search_path='' as $probe$
    begin
      if p_target=any(array[${unrelatedTargets}]::uuid[]) then
        raise exception 'out-of-scope eligibility evaluation';
      end if;
      return private.like_pair_eligible_probe_logic(p_actor,p_target,p_night);
    end $probe$;`);

  await identify(discovery,local.a);
  try {
    const discoverable=(await discovery.query('select private.discoverable_presence_ids() id order by 1')).rows.map(row=>row.id);
    const expectedCandidates=localRows.filter(row=>row.profile_id!==local.a).map(row=>row.id).sort();
    assert.deepEqual(discoverable,expectedCandidates);
    assert.deepEqual(
      (await discovery.query('select id from presence order by id')).rows.map(row=>row.id),
      localRows.map(row=>row.id).sort(),
      'presence authorization excludes unrelated venues',
    );
    assert.deepEqual(
      (await discovery.query('select id from profiles order by id')).rows.map(row=>row.id),
      [local.a,local.b,local.c].sort(),
      'profile authorization excludes unrelated venues',
    );
    assert.equal((await discovery.query('select private.can_view_public_photo($1) allowed',[local.b])).rows[0].allowed,true);
    assert.equal((await discovery.query('select private.can_view_public_photo($1) allowed',[elsewhere.b])).rows[0].allowed,false);
  } finally {
    await discovery.query('reset role');
  }
  console.log('Like discovery: exact-night authorization avoids eligibility work for unrelated venues.');
} finally { await discovery.close(); }
