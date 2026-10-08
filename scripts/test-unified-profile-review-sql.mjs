import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { read, seedPair, token, command } from './like-test-database.mjs';
import { asUser } from './name-test-database.mjs';
import { installTextModerationSchema } from './text-moderation-test-database.mjs';

// Execute the actual migration on an isolated Auth/RLS foundation. No shared DB.
const db = new PGlite();
const adapter = { query: (sql,args) => args ? db.query(sql,args) : db.exec(sql).then(results => results.at(-1)) };
try {
  await installTextModerationSchema(adapter);
  const legacy = await seedPair(adapter);
  await db.query('insert into admins values($1)',[legacy.c]);
  await asUser(db,legacy.a,"update profiles set bio='Rejected legacy bio' where id=$1",[legacy.a]);
  const legacyState=(await asUser(db,legacy.a,'select * from my_text_corrections()')).find(s=>s.field==='bio');
  await asUser(db,legacy.c,'select require_profile_text_correction($1,$2,$3,$4,$5)',[legacy.a,'bio',legacyState.revision,'harassment',legacy.night]);
  const required=(await asUser(db,legacy.a,'select * from my_text_corrections()')).find(s=>s.field==='bio');
  await asUser(db,legacy.a,'select submit_bio_correction($1,$2,$3)',[crypto.randomUUID(),'Legacy draft ready to submit',required.revision]);
  const legacyPhoto = await seedPair(adapter);
  await db.query('insert into admins values($1)',[legacyPhoto.c]);
  // Reproduce historical data from before photo reasons became mandatory.
  await db.query("update photo_versions set status='rejected' where profile_id=$1",[legacyPhoto.a]);
  await db.query('update photo_state set correction_required=true,reason=null,displayed_id=null,pending_id=null where profile_id=$1',[legacyPhoto.a]);
  await db.query('update profiles set photo_url=null where id=$1',[legacyPhoto.a]);
  await db.exec(read('supabase/migrations/20261003000001_unified_profile_review.sql'));
  const adopted=(await asUser(db,legacy.a,'select my_profile_review() data'))[0].data;
  assert.equal(adopted.canSubmit,true,'cutover retains an existing correction draft');
  assert.deepEqual(adopted.fields,[{field:'bio',reason:'harassment'}]);
  assert.equal(adopted.status,'awaiting_changes','cutover requires explicit profile submission');
  await asUser(db,legacy.a,'select submit_profile_review($1)',[adopted.revision]);
  await asUser(db,legacy.c,'select approve_profile_review($1,$2,$3)',[legacy.a,legacy.venue,adopted.revision]);
  let oldPhoto=(await asUser(db,legacyPhoto.a,'select my_profile_review() data'))[0].data;
  assert.deepEqual(oldPhoto.fields,[{field:'photo',reason:'legacy_unknown'}]);
  assert.equal(oldPhoto.status,'awaiting_changes');
  assert.equal(oldPhoto.canSubmit,false);
  assert.equal(await token(adapter,legacyPhoto.b,legacyPhoto.venue,legacyPhoto.a),undefined,'missing legacy reason never clears discovery hold');
  const oldText=(await asUser(db,legacyPhoto.a,'select * from my_text_corrections()')).find(s=>s.field==='bio');
  await asUser(db,legacyPhoto.a,"update profiles set bio='Legacy published bio' where id=$1",[legacyPhoto.a]);
  const publishedText=(await asUser(db,legacyPhoto.a,'select * from my_text_corrections()')).find(s=>s.field==='bio');
  assert.notEqual(oldText.revision,publishedText.revision);
  await asUser(db,legacyPhoto.c,'select require_profile_text_correction($1,$2,$3,$4,$5)',[legacyPhoto.a,'bio',publishedText.revision,'harassment',legacyPhoto.night]);
  oldPhoto=(await asUser(db,legacyPhoto.a,'select my_profile_review() data'))[0].data;
  assert.deepEqual(oldPhoto.fields,[{field:'bio',reason:'harassment'},{field:'photo',reason:'legacy_unknown'}],'later report corrections retain the historical photo requirement');
  const legacyPending=crypto.randomUUID();
  await db.query("insert into photo_versions(id,profile_id,path,status) values($1,$2,$3,'unverified')",[legacyPending,legacyPhoto.a,`${legacyPhoto.a}/${legacyPending}.jpg`]);
  await db.query('update photo_state set pending_id=$1,revision=revision+1 where profile_id=$2',[legacyPending,legacyPhoto.a]);
  const requiredText=(await asUser(db,legacyPhoto.a,'select * from my_text_corrections()')).find(s=>s.field==='bio');
  await asUser(db,legacyPhoto.a,'select submit_bio_correction($1,$2,$3)',[crypto.randomUUID(),'Legacy revised bio',requiredText.revision]);
  oldPhoto=(await asUser(db,legacyPhoto.a,'select my_profile_review() data'))[0].data;
  assert.equal(oldPhoto.canSubmit,true);
  assert.equal(oldPhoto.status,'awaiting_changes');
  await asUser(db,legacyPhoto.a,'select submit_profile_review($1)',[oldPhoto.revision]);
  assert.equal(await token(adapter,legacyPhoto.b,legacyPhoto.venue,legacyPhoto.a),undefined);
  await asUser(db,legacyPhoto.c,'select approve_profile_review($1,$2,$3)',[legacyPhoto.a,legacyPhoto.venue,oldPhoto.revision]);
  assert.equal((await asUser(db,legacyPhoto.a,'select my_profile_review() data'))[0].data,null);
  assert.ok(await token(adapter,legacyPhoto.b,legacyPhoto.venue,legacyPhoto.a));
  const f = await seedPair(adapter);
  const other = await seedPair(adapter);
  await db.query('insert into admins values($1)',[f.c]);
  const admin = (sql,args=[]) => asUser(db,f.c,sql,args);
  const queue = async (venue=f.venue,filter='needs_review') => (await admin('select admin_profile_reviews($1,$2) data',[venue,filter]))[0].data;
  const current = async (id=f.a,filter='all') => (await queue(f.venue,filter)).profiles.find(p=>p.id===id);
  const mine = async (owner=f.a) => (await asUser(db,owner,'select my_profile_review() data'))[0].data;
  const approve = async (id=f.a,revision) => admin('select approve_profile_review($1,$2,$3)',[id,f.venue,revision ?? (await current(id)).revision]);
  const require = async (fields,id=f.a,revision) => admin('select request_profile_corrections($1,$2,$3,$4)',[id,f.venue,revision ?? (await current(id)).revision,JSON.stringify(fields)]);
  const submit = async () => asUser(db,f.a,'select submit_profile_review($1)',[(await mine()).revision]);
  const bio = async value => {
    const state=(await asUser(db,f.a,'select * from my_text_corrections()')).find(s=>s.field==='bio');
    const id=crypto.randomUUID();
    await asUser(db,f.a,'select submit_bio_correction($1,$2,$3)',[id,value,state.revision]);return id;
  };
  const name = async value => {
    const id=crypto.randomUUID();await asUser(db,f.a,'select submit_name_correction($1,$2)',[id,value]);return id;
  };
  const photo = async () => {
    const id=crypto.randomUUID();
    await db.query("insert into photo_versions(id,profile_id,path,status) values($1,$2,$3,'unverified')",[id,f.a,`${f.a}/${id}.jpg`]);
    await db.query("update photo_state set pending_id=$1,revision=revision+1,last_action='submitted' where profile_id=$2",[id,f.a]);
    return id;
  };
  await assert.rejects(asUser(db,f.a,'select admin_profile_reviews($1)',[f.venue]),/not authorized/);
  await assert.rejects(asUser(db,f.a,'select * from private.profile_reviews'),/permission denied/);
  await assert.rejects(asUser(db,f.a,'select private.profile_review_snapshot($1)',[f.b]),/permission denied/);
  assert.equal((await queue()).counts.all,3);
  assert.equal((await queue(other.venue)).profiles.length,3);
  assert.ok((await queue(other.venue)).profiles.every(p=>![f.a,f.b,f.c].includes(p.id)));
  await assert.rejects(admin('select approve_profile_review($1,$2,$3)',[other.a,f.venue,(await queue(other.venue)).profiles[0].revision]),/not authorized/);
  for(const [filter,offset,limit] of [['Needs review',0,1],['needs_review',-1,1],['needs_review',0,0],['needs_review',0,51],[null,0,1],['all',null,1]])
    await assert.rejects(admin('select admin_profile_reviews($1,$2,$3,$4)',[f.venue,filter,offset,limit]),/invalid profile review query/);
  await approve();
  assert.equal((await current()).status,'approved');
  assert.deepEqual((await current()).approvedFields,['first_name','bio','photo']);
  await asUser(db,f.a,"update profiles set bio='Initial bio' where id=$1",[f.a]);
  assert.equal((await current()).status,'needs_review');
  assert.deepEqual((await current()).approvedFields,['first_name','photo']);
  const stale=(await current()).revision;
  await asUser(db,f.a,"update profiles set bio='Changed before review' where id=$1",[f.a]);
  await assert.rejects(approve(f.a,stale),/review changed/);
  await approve();
  await command(adapter,{actor:f.a,target:f.b,night:f.night,token:await token(adapter,f.a,f.venue,f.b)});
  const matched=await command(adapter,{actor:f.b,target:f.a,night:f.night,token:await token(adapter,f.b,f.venue,f.a)});
  assert.ok(matched.match_id);
  const correction=[{field:'bio',reason:'harassment'}];
  await require(correction);
  assert.equal((await current()).status,'awaiting_changes');
  assert.equal((await queue()).profiles.some(p=>p.id===f.a),false);
  assert.equal(await token(adapter,f.b,f.venue,f.a),undefined,'bio-only request hides the entire profile');
  assert.equal(await token(adapter,f.a,f.venue,f.b),undefined,'restricted owner cannot bypass discovery');
  assert.equal((await mine()).canSubmit,false);
  assert.deepEqual((await mine()).updatedFields,[],'redaction is not an edit');
  assert.equal((await mine()).notification,true);
  const requestId=(await mine()).requestId;
  await asUser(db,f.a,'select acknowledge_profile_correction($1)',[requestId]);
  assert.equal((await mine()).notification,false);
  assert.deepEqual((await mine()).fields,correction);
  await assert.rejects(asUser(db,f.b,'select acknowledge_profile_correction($1)',[requestId]),/correction changed/);
  await assert.rejects(submit(),/incomplete or changed/);
  await assert.rejects(approve(),/review changed/);
  await bio('Corrected bio');
  assert.equal((await mine()).canSubmit,true);
  assert.equal((await current()).status,'awaiting_changes','partial field submission is not explicit profile submission');
  await submit();
  assert.equal((await current()).status,'needs_review');
  assert.equal((await current()).resubmission,true);
  assert.equal((await queue()).profiles[0].id,f.a,'resubmissions are prioritized');
  assert.equal(await token(adapter,f.b,f.venue,f.a),undefined,'resubmission never lifts the hold');
  await approve();
  assert.equal((await current()).status,'approved');
  assert.equal(await mine(),null);
  assert.ok(await token(adapter,f.b,f.venue,f.a));
  assert.equal((await db.query('select count(*)::int n from matches where id=$1',[matched.match_id])).rows[0].n,1);

  // Every nonempty field combination, one cycle/notice, explicit submit, exact approval.
  const fields=['first_name','bio','photo'];
  for(let mask=1;mask<8;mask++) {
    const pairs=fields.filter((_f,i)=>mask&(1<<i)).map(field=>({field,reason:field==='photo'?'face_unclear':'inappropriate'}));
    await require(pairs);
    const before=await mine();
    assert.deepEqual(before.fields,pairs);
    assert.equal(before.notification,true);
    for(const item of pairs) {
      if(item.field==='first_name')await name(`Corrected ${mask}`);
      else if(item.field==='bio')await bio(`Bio ${mask}`);
      else await photo();
      if (item !== pairs.at(-1)) { assert.equal((await mine()).canSubmit,false); await assert.rejects(submit(),/incomplete or changed/); }
    }
    assert.equal((await current()).status,'awaiting_changes');
    assert.equal((await mine()).requestId,before.requestId,'field edits retain one request');
    await submit();
    assert.equal((await current()).status,'needs_review');
    assert.equal((await current()).correction.fields.length,pairs.length);
    await approve();
    assert.equal((await current()).status,'approved');
    assert.equal(await mine(),null);
  }
  const untouched=await current();
  const invalid=[[],[{field:'bio',reason:'face_unclear'}],[{field:'photo',reason:'hateful'}],[{field:'photo',reason:'legacy_unknown'}],[{field:'photo',reason:null}],
    [{field:'bio',reason:'inappropriate'},{field:'bio',reason:'inappropriate'}],
    [{field:'bio',reason:'Inappropriate'}],[{field:'bio',reason:' inappropriate '}],
    [{field:'bio',reason:'inappropriate',extra:true}],null,{},'bio'];
  for(const value of invalid)await assert.rejects(require(value),/invalid profile corrections/);
  assert.equal((await current()).revision,untouched.revision,'malformed commands make no effects');
  assert.equal(await mine(),null);
  // A submitted revision is invalidated by cancellation or another field edit.
  await require([{field:'bio',reason:'inappropriate'}]);
  const pendingBio=await bio('First submitted draft');
  await submit(); const inspected=(await current()).revision;
  await asUser(db,f.a,'select cancel_bio_correction($1)',[pendingBio]);
  assert.equal((await current()).status,'awaiting_changes');
  await assert.rejects(approve(f.a,inspected),/review changed/);
  await bio('Second submitted draft'); await submit(); await approve();
  const approvedRevision=(await current()).revision;
  await require([{field:'bio',reason:'harassment'}]);
  await assert.rejects(approve(f.a,approvedRevision),/review changed/,'a second founder cannot approve a superseded decision');
  await bio('Reviewed after new request'); await submit(); await approve();

  // Existing report actions keep field-only semantics. Rejecting a voluntary
  // replacement keeps the approved photo; a unified request requires an edit.
  const replacement=await photo();
  let candidate=await current();
  await admin('select decide_profile_photo($1,$2,$3,$4,$5)',[f.a,replacement,candidate.photoRevision,'rejected','face_unclear']);
  assert.equal(await mine(),null);
  assert.equal((await current()).status,'approved');
  await photo(); await require([{field:'photo',reason:'face_unclear'}]);
  assert.equal((await mine()).canSubmit,false,'rejecting a replacement must not count as an owner edit');
  assert.deepEqual((await mine()).updatedFields,[]);
  await photo(); await submit(); await approve();
  candidate=await current();
  await admin('select require_profile_text_correction($1,$2,$3,$4,$5)',[f.a,'bio',candidate.bioRevision,'harassment',f.night]);
  candidate=await current();
  await admin('select require_profile_text_correction($1,$2,$3,$4,$5)',[f.a,'first_name',candidate.nameRevision,'inappropriate',f.night]);
  assert.equal((await mine()).fields.length,2,'legacy actions never discard another requested field');
  await bio('After report review'); await name('After report'); await submit(); await approve();
  assert.equal((await db.query('select count(*)::int n from matches where id=$1',[matched.match_id])).rows[0].n,1);
  // This minimal substrate intentionally has no presence UPDATE policy. Set
  // the fixture's voluntary hidden state without adding production grants.
  await db.query('update presence set is_visible=false where profile_id=$1',[f.a]);
  await require([{field:'bio',reason:'inappropriate'}]); await bio('Keep my voluntary hiding'); await submit(); await approve();
  assert.equal((await asUser(db,f.a,'select is_visible from presence where profile_id=$1',[f.a]))[0].is_visible,false);
  assert.equal(await token(adapter,f.b,f.venue,f.a),undefined,'profile approval cannot undo voluntary hiding');
  console.log('Unified review SQL: seven combinations, venue scope, counts, exact approvals, explicit resubmission, consolidated notice and discovery hold passed.');
} catch (error) {
  console.error(error.message, error.where ?? '', error.query ?? '');
  process.exitCode=1;
} finally { await db.close(); }
