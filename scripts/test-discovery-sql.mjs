import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
const sql = path => readFileSync(path, 'utf8');
await db.exec(sql('tests/helpers/photo-schema.sql'));
await db.exec(sql('supabase/migrations/20260908000001_photo_moderation.sql'));
// Install the current discovery policies and unused legacy function signatures.
await db.exec(`
  drop policy presence_read on public.presence;
  create policy presence_select_copresent on public.presence for select to authenticated using(true);
  create policy profiles_select_copresent on public.profiles for select to authenticated
    using(id in (select private.visible_profile_ids()));
  create policy profiles_select_admin on public.profiles for select to authenticated using(private.is_admin());
  create function public.set_venue_profile_preview(uuid,boolean) returns void language sql as $$select$$;
  create function private.can_like_preview_profile(uuid,uuid,uuid) returns boolean language sql as $$select true$$;
  grant execute on function private.visible_profile_ids() to authenticated;
  -- Deliberately model drift: migration must remove both column grants and publication.
  grant select(gender,interested_in) on profiles to authenticated;
  alter publication supabase_realtime add table profiles;
`);
await db.exec(sql('supabase/migrations/20260918000001_mutual_discovery_authorization.sql'));
const id = () => crypto.randomUUID();
const [viewer, candidate, founder, empty, venue, night, oldNight] = Array.from({length: 7}, id);
for (const user of [viewer, candidate, founder, empty]) await db.query('insert into auth.users values($1)', [user]);
for (const user of [viewer, candidate]) {
  await db.query(`insert into profiles(id,first_name,photo_url,gender,interested_in)
    values($1,'Test',$2,'woman',array['woman'])`, [user, `${user}/${id()}.jpg`]);
  await db.query(`insert into storage.objects(bucket_id,name) select 'profile-photos',photo_url from profiles where id=$1`, [user]);
}
await db.query('insert into admins values($1)', [founder]);
await db.query('insert into venues(id) values($1)', [venue]);
await db.query('insert into venue_nights(id,venue_id) values($1,$3),($2,$3)', [night, oldNight, venue]);
await db.query(`insert into presence(profile_id,venue_id,venue_night_id) values($1,$3,$4),($2,$3,$4)`, [viewer,candidate,venue,night]);
await db.query(`insert into presence(profile_id,venue_id,venue_night_id,left_at) values($1,$2,$3,now())`, [candidate,venue,oldNight]);
async function asUser(user, query, values = []) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? '']);
  await db.exec('set role authenticated');
  try { return (await db.query(query, values)).rows; }
  finally { await db.exec('reset role'); }
}
const cards = () => asUser(viewer, 'select id from profiles where id=$1', [candidate]);
const feed = () => asUser(viewer, 'select p.id from presence pr join profiles p on p.id=pr.profile_id where p.id=$1', [candidate]);
const photo = () => asUser(viewer, 'select name from storage.objects where name=(select public.profile_photo_source($1))', [candidate]);
const knownPath = (await db.query('select photo_url from profiles where id=$1', [candidate])).rows[0].photo_url;
async function expectDiscovery(visible) {
  assert.equal((await cards()).length, Number(visible));
  assert.equal((await feed()).length, Number(visible));
  assert.equal((await photo()).length, Number(visible));
  assert.equal((await asUser(viewer, 'select name from storage.objects where name=$1', [knownPath])).length, Number(visible));
}
// All gender pairs and every nonempty preference set, in both directions.
const genders = ['woman','man','nonbinary'];
const sets = Array.from({length:7},(_,i)=>genders.filter((_,bit)=>(i+1)&(1<<bit)));
for (const a of genders) for (const b of genders) for (const ai of sets) for (const bi of sets) {
  await db.query('update profiles set gender=$1,interested_in=$2 where id=$3',[a,ai,viewer]);
  await db.query('update profiles set gender=$1,interested_in=$2 where id=$3',[b,bi,candidate]);
  const compatible = ai.includes(b) && bi.includes(a);
  assert.equal((await cards()).length, Number(compatible), JSON.stringify({a,b,ai,bi}));
  assert.equal((await feed()).length, Number(compatible));
}
await db.query("update profiles set gender='woman',interested_in=array['woman']");
await expectDiscovery(true);
// Even a compatible participant cannot project, filter, order, or return preferences.
for (const query of [
  'select gender from profiles', 'select interested_in from profiles', 'select * from profiles',
  "select id from profiles where gender='woman'", "select id from profiles where interested_in @> array['woman']",
  'select id from profiles order by gender', 'select row_to_json(p) from profiles p',
  'update profiles set gender=gender where id=auth.uid()',
  "update profiles set gender='woman' where id=auth.uid() returning interested_in",
]) await assert.rejects(asUser(viewer,query), /permission denied/);
assert.equal((await asUser(viewer,'select * from get_my_profile()'))[0].id,viewer);
assert.deepEqual((await asUser(viewer,'select * from get_my_profile()'))[0].interested_in,['woman']);
assert.equal((await asUser(empty,'select * from get_my_profile()')).length,0);
await assert.rejects(asUser(null,'select * from get_my_profile()'),/not authenticated/);
assert.equal((await db.query("select has_function_privilege('anon','public.get_my_profile()','execute') allowed")).rows[0].allowed,false);
await asUser(viewer,"update profiles set first_name='Edited',gender='woman',interested_in=array['woman','man'] where id=auth.uid()");
assert.equal((await asUser(viewer,'select * from get_my_profile()'))[0].first_name,'Edited');
// Departures, hidden state, photo corrections and blocks all remove discovery.
for (const user of [viewer,candidate]) {
  for (const [change,restore] of [
    ['is_visible=false','is_visible=true'],['left_at=now()','left_at=null'],
  ]) {
    await db.query(`update presence set ${change} where profile_id=$1 and venue_night_id=$2`,[user,night]);
    await expectDiscovery(false);
    await db.query(`update presence set ${restore} where profile_id=$1 and venue_night_id=$2`,[user,night]);
  }
  await db.query('update photo_state set correction_required=true where profile_id=$1',[user]);
  await expectDiscovery(false);
  await db.query('update photo_state set correction_required=false where profile_id=$1',[user]);
  await db.query('insert into blocks values($1,$2)',[user,user===viewer?candidate:viewer]);
  await expectDiscovery(false);
  await db.exec('delete from blocks');
}
// Copresence must be in the same live night, not merely the same venue.
await db.query('update presence set venue_night_id=$1 where profile_id=$2 and left_at is null',[oldNight,candidate]);
await expectDiscovery(false);
await db.query('update presence set venue_night_id=$1 where profile_id=$2 and left_at is null',[night,candidate]);
// Established matches survive preference edits and departure, but never reenter feed.
await db.query('insert into matches(profile_a,profile_b,venue_night_id) values($1,$2,$3)',[viewer,candidate,night]);
await db.query("update profiles set interested_in=array['man'] where id=$1",[candidate]);
assert.equal((await cards()).length,1);
assert.equal((await feed()).length,0);
assert.equal((await photo()).length,1);
await db.query('update presence set left_at=now() where profile_id=$1',[candidate]);
assert.equal((await cards()).length,1);
assert.equal((await photo()).length,1);
// Owner historical attendance remains available for #263 departure confirmation.
assert.equal((await asUser(candidate,'select id,left_at from presence')).length,2);
for (const user of [viewer,candidate]) {
  await db.query('insert into blocks values($1,$2)',[user,user===viewer?candidate:viewer]);
  await expectDiscovery(false);
  await db.exec('delete from blocks');
}
await db.query('update photo_state set correction_required=true where profile_id=$1',[candidate]);
assert.equal((await cards()).length,1);
assert.equal((await photo()).length,0);
assert.equal((await asUser(founder,'select id from profiles')).length,2);
assert.equal((await asUser(founder,'select name from storage.objects where name=$1',[knownPath])).length,1);
assert.ok((await asUser(founder,'select * from admin_photo_queue()')).length);
await assert.rejects(asUser(viewer,'select * from admin_photo_queue()'),/not authorized/);
for (const [change,restore] of [
  ["status='waiting'","status='live'"], ["status='closed'","status='live'"],
  ['closes_at=now()-interval \'1 second\'','closes_at=now()+interval \'1 day\''],
  ['terminal_at=now()','terminal_at=null'],
]) {
  await db.query(`update venue_nights set ${change} where id=$1`,[night]);
  await expectDiscovery(false);
  await db.query(`update venue_nights set ${restore} where id=$1`,[night]);
}
for (const signature of ['public.preview_room_profiles(uuid)','public.set_venue_profile_preview(uuid,boolean)','private.can_like_preview_profile(uuid,uuid,uuid)']) {
  assert.equal((await db.query('select to_regprocedure($1) fn',[signature])).rows[0].fn,null);
}
await assert.rejects(db.query('update venues set profile_preview_enabled=true'), /venues_profile_preview_disabled/);
assert.equal((await db.query("select * from pg_publication_tables where tablename='profiles'")).rows.length,0);
assert.equal((await db.query("select * from pg_publication_tables where attnames && array['gender','interested_in']::name[]")).rows.length,0);
await db.close();
console.log('Discovery SQL: 441 compatibility combinations, column privacy, owner edits, photos, matches, blocks, expiry and retired preview passed.');
