import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { installLikeSchema,seedPair,token,command } from './like-test-database.mjs';
import { installNameSchema,asUser } from './name-test-database.mjs';
const db = new PGlite();
const adapter = { query: (sql,args) => args ? db.query(sql,args) : db.exec(sql).then(results=>results.at(-1)) };
try {
  await installLikeSchema(adapter); await installNameSchema(adapter);
  const {a,b,c,venue,night}=await seedPair(adapter);
  await db.query('insert into admins values($1)',[c]);
  const submit=(actor,name,id=crypto.randomUUID())=>asUser(db,actor,'select submit_name_correction($1,$2) id',[id,name]);
  const decide=(id,action='approved',actor=c)=>asUser(db,actor,'select * from decide_name_correction($1,$2)',[id,action]);
  const partner=(actor,match)=>asUser(db,actor,'select * from chat_partner_state($1)',[match]);
  const name=async()=> (await db.query('select first_name from profiles where id=$1',[a])).rows[0].first_name;
  const count=async()=> (await db.query('select count(*)::int n from private.name_corrections')).rows[0].n;
  for(const input of [null,'',' \n\u00a0','Test',' Test ','x'.repeat(31),'😀'.repeat(31),' '.repeat(16384)+'A']) {
    await assert.rejects(submit(a,input)); assert.equal(await count(),0); assert.equal(await name(),'Test');
  }
  await assert.rejects(submit(a,'Alice',null));
  await assert.rejects(submit(a,'Alice','malformed'));
  await assert.rejects(asUser(db,a,"update profiles set first_name='Bypass' where id=$1",[a]));
  await assert.rejects(asUser(db,a,"update profiles set first_name='Test' where id=$1",[a]),'even unchanged-name UPDATE is revoked');
  await assert.rejects(db.query("update profiles set first_name='Privileged bypass' where id=$1",[a]),/approval required/);
  // Definer helpers cannot bypass the trigger, even if a caller forges a GUC.
  await db.exec("create function public.test_name_bypass(uuid) returns void language sql security definer as $$update public.profiles set first_name='Bypass' where id=$1$$");
  await assert.rejects(asUser(db,a,'select test_name_bypass($1)',[a]),/approval required/);
  for(const table of ['name_corrections','match_name_notices','name_application']) await assert.rejects(asUser(db,b,`select * from private.${table}`));
  await assert.rejects(asUser(db,null,'select my_name_correction()'));
  await assert.rejects(asUser(db,b,'select * from admin_name_corrections()'));

  const pending=crypto.randomUUID();
  await submit(a,'\u00a0'+'😀'.repeat(30)+'\n',pending);
  assert.equal((await asUser(db,a,'select * from my_name_correction()'))[0].proposed_name,'😀'.repeat(30));
  assert.equal((await asUser(db,b,'select * from my_name_correction()'))[0].id,null);
  assert.equal((await asUser(db,c,'select * from admin_name_corrections()'))[0].id,pending);
  assert.equal((await submit(a,'😀'.repeat(30),pending))[0].id,pending);
  await assert.rejects(submit(a,'Other',pending),/reused/);
  await assert.rejects(submit(b,'😀'.repeat(30),pending),/reused/);
  await assert.rejects(submit(a,'Other'),/pending correction/);
  await assert.rejects(decide(pending,'approved',a));
  await assert.rejects(asUser(db,b,'select cancel_name_correction($1)',[pending]));
  for(const action of [null,'cancelled','approve',' approved ']) { await assert.rejects(decide(pending,action)); assert.equal(await name(),'Test'); }
  await asUser(db,a,'select cancel_name_correction($1)',[pending]);
  assert.deepEqual(await decide(pending),[{applied:false,status:'cancelled'}]);
  assert.equal((await submit(a,'😀'.repeat(30),pending))[0].id,pending,'cancelled request replay has no effect');

  // Preserve compatibility behavior and match identity across name approval.
  const oldToken=await token(db,a,venue,b);
  await command(db,{actor:a,target:b,night,token:oldToken});
  const matched=await command(db,{actor:b,target:a,night,token:await token(db,b,venue,a)});
  const match=matched.match_id;
  const request=(await submit(a,'Alice'))[0].id;
  assert.deepEqual(await decide(request),[{applied:true,status:'approved'}]);
  assert.equal(await name(),'Alice');
  assert.equal(await token(db,a,venue,b),oldToken,'name correction keeps eligibility tokens');
  assert.equal((await db.query('select * from matches where id=$1',[match])).rows.length,1);
  assert.equal((await db.query('select * from likes')).rows.length,2);
  assert.deepEqual(await decide(request),[{applied:false,status:'approved'}]);
  assert.deepEqual(await decide(request,'rejected'),[{applied:false,status:'approved'}]);
  assert.equal((await asUser(db,a,'select cancel_name_correction($1) status',[request]))[0].status,'approved');
  assert.equal((await partner(b,match))[0].correction_id,request);
  assert.equal((await partner(a,match))[0].correction_id,null);
  assert.deepEqual(await partner(c,match),[],'third party cannot read a chat');
  assert.ok(!('reviewed_by' in (await asUser(db,a,'select * from my_name_correction()'))[0]));
  const audit=(await asUser(db,c,'select * from admin_name_corrections($1)',[request]))[0];
  assert.equal(audit.reviewed_by,c); assert.ok(audit.resolved_at);
  const second=(await submit(a,'Alix'))[0].id;
  await decide(second);
  assert.equal((await partner(b,match))[0].correction_id,second);
  assert.equal((await asUser(db,b,'select acknowledge_name_correction($1,$2) ok',[match,request]))[0].ok,false);
  assert.equal((await partner(b,match))[0].seen_correction_id,null);
  assert.equal((await asUser(db,b,'select acknowledge_name_correction($1,$2) ok',[match,second]))[0].ok,true);
  assert.equal((await partner(b,match))[0].seen_correction_id,second);
  // A read never consumes notice state, while a subsequent approval is new.
  const third=(await submit(a,'Alex'))[0].id;
  await decide(third); await partner(b,match);
  assert.equal((await partner(b,match))[0].seen_correction_id,second);
  const rejected=(await submit(a,'Rejected'))[0].id;
  await decide(rejected,'rejected'); assert.equal(await name(),'Alex');
  assert.equal((await partner(b,match))[0].correction_id,third);
  await command(db,{actor:a,target:c,night,token:await token(db,a,venue,c)});
  const later=await command(db,{actor:c,target:a,night,token:await token(db,c,venue,a)});
  assert.equal((await partner(c,later.match_id))[0].correction_id,null,'new match gets no historical notice');
  // No cooldown after refusal, and a later correction reaches every existing match.
  const fourth=(await submit(a,'Alexandra'))[0].id; await decide(fourth);
  assert.equal((await partner(b,match))[0].correction_id,fourth);
  assert.equal((await partner(c,later.match_id))[0].correction_id,fourth);
  await asUser(db,a,"update profiles set bio='Edited',interested_in=array['woman','man'] where id=$1",[a]);
  assert.equal((await db.query('select count(*)::int n from matches')).rows[0].n,2);
  // Existing preference cleanup still deletes unmatched incompatible likes.
  const isolated=await seedPair(adapter);
  await command(db,{actor:isolated.a,target:isolated.b,night:isolated.night,token:await token(db,isolated.a,isolated.venue,isolated.b)});
  await asUser(db,isolated.a,"update profiles set interested_in=array['man'] where id=$1",[isolated.a]);
  assert.equal((await db.query('select * from likes where venue_night_id=$1',[isolated.night])).rows.length,0);
  await asUser(db,a,"update profiles set interested_in=array['man'] where id=$1",[a]);
  assert.equal((await partner(b,match))[0].first_name,'Alexandra','preferences do not revoke existing chat');
  await db.query('update presence set left_at=now() where profile_id=$1',[b]);
  assert.equal((await partner(b,match)).length,1,'departure keeps profile read');
  await db.query("update venue_nights set status='closed' where id=$1",[night]);
  assert.deepEqual(await partner(b,match),[]);
  await db.query("update venue_nights set status='live' where id=$1",[night]);
  await db.query("update matches set expires_at=now()-interval '1 second' where id=$1",[match]);
  assert.deepEqual(await partner(b,match),[]);
  assert.equal((await asUser(db,b,'select acknowledge_name_correction($1,$2) ok',[match,fourth]))[0].ok,false);
  await db.query('delete from matches where id=$1',[match]);
  assert.equal((await db.query('select * from private.match_name_notices where match_id=$1',[match])).rows.length,0);
  await db.query('insert into blocks values($1,$2)',[a,c]);
  assert.deepEqual(await partner(c,later.match_id),[]);
  await db.query('delete from presence where profile_id=$1',[a]);
  assert.ok((await submit(a,'Offsite'))[0].id,'requests work with no venue presence');
  console.log('Name correction validation, authorization, replay, audit, match notices and preference integration passed.');
} finally { await db.close(); }
