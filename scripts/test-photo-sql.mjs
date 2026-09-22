import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
// Minimal pre-migration substrate. These tests execute PostgreSQL transactions,
// grants, RLS and the actual migration; Supabase Storage/Realtime need E2E too.
await db.exec(readFileSync(new URL('../tests/helpers/photo-schema.sql',import.meta.url),'utf8'));
const ids = Array.from({length:6},(_,i)=>`00000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`);
const [alice,bob,carol,founder,otherFounder,newUser]=ids;
for (const id of ids) await db.query('insert into auth.users values($1)',[id]);
// Shared synthetic URLs must survive backfill without being given approval.
for (const id of [alice,bob,carol]) await db.query("insert into public.profiles(id,first_name,photo_url,gender,interested_in) values($1,'Test','/test-profiles/portrait-1.svg','woman',array['man'])",[id]);
await db.exec(readFileSync(new URL('../supabase/migrations/20260908000001_photo_moderation.sql',import.meta.url),'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20260909000001_photo_conflict_status.sql',import.meta.url),'utf8'));
// Exercise #77's submission guard with #194's actual transitions and privileges.
// Load the real shared helper definitions; the complete text migration has its
// own substrate in test-input-validation-sql.mjs.
const inputContract=readFileSync('supabase/migrations/20260909000003_input_validation_contract.sql','utf8');
await db.exec(inputContract.split('-- Runs before existing workflow triggers:')[0]);
// Exercise the actual profile trigger/CHECK statements together with #194's
// transitions. Other #77 table constraints run in test-input-validation-sql.
await db.exec(`alter table profiles add constraint profiles_first_name_check check(length(trim(first_name)) between 1 and 50),
  add constraint profiles_bio_check check(length(bio)<=500),
  add constraint profiles_interested_in_check check(cardinality(interested_in) between 1 and 3);`);
await db.exec(inputContract.slice(inputContract.indexOf('create or replace function private.normalize_profile_inputs()'),inputContract.indexOf('create or replace function private.normalize_message_input()')));
await db.exec(inputContract.slice(inputContract.indexOf('alter table public.profiles drop constraint'),inputContract.indexOf('alter table public.messages drop constraint')));
await db.exec(readFileSync('supabase/migrations/20260911000001_validate_photo_submission_inputs.sql','utf8'));
const bioMigration=readFileSync('supabase/migrations/20260914000001_limit_profile_bio_to_300.sql','utf8');
await db.query('update profiles set bio=$1 where id=$2',['x'.repeat(301),alice]);
await assert.rejects(()=>db.exec(bioMigration),/migration blocked/);
assert.equal((await db.query('select bio from profiles where id=$1',[alice])).rows[0].bio,'x'.repeat(301));
await db.query('update profiles set bio=null where id=$1',[alice]);
await db.exec(bioMigration);
for (const value of [null,'', ' \ufeff', 'a'.repeat(299), '😀'.repeat(300), '\ufeff'+'😀'.repeat(300)+'\u00a0']) {
  await db.query('update profiles set bio=$1 where id=$2',[value,alice]);
  assert.equal((await db.query('select bio from profiles where id=$1',[alice])).rows[0].bio,value?.trim() || null);
}
const savedBio=(await db.query('select bio from profiles where id=$1',[alice])).rows[0].bio;
await assert.rejects(()=>db.query('update profiles set bio=$1 where id=$2',['😀'.repeat(301),alice]),/bio_too_long/);
assert.equal((await db.query('select bio from profiles where id=$1',[alice])).rows[0].bio,savedBio);
await assert.rejects(()=>db.query('update profiles set bio=$1 where id=$2',[' '.repeat(16384)+'x',alice]),/invalid profile input/);

await db.exec(readFileSync('supabase/migrations/20260915000001_private_photo_staging.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20260921000001_photo_crop_sources.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20260922000003_independent_round_photos.sql','utf8'));
await db.exec('create policy profiles_read on public.profiles for select to authenticated using(id in (select private.visible_profile_ids()));');
const state=async id=>(await db.query('select * from public.photo_state where profile_id=$1',[id])).rows[0];
const asUser=async(id,fn)=>{ await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');try{return await fn();}finally{await db.exec('reset role');}};
const decide=async(actor,owner,version,revision,action,reason=null)=>asUser(actor,()=>db.query('select public.decide_profile_photo($1,$2,$3,$4,$5)',[owner,version,revision,action,reason]));
const path=owner=>`${owner}/${crypto.randomUUID()}.jpg`;
async function submit(owner,revision,profile=null){const key=path(owner);await db.query("insert into storage.objects(bucket_id,name,metadata) values('profile-photos',$1,'{\"size\":10,\"mimetype\":\"image/jpeg\"}')",[key]);return (await db.query('select public.submit_profile_photo($1,$2,$3,$4) as id',[owner,key,revision,profile])).rows[0].id;}
await db.query('insert into public.admins values($1),($2)',[founder,otherFounder]);
assert.equal((await state(alice)).correction_required,false);
assert.equal((await db.query("select count(*)::int n from public.photo_versions where status='unverified'")).rows[0].n,3);
await assert.rejects(asUser(alice,()=>db.query("update public.profiles set photo_url='forged' where id=$1",[alice])),/permission denied/);
await assert.rejects(asUser(alice,()=>db.query("select public.submit_profile_photo($1,'fake',0)",[bob])),/permission denied/);
await assert.rejects(asUser(alice,()=>db.exec("insert into public.photo_audit(profile_id,version_id,action) values(gen_random_uuid(),gen_random_uuid(),'approved')")),/permission denied/);
let original=(await state(alice)).displayed_id;
let pending=await submit(alice,0);
assert.equal((await state(alice)).displayed_id,original);
assert.equal((await state(alice)).pending_id,pending);
assert.equal((await asUser(bob,()=>db.query('select * from public.photo_versions where profile_id=$1',[alice]))).rows.length,0);
assert.equal((await asUser(bob,()=>db.query('select * from public.photo_state where profile_id=$1',[alice]))).rows.length,0);
await assert.rejects(decide(bob,alice,pending,1,'approved'),/not authorized/);
await decide(founder,alice,pending,1,'rejected','multiple_people');
assert.equal((await state(alice)).displayed_id,original);
assert.equal((await state(alice)).correction_required,false);
assert.equal((await state(alice)).pending_id,null);
assert.equal((await state(alice)).reason,'multiple_people');
await assert.rejects(decide(otherFounder,alice,pending,1,'approved'),/stale/);
await assert.rejects(decide(founder,alice,original,null,'approved'),/stale/);
// Matched directional likes survive. Unmatched likes in both directions go.
const night='10000000-0000-0000-0000-000000000001';const venue='20000000-0000-0000-0000-000000000001';
await db.query('insert into public.venues(id) values($1)',[venue]);
await db.query('insert into public.venue_nights(id,venue_id) values($1,$2)',[night,venue]);
for(const id of [alice,bob,carol]) await db.query('insert into public.presence(profile_id,venue_id,venue_night_id) values($1,$2,$3)',[id,venue,night]);
await db.query('insert into public.matches(profile_a,profile_b,venue_night_id) values($1,$2,$3)',[alice,bob,night]);
for(const pair of [[alice,bob],[bob,alice],[alice,carol],[carol,alice]])await db.query('insert into public.likes(liker_id,liked_id,venue_night_id) values($1,$2,$3)',[...pair,night]);
await decide(founder,alice,original,2,'rejected','face_unclear');
assert.equal((await state(alice)).correction_required,true);
assert.equal((await db.query('select photo_url from public.profiles where id=$1',[alice])).rows[0].photo_url,null);
assert.equal((await db.query('select count(*)::int n from public.likes')).rows[0].n,2);
assert.equal((await db.query('select count(*)::int n from public.matches')).rows[0].n,1);
assert.equal((await asUser(carol,()=>db.query('select * from public.presence where profile_id=$1',[alice]))).rows.length,0);
await assert.rejects(asUser(alice,()=>db.query('insert into public.likes(liker_id,liked_id,venue_night_id) values($1,$2,$3)',[alice,carol,night])),/correction required/);
await assert.rejects(asUser(carol,()=>db.query('insert into public.likes(liker_id,liked_id,venue_night_id) values($1,$2,$3)',[carol,alice,night])),/correction required/);
pending=await submit(alice,3);await decide(alice,alice,pending,4,'cancelled');assert.equal((await state(alice)).correction_required,true);
pending=await submit(alice,5);const next=await submit(alice,6);
await assert.rejects(decide(founder,alice,pending,6,'approved'),/stale/);
await db.query('update public.presence set is_visible=false where profile_id=$1',[alice]);
await decide(otherFounder,alice,next,7,'approved');
assert.equal((await state(alice)).correction_required,false);
assert.equal((await state(alice)).displayed_id,next);
assert.equal((await db.query('select is_visible from public.presence where profile_id=$1',[alice])).rows[0].is_visible,false);
// Approval never creates a presence, including a first photo outside a night.
await submit(newUser,0,{first_name:'New',gender:'woman',interested_in:['man'],adult_confirmed:true});
const created=await state(newUser);await decide(founder,newUser,created.displayed_id,1,'approved');
assert.equal((await db.query('select * from public.presence where profile_id=$1',[newUser])).rows.length,0);
const queue=await asUser(founder,()=>db.query('select * from public.admin_photo_queue()'));
assert.ok(queue.rows.every(row=>row.displayed_status==='unverified'||row.pending_id||row.correction_required));
// Retention never removes a usable displayed version or active submission.
await db.exec("update storage.objects set created_at=now()-interval '2 days'");
const expired=(await db.query('select public.expired_profile_photo_paths() path')).rows.map(row=>row.path);
const activePath=(await db.query('select path from public.photo_versions where id=$1',[next])).rows[0].path;
assert.ok(!expired.includes(activePath));assert.ok(expired.length>=3);
// Rejection followed by approval must never revive a departure or a closed night.
await decide(founder,alice,next,8,'rejected','violent');
await db.query('update public.presence set left_at=now() where profile_id=$1',[alice]);
const outside=await submit(alice,9);await decide(founder,alice,outside,10,'approved');
assert.ok((await db.query('select left_at from public.presence where profile_id=$1',[alice])).rows[0].left_at);
await db.query("update public.venue_nights set status='closed' where id=$1",[night]);
await asUser(carol,async()=>assert.equal((await db.query('select * from public.preview_room_profiles($1)',[venue])).rows.length,0));
// Real SQL queue ordering: correction, first unverified, voluntary replacement.
const carolState=await state(carol);
await decide(founder,carol,carolState.displayed_id,carolState.revision,'rejected','multiple_people');
await submit(carol,(await state(carol)).revision);
await submit(alice,(await state(alice)).revision);
const ordered=(await asUser(founder,()=>db.query('select * from public.admin_photo_queue()'))).rows;
assert.equal(ordered[0].profile_id,carol);
assert.equal(ordered[1].profile_id,bob);
assert.equal(ordered[2].profile_id,alice);
// A closed night cannot be used to preview or read an otherwise unrelated photo.
await asUser(carol,async()=>assert.equal((await db.query('select public.profile_photo_source($1) source',[bob])).rows[0].source,null));
// Malformed profile JSON must fail before profile creation or photo-state effects.
const inputOwner=crypto.randomUUID();
await db.query('insert into auth.users values($1)',[inputOwner]);
const inputPath=path(inputOwner);
await db.query("insert into storage.objects(bucket_id,name,metadata) values('profile-photos',$1,'{\"size\":10,\"mimetype\":\"image/jpeg\"}')",[inputPath]);
const inputProfile={first_name:'New',bio:null,gender:'woman',interested_in:['man'],adult_confirmed:true};
const snapshot=async()=> (await db.query(`select jsonb_build_object(
  'profiles',(select jsonb_agg(to_jsonb(p) order by id) from profiles p),
  'state',(select jsonb_agg(to_jsonb(s) order by profile_id) from photo_state s),
  'versions',(select jsonb_agg(to_jsonb(v) order by id) from photo_versions v),
  'audit',(select jsonb_agg(to_jsonb(a) order by id) from photo_audit a),
  'invalidation',(select jsonb_agg(to_jsonb(i) order by profile_id) from photo_invalidation i)) value`)).rows[0].value;
const beforeInput=await snapshot();
for(const profile of [null,[],{},'null', {...inputProfile,first_name:77}, {...inputProfile,first_name:'😀'.repeat(31)},
  {...inputProfile,bio:{}}, {...inputProfile,adult_confirmed:'true'},
  {...inputProfile,gender:null}, {...inputProfile,interested_in:['man','man']}, {...inputProfile,interested_in:[['man']]},
  {...inputProfile,interested_in:[null]}, {...inputProfile,extra:true}, {...inputProfile,first_name:' '.repeat(16384)+'x'}]) {
  await assert.rejects(()=>db.query('select submit_profile_photo($1,$2,0,$3)',[inputOwner,inputPath,JSON.stringify(profile)]),/invalid photo profile/);
  assert.deepEqual(await snapshot(),beforeInput);
}
for (const bio of ['x'.repeat(301),'😀'.repeat(301)]) {
  await assert.rejects(()=>db.query('select submit_profile_photo($1,$2,0,$3)',[inputOwner,inputPath,JSON.stringify({...inputProfile,bio})]),/bio_too_long/);
  assert.deepEqual(await snapshot(),beforeInput);
}
for(const [owner,key,revision] of [[null,inputPath,0],[inputOwner,null,0],[inputOwner,inputPath,null],[inputOwner,inputPath,-1],[inputOwner,`${inputOwner}/x.jpg`,0]]) {
  await assert.rejects(()=>db.query('select submit_profile_photo($1,$2,$3)',[owner,key,revision]),/invalid photo submission/);
  assert.deepEqual(await snapshot(),beforeInput);
}
await db.query('select submit_profile_photo($1,$2,0,$3)',[inputOwner,inputPath,JSON.stringify({...inputProfile,first_name:'😀'.repeat(30),bio:'😀'.repeat(300)})]);
assert.ok((await state(inputOwner)).displayed_id);
// Staging stays private; only the service can enumerate expired uploads.
const stagingBucket=(await db.query("select * from storage.buckets where id='profile-photo-staging'")).rows[0];
assert.equal(stagingBucket.public,false);
assert.equal(Number(stagingBucket.file_size_limit),5242880);
const abandoned=path(inputOwner), recent=path(inputOwner);
await db.query("insert into storage.objects(bucket_id,name,created_at) values('profile-photo-staging',$1,now()-interval '4 hours'),('profile-photo-staging',$2,now())",[abandoned,recent]);
await asUser(inputOwner,async()=>{
  assert.equal((await db.query("select * from storage.objects where bucket_id='profile-photo-staging'")).rows.length,0);
  await assert.rejects(()=>db.query('select public.expired_profile_photo_staging_paths()'),/permission denied/);
});
await db.exec('set role service_role');
assert.deepEqual((await db.query('select public.expired_profile_photo_staging_paths() path')).rows.map(row=>row.path),[abandoned]);
await db.exec('reset role');
// Lossless output may exceed the source cap, but never exceeds 50 MiB.
const largeOutput=path(inputOwner);
await db.query("insert into storage.objects(bucket_id,name,metadata) values('profile-photos',$1,$2)",[largeOutput,JSON.stringify({size:52428800,mimetype:'image/png'})]);
await db.query('select submit_profile_photo($1,$2,$3)',[inputOwner,largeOutput,(await state(inputOwner)).revision]);
const beforeOversized=await snapshot();
await db.query("update storage.objects set metadata=jsonb_set(metadata,'{size}','52428801') where name=$1",[largeOutput]);
await assert.rejects(async()=>db.query('select submit_profile_photo($1,$2,$3)',[inputOwner,largeOutput,(await state(inputOwner)).revision]),/invalid photo file/);
assert.deepEqual(await snapshot(),beforeOversized);

// Original source privacy, crop constraints, revision atomicity and shared retention.
const cropOwner = newUser;
const sourceKey = path(cropOwner);
await db.query("insert into storage.objects(bucket_id,name,metadata) values('profile-photo-sources',$1,'{\"size\":100,\"mimetype\":\"image/jpeg\"}')",[sourceKey]);
const portrait = {x:20,y:0,width:60,height:100};
const circle = {x:0,y:20,width:100,height:60};
async function submitCrop(revision, from=null, crop=portrait, round=circle, key=sourceKey) {
  const output = path(cropOwner);
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('profile-photos',$1,'{\"size\":100,\"mimetype\":\"image/png\"}')",[output]);
  return (await db.query('select public.submit_profile_photo_crop($1,$2,$3,$4,1000,1000,600,1000,$5,$6,$7) id',
    [cropOwner,output,revision,key,JSON.stringify(crop),JSON.stringify(round),from])).rows[0].id;
}
const beforeCrop = await snapshot();
for (const invalid of [{...portrait,x:-1},{...portrait,width:101},{...portrait,height:0},{...portrait,x:'NaN'},{...portrait,extra:1},[],{}]) {
  await assert.rejects(async()=>submitCrop((await state(cropOwner)).revision,null,invalid),/invalid photo crop/);
  assert.deepEqual(await snapshot(),beforeCrop);
}
await assert.rejects(async()=>submitCrop((await state(cropOwner)).revision,null,portrait,{x:0,y:0,width:100,height:100}),/invalid round crop/);
const firstCrop = await submitCrop((await state(cropOwner)).revision);
let cropState = await state(cropOwner);
assert.equal(cropState.pending_id,firstCrop);
await decide(founder,cropOwner,firstCrop,cropState.revision,'approved');
const secondCrop = await submitCrop((await state(cropOwner)).revision,firstCrop);
await assert.rejects(()=>db.query('update photo_versions set round_crop=$1 where id=$2',[JSON.stringify({x:0,y:0,width:100,height:100}),secondCrop]),/photo_round_square/);
await assert.rejects(()=>db.query('update photo_versions set portrait_crop=$1 where id=$2',[JSON.stringify({x:0,y:0,width:101,height:100}),secondCrop]),/photo_crop_bounds/);
const beforeStale = await snapshot();
await assert.rejects(()=>submitCrop(0,firstCrop),/stale/);
assert.deepEqual(await snapshot(),beforeStale);
await assert.rejects(async()=>submitCrop((await state(cropOwner)).revision,original),/invalid recrop/);
await db.query('insert into public.matches(profile_a,profile_b,venue_night_id) values($1,$2,$3)',[cropOwner,bob,night]);
for (const actor of [cropOwner,bob,founder]) await asUser(actor,async()=>{
  assert.equal((await db.query("select * from storage.objects where bucket_id='profile-photo-sources'")).rows.length,0);
  await assert.rejects(()=>db.query('select public.expired_profile_photo_source_paths()'),/permission denied/);
  await assert.rejects(()=>db.query('select public.submit_profile_photo_crop($1,$2,0,$2,1,1,1,1)',[actor,sourceKey]),/permission denied/);
});
const presentation = (await asUser(cropOwner,()=>db.query('select public.profile_photo_presentation($1) value',[cropOwner]))).rows[0].value;
assert.deepEqual(presentation.roundCrop,circle);
assert.equal(presentation.source,(await db.query('select path from photo_versions where id=$1',[firstCrop])).rows[0].path);
assert.ok(!JSON.stringify(presentation).includes(sourceKey));
// A pending replacement does not change the displayed projection.
await decide(founder,cropOwner,secondCrop,(await state(cropOwner)).revision,'rejected','face_unclear');
assert.deepEqual((await asUser(cropOwner,()=>db.query('select public.profile_photo_presentation($1) value',[cropOwner]))).rows[0].value,presentation);
// The independent round can include source pixels outside the main portrait.
// This substrate originally exposes only auth.uid(). Model the matched viewer
// here; the complete discovery helper is covered by test-discovery-sql.mjs.
await db.exec(`create or replace function private.visible_profile_ids() returns setof uuid language sql stable as $$
  select auth.uid() union select case when profile_a=auth.uid() then profile_b else profile_a end
  from public.matches where auth.uid() in (profile_a,profile_b) and expires_at>now()
$$;`);
const fullSquare = {x:0,y:0,width:100,height:100};
async function submitFraming(revision, round=fullSquare, side=1000) {
  const output=path(cropOwner), roundPath=path(cropOwner).replace('.jpg','.png');
  for (const [bucket,key] of [['profile-photos',output],['profile-photo-rounds',roundPath]]) {
    await db.query("insert into storage.objects(bucket_id,name,metadata) values($1,$2,'{\"size\":100,\"mimetype\":\"image/png\"}')",[bucket,key]);
  }
  const result=await db.query('select public.submit_profile_photo_framing($1,$2,$3,$4,1000,1000,600,1000,$5,$6,$7,$8,$9) id',
    [cropOwner,output,revision,sourceKey,roundPath,JSON.stringify(round),side,JSON.stringify(portrait),firstCrop]);
  return {id:result.rows[0].id,path:roundPath};
}
const beforeIndependent=await snapshot();
for (const invalid of [{...fullSquare,x:-1},{...fullSquare,height:50},{...fullSquare,width:101},{...fullSquare,x:'NaN'}]) {
  await assert.rejects(async()=>submitFraming((await state(cropOwner)).revision,invalid),/invalid round crop/);
  assert.deepEqual(await snapshot(),beforeIndependent);
}
await assert.rejects(async()=>submitFraming((await state(cropOwner)).revision,fullSquare,999),/invalid round crop/);
await assert.rejects(()=>submitFraming(0),/stale/);
assert.deepEqual(await snapshot(),beforeIndependent);
const independent=await submitFraming((await state(cropOwner)).revision);
for (const actor of [cropOwner,founder]) await asUser(actor,async()=>{
  assert.equal((await db.query("select name from storage.objects where bucket_id='profile-photo-rounds' and name=$1",[independent.path])).rows.length,1);
});
await asUser(bob,async()=>{
  assert.equal((await db.query("select name from storage.objects where bucket_id='profile-photo-rounds' and name=$1",[independent.path])).rows.length,0);
  await assert.rejects(()=>db.query('select public.expired_profile_photo_round_paths()'),/permission denied/);
  await assert.rejects(()=>db.query('select public.admin_photo_framing()'),/not admin|not authorized|forbidden|permission|founder/i);
});
const queued=(await asUser(founder,()=>db.query('select public.admin_photo_framing(null,$1) value',[cropOwner]))).rows[0].value;
assert.equal(queued.pending_round_path,independent.path);
await decide(founder,cropOwner,independent.id,(await state(cropOwner)).revision,'approved');
const independentProjection=(await asUser(bob,()=>db.query('select public.profile_photo_presentation($1) value',[cropOwner]))).rows[0].value;
assert.equal(independentProjection.roundSource,independent.path);
assert.equal(independentProjection.roundCrop,null);
assert.ok(!JSON.stringify(independentProjection).includes(sourceKey));
await asUser(bob,async()=>{
  assert.equal((await db.query("select name from storage.objects where bucket_id='profile-photo-rounds' and name=$1",[independent.path])).rows.length,1);
  assert.equal((await db.query("select name from storage.objects where bucket_id='profile-photo-sources'")).rows.length,0);
});
await assert.rejects(()=>db.query('update photo_versions set round_source_crop=$1 where id=$2',[JSON.stringify({...fullSquare,height:50}),independent.id]),/photo_round_source/);
await db.query("update storage.objects set created_at=now()-interval '2 days' where bucket_id in ('profile-photo-sources','profile-photo-rounds')");
assert.ok(!(await db.query('select public.expired_profile_photo_round_paths() path')).rows.some(row=>row.path===independent.path));
assert.deepEqual((await db.query('select public.expired_profile_photo_source_paths() path')).rows,[]);
await db.query('delete from public.profiles where id=$1',[cropOwner]);
assert.deepEqual((await db.query('select public.expired_profile_photo_source_paths() path')).rows.map(row=>row.path),[sourceKey]);
assert.ok((await db.query('select public.expired_profile_photo_round_paths() path')).rows.some(row=>row.path===independent.path));
console.log('Crop SQL: private sources, pixel-square bounds, atomic revisions, moderation projection and shared-source retention passed.');
await db.close();
console.log('Photo SQL migration, grants, privacy, transitions, stale reviews, likes, return and retention passed.');
