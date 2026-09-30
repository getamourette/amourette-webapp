import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { read, installLikeSchema, seedPair, token, command } from './like-test-database.mjs';
import { installNameSchema, asUser } from './name-test-database.mjs';
import { installProfileEditSchema, edit } from './profile-edit-test-database.mjs';

const db = new PGlite();
const adapter = { query: (sql, args) => args ? db.query(sql, args) : db.exec(sql).then(r => r.at(-1)) };
const state = async id => (await asUser(db, id, 'select * from get_my_matching_consent()'))[0];
const grant = async (id, expected = null, request = crypto.randomUUID(), patch = {}) => {
  const p = { consent: true, version: 'matching-v1-draft', locale: 'en', gender: 'woman', interests: ['woman'], ...patch };
  return (await asUser(db, id, 'select * from grant_my_matching_consent($1,$2,$3,$4,$5,$6,$7)',
    [JSON.stringify(p.consent), p.version, p.locale, p.gender, p.interests, expected, request]))[0];
};
const withdraw = async (id, revision) => (await asUser(db, id, 'select * from withdraw_my_matching_consent($1)', [revision]))[0];
const evidence = async id => (await db.query('select * from private.matching_consent_events where profile_id=$1 order by occurred_at', [id])).rows;
try {
  await installLikeSchema(adapter); await installNameSchema(adapter); await installProfileEditSchema(adapter);
  const legacy = await seedPair(adapter);
  await command(db, { actor: legacy.a, target: legacy.b, night: legacy.night, token: await token(db, legacy.a, legacy.venue, legacy.b) });
  await command(db, { actor: legacy.b, target: legacy.a, night: legacy.night, token: await token(db, legacy.b, legacy.venue, legacy.a) });
  await db.exec(`alter table profiles alter column gender set not null, alter column interested_in set not null;
    alter table profiles add constraint profiles_interested_in_check check(private.valid_interests(interested_in));
    create table private.night_people(person_id uuid primary key,gender text);
    create table private.consent_test_invalidations(recipient uuid);
    create function private.invalidate_profile_audience(subject uuid,content boolean) returns void language sql as $$
      insert into private.consent_test_invalidations select p.profile_id from public.presence p join public.presence mine on p.venue_night_id=mine.venue_night_id
      where mine.profile_id=subject and private.like_pair_eligible(subject,p.profile_id,p.venue_night_id)
    $$;`);
  await db.query("insert into private.night_people values($1,'woman')", [legacy.a]);
  await db.exec(read('supabase/migrations/20260930000010_matching_preference_consent.sql'));
  // Execute the real chat policies against a minimal messages substrate.
  await db.exec(`create table public.messages(id uuid primary key default gen_random_uuid(),match_id uuid references public.matches(id) on delete cascade,sender_id uuid,body text);
    alter table public.messages enable row level security; alter table public.matches enable row level security;
    grant select,insert on public.messages to authenticated; grant select on public.matches,public.blocks to authenticated;`);
  const policies=read('supabase/migrations/20260724000005_lifecycle_advisor_hardening.sql');
  await db.exec(read('supabase/migrations/20260724000003_lifecycle_rls_helpers.sql')
    .match(/create or replace function private\.is_live_venue_night[\s\S]*?\$\$;/)[0]);
  for(const name of ['matches_select_member','messages_select_member']) {
    await db.exec(policies.match(new RegExp(`create policy ${name} [\\s\\S]*?\\n\\);`))[0]);
  }
  await db.exec(read('supabase/migrations/20260728000003_pause_chat_after_venue_departure.sql'));
  assert.equal((await state(legacy.a)).active, false);
  assert.equal((await evidence(legacy.a)).length, 0, 'no manufactured legacy consent');
  assert.deepEqual((await db.query('select gender,interested_in from profiles where id=$1',[legacy.a])).rows[0], { gender:null, interested_in:null });
  assert.equal((await db.query('select gender from private.night_people')).rows[0].gender,null);
  assert.equal((await db.query('select count(*)::int n from matches')).rows[0].n,1,'established match survives cutover');
  assert.equal(await token(db,legacy.a,legacy.venue,legacy.c),undefined);
  for (const patch of [{consent:false},{consent:null},{consent:'true'},{consent:1},{consent:[]},{version:'forged'},{locale:'EN'},{locale:null},{gender:null},{interests:[]},{interests:['woman','woman']}]) {
    await assert.rejects(grant(legacy.a,null,crypto.randomUUID(),patch));
    assert.equal((await evidence(legacy.a)).length,0);
  }
  await assert.rejects(asUser(db,legacy.a,"update profiles set gender='woman',interested_in=array['woman'] where id=$1",[legacy.a]),/consent/);
  await assert.rejects(edit(db,legacy.a,'woman',['woman']),/consent/);
  const request = crypto.randomUUID();
  let agreed = await grant(legacy.a,null,request);
  assert.equal(agreed.status,'saved'); assert.equal(agreed.active,true); assert.equal(agreed.available_at,null);
  const initialPreferences = (await asUser(db,legacy.a,'select * from get_my_profile_edit_state()'))[0];
  assert.match(initialPreferences.version, /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
  assert.equal(initialPreferences.available_at, null, 'initial consent creates a version without a cooldown');
  assert.equal((await evidence(legacy.a))[0].version,'matching-v1-draft');
  assert.equal((await evidence(legacy.a))[0].occurred_at.getTime(),agreed.granted_at.getTime());
  assert.equal((await grant(legacy.a,null,request)).status,'unchanged');
  assert.equal((await grant(legacy.a,null,request,{gender:'man'})).status,'stale','request ID cannot silently bind a different command');
  assert.equal((await evidence(legacy.a)).length,1,'retry does not duplicate proof');
  for(const peer of [legacy.b,legacy.c]) await grant(peer);
  const oldToken = await token(db,legacy.c,legacy.venue,legacy.a);
  await command(db,{actor:legacy.c,target:legacy.a,night:legacy.night,token:oldToken});
  await db.query("update private.night_people set gender='woman' where person_id=$1",[legacy.a]);
  const edited = await edit(db,legacy.a,'woman',['woman','man'],
    (await asUser(db,legacy.a,'select * from get_my_profile_edit_state()'))[0].version);
  assert.ok(edited.available_at,'normal preference cooldown starts');
  const removed = await withdraw(legacy.a,agreed.revision);
  assert.equal(removed.status,'saved'); assert.equal(removed.active,false);
  assert.equal(removed.available_at.getTime(),edited.available_at.getTime(),'withdrawal never waits or clears the deadline');
  assert.equal((await db.query('select gender from private.night_people')).rows[0].gender,null);
  await db.query("update private.night_people set gender='woman' where person_id=$1",[legacy.a]);
  assert.equal((await db.query('select gender from private.night_people')).rows[0].gender,null,'late analytics write cannot recreate withdrawn copy');
  assert.equal((await evidence(legacy.a)).length,2);
  assert.equal((await withdraw(legacy.a,agreed.revision)).status,'unchanged');
  assert.equal((await evidence(legacy.a)).length,2,'repeat withdrawal is harmless');
  assert.ok((await db.query('select * from private.consent_test_invalidations where recipient=$1',[legacy.c])).rows.length,'former viewer receives invalidation');
  assert.equal((await db.query('select count(*)::int n from likes')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from matches')).rows[0].n,1,'withdrawal preserves chats');
  const matchId=(await db.query('select id from matches')).rows[0].id;
  await asUser(db,legacy.a,'insert into messages(match_id,sender_id,body) values($1,$2,$3)',[matchId,legacy.a,'Still mutually matched']);
  assert.equal((await asUser(db,legacy.b,'select body from messages')).length,1,'existing conversation remains readable');
  await assert.rejects(asUser(db,legacy.c,'insert into messages(match_id,sender_id,body) values($1,$2,$3)',[matchId,legacy.c,'No open messaging']));
  await db.query("update venue_nights set closes_at=clock_timestamp()-interval '1 second' where id=$1",[legacy.night]);
  assert.equal((await asUser(db,legacy.a,'select body from messages')).length,0,'expiry still closes access');
  await assert.rejects(asUser(db,legacy.a,'insert into messages(match_id,sender_id,body) values($1,$2,$3)',[matchId,legacy.a,'Expired']));
  await db.query("update venue_nights set closes_at=clock_timestamp()+interval '1 day' where id=$1",[legacy.night]);
  assert.equal((await asUser(db,legacy.b,'select private.can_view_public_photo($1) allowed',[legacy.a]))[0].allowed,true,'matched peer retains authorized profile');
  assert.equal((await asUser(db,legacy.c,'select private.can_view_public_photo($1) allowed',[legacy.a]))[0].allowed,false,'unmatched viewer loses photo access');
  assert.equal((await command(db,{actor:legacy.c,target:legacy.a,night:legacy.night,token:oldToken})).accepted,false);
  assert.equal((await grant(legacy.a,removed.revision)).status,'cooldown');
  assert.equal((await grant(legacy.a,null,request)).status,'stale','old acceptance cannot revive withdrawn preferences');
  await db.query('update private.profile_edit_state set available_at=clock_timestamp() where profile_id=$1',[legacy.a]);
  agreed = await grant(legacy.a,removed.revision,crypto.randomUUID(),{locale:'fr'});
  assert.equal(agreed.status,'saved'); assert.equal((await evidence(legacy.a)).length,3);
  assert.equal((await withdraw(legacy.a,request)).status,'stale','old withdrawal cannot revoke new consent');
  assert.equal((await command(db,{actor:legacy.c,target:legacy.a,night:legacy.night,token:oldToken})).accepted,false,'old card remains invalid after re-consent');
  assert.ok(await token(db,legacy.c,legacy.venue,legacy.a));
  for (const role of ['anon','authenticated','service_role']) {
    for(const table of ['matching_consent_wordings','matching_consent_state','matching_consent_events']) {
      assert.equal((await db.query('select has_table_privilege($1,$2,$3) ok',[role,`private.${table}`,'SELECT'])).rows[0].ok,false);
    }
  }
  await assert.rejects(state(null));
  await assert.rejects(asUser(db,legacy.b,'select * from get_my_matching_consent($1)',[legacy.a]));
  assert.equal((await db.query("select count(*)::int n from pg_publication_tables where tablename like 'matching_consent%'")).rows[0].n,0);

  // Execute the real service-only initial-profile entry point and prove that
  // malformed/absent consent and failed profile validation roll back evidence.
  const signup = crypto.randomUUID(); const path = `${signup}/${crypto.randomUUID()}.png`;
  await db.query('insert into auth.users values($1)',[signup]);
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('profile-photos',$1,'{\"size\":100,\"mimetype\":\"image/png\"}')",[path]);
  const profile = {first_name:'New',bio:null,gender:'woman',interested_in:['woman'],adult_confirmed:true,
    matching_consent:true,matching_consent_version:'matching-v1-draft',matching_consent_locale:'es'};
  for(const patch of [{matching_consent:undefined},{matching_consent:false},{matching_consent:'true'},
    {matching_consent_version:null},{matching_consent_locale:'unknown'},{first_name:''}]) {
    await assert.rejects(db.query('select submit_profile_photo($1,$2,0,$3)',[signup,path,JSON.stringify({...profile,...patch})]));
    assert.equal((await evidence(signup)).length,0);
  }
  await db.query('select submit_profile_photo($1,$2,0,$3)',[signup,path,JSON.stringify(profile)]);
  assert.equal((await state(signup)).active,true); assert.equal((await evidence(signup)).length,1);
  await assert.rejects(db.query('select submit_profile_photo($1,$2,0,$3)',[signup,path,JSON.stringify(profile)]));
  assert.equal((await evidence(signup)).length,1);
  console.log('Matching consent SQL: cutover, proof, bypass refusal, retry/replay, cooldown, copy cleanup, private invalidation, discovery and preserved matches passed.');
} finally { await db.close(); }
