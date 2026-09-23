import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { installLikeSchema, seedPair, token, command } from './like-test-database.mjs';
import { asUser, installNameSchema } from './name-test-database.mjs';
import { installProfileEditSchema, state, edit } from './profile-edit-test-database.mjs';
const db = new PGlite();
const adapter = { query: (sql,args) => args ? db.query(sql,args) : db.exec(sql).then(results=>results.at(-1)) };
const values = ({ gender, interested_in, version, available_at }) => ({ gender, interested_in, version, available_at });
try {
  await installLikeSchema(adapter); await installNameSchema(adapter);
  const legacy = await seedPair(adapter);
  await installProfileEditSchema(adapter);
  const { a,b,c,venue,night } = await seedPair(adapter);
  for (const actor of [legacy.a,a]) {
    const initial = await state(db,actor);
    assert.equal(initial.version,null); assert.equal(initial.available_at,null);
  }
  for (const [gender, interests] of [[null,['woman']],['Woman',['woman']],['man',null],['man',[]],['man',['woman',null]],['man',['woman','woman']],['man',['invalid']],['man',[['woman']]],['man',['woman','man','nonbinary','woman']]]) {
    await assert.rejects(edit(db,a,gender,interests));
    await assert.rejects(db.query('update profiles set gender=$1,interested_in=$2 where id=$3',[gender,interests,a]));
    assert.equal((await state(db,a)).version,null);
  }
  const unchanged = await edit(db,a,'woman',['woman'],crypto.randomUUID());
  assert.equal(unchanged.status,'unchanged'); assert.equal(unchanged.version,null);
  let current = await edit(db,a,'woman',['woman','man','nonbinary']);
  assert.equal(current.status,'saved'); assert.ok(current.version);
  const deadline = current.available_at;
  assert.ok(Math.abs((deadline-current.server_now)-43200000)<1000);
  const order = await edit(db,a,'woman',['nonbinary','woman','man'],null);
  assert.equal(order.status,'unchanged'); assert.deepEqual(values(order),values(current));
  const conflict = await edit(db,a,'woman',['woman'],null);
  assert.equal(conflict.status,'stale'); assert.deepEqual(values(conflict),values(current));
  for (const interests of [['woman','man'],['woman']]) {
    const prior = current.version;
    current = await edit(db,a,'woman',interests,prior);
    assert.equal(current.status,'saved'); assert.notEqual(current.version,prior); assert.equal(current.available_at.getTime(),deadline.getTime());
  }
  for (const [gender,interests] of [['man',['woman']],['woman',['woman','man']],['nonbinary',['man']]]) {
    const refused = await edit(db,a,gender,interests,current.version);
    assert.equal(refused.status,'cooldown'); assert.deepEqual(values(refused),values(current));
    await assert.rejects(asUser(db,a,'update profiles set bio=$1,gender=$2,interested_in=$3 where id=$4',['No effect',gender,interests,a]),/cooldown/);
    assert.equal((await db.query('select bio from profiles where id=$1',[a])).rows[0].bio,null);
  }
  await asUser(db,a,"update profiles set bio='Independent' where id=$1",[a]);
  assert.deepEqual(values(await state(db,a)),values(current));
  await asUser(db,b,"update profiles set interested_in=array['man'] where id=$1",[a]);
  assert.deepEqual(values(await state(db,a)),values(current),'RLS prevents changing someone else');
  await assert.rejects(asUser(db,null,'select * from get_my_profile_edit_state()'));
  await assert.rejects(edit(db,null,'woman',['woman']));
  await assert.rejects(asUser(db,a,'select * from get_my_profile_edit_state($1)',[b]),/does not exist/);
  await assert.rejects(asUser(db,a,'select * from update_my_profile_preferences($1,$2,$3,$4)', ['woman',['woman'],null,b]),/does not exist/);
  await assert.rejects(asUser(db,a,'select * from private.profile_edit_state'));
  await assert.rejects(asUser(db,a,"update private.profile_edit_state set available_at=null"));
  await db.exec('set role anon');
  await assert.rejects(db.query('select * from get_my_profile_edit_state()'));
  await db.exec('reset role');
  assert.equal((await db.query("select count(*)::int n from pg_publication_tables where schemaname='private' and tablename='profile_edit_state'")).rows[0].n,0);

  // A first reduction must version the values without starting a wait.
  const fresh = crypto.randomUUID();
  await db.query('insert into auth.users values($1)',[fresh]);
  await db.query("insert into profiles(id,first_name,photo_url,gender,interested_in) values($1,'Test',$2,'woman',array['woman','man','nonbinary'])",[fresh,`${fresh}/test.jpg`]);
  const narrowed = await edit(db,fresh,'woman',['woman','man']);
  assert.equal(narrowed.status,'saved'); assert.ok(narrowed.version); assert.equal(narrowed.available_at,null);
  const mixed = await edit(db,fresh,'man',['man'],narrowed.version);
  assert.equal(mixed.status,'saved'); assert.ok(mixed.available_at);
  await assert.rejects(edit(db,fresh,'woman',['man'],'not-a-uuid'));

  // Direct authorized writes use the same guard. Bio-mixed refusals roll back likes too.
  await command(db,{actor:b,target:c,night,token:await token(db,b,venue,c)});
  const before = await db.query('select * from likes where liker_id=$1',[b]);
  let direct = await edit(db,b,'woman',['woman','man']);
  await assert.rejects(db.query("update profiles set gender='man' where id=$1",[b]),/cooldown/);
  assert.deepEqual((await db.query('select * from likes where liker_id=$1',[b])).rows,before.rows);
  await asUser(db,b,"update profiles set interested_in=array['man'] where id=$1",[b]);
  assert.equal((await db.query('select * from likes where liker_id=$1',[b])).rows.length,0);
  assert.notEqual((await state(db,b)).version,direct.version);

  // Existing matches survive incompatibility and can still be blocked.
  const f = await seedPair(adapter);
  await command(db,{actor:f.a,target:f.b,night:f.night,token:await token(db,f.a,f.venue,f.b)});
  const match = await command(db,{actor:f.b,target:f.a,night:f.night,token:await token(db,f.b,f.venue,f.a)});
  await edit(db,f.a,'man',['man']);
  assert.equal((await db.query('select id from matches where id=$1',[match.match_id])).rows.length,1);
  await db.exec(`alter table blocks enable row level security;
    grant select,insert on blocks to authenticated;
    create policy blocks_insert_own on blocks for insert to authenticated with check(blocker_id=auth.uid());
    create policy blocks_select_own on blocks for select to authenticated using(blocker_id=auth.uid());`);
  await asUser(db,f.a,'insert into blocks values($1,$2)',[f.a,f.b]);
  assert.equal((await db.query('select id from matches where id=$1',[match.match_id])).rows.length,0);

  // Exact comparison is strict (<), so a deadline equal to execution time allows.
  // A transaction begun before expiry must also allow once wall time has passed.
  await db.exec('begin');
  await db.query('update private.profile_edit_state set available_at=clock_timestamp() where profile_id=$1',[a]);
  current = await edit(db,a,'nonbinary',['man'],current.version);
  assert.equal(current.status,'saved');
  await db.exec('commit');
  await db.query('delete from presence where profile_id=$1',[a]);
  await db.query('delete from profiles where id=$1',[a]);
  assert.equal((await db.query('select * from private.profile_edit_state where profile_id=$1',[a])).rows.length,0);
  console.log('Profile preferences: validation, first edit, set equality, cooldown, reductions, versions, access, atomic cleanup and match safety passed.');
} finally { await db.close(); }
