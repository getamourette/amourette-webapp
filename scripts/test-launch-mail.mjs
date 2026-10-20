// Actual #189 migration in an isolated database. No shared data/provider sends.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes,randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { installLaunchSchema,service,admin,asRole,fixture,attempt,pay,cancel,scalar } from './launch-test-database.mjs';
import { sealCredential,sealAccessProof,openAccessProof,sealMailPayload,openMailPayload,openCredential } from '../lib/server/launch-secrets.ts';
import { exchangeAccess } from '../lib/server/launch-access.ts';
import { parseLaunchMailContext } from '../lib/launch-mail.ts';
process.env.LAUNCH_SECRET_KEY=randomBytes(32).toString('hex');
const pg=new PGlite();const db={query:(sql,args)=>args?pg.query(sql,args):pg.exec(sql).then(r=>r.at(-1))};
const origin='https://lifecycle.example.com';let groups=0;
const rpc=async(name,args)=>{const entries=Object.entries(args);return (await service(db,`select public.${name}(${entries.map(([k],i)=>`${k}=>$${i+1}`).join(',')}) result`,entries.map(([,v])=>v)))[0].result;};
const check=async(name,fn)=>{await fn();groups++;console.log('PASS '+name);};
async function booking(options={},locale='en') {
 const {night}=await fixture(db,options),a=attempt(night);
 const c={id:a.id,management:a.management,arrival:a.arrival,issued:Date.now()};
 await rpc('prepare_launch_checkout',{p_id:a.id,p_night:night,p_email:a.email,p_name:a.name,p_locale:locale,p_policy:a.policy,p_late_ack:a.late,p_management_secret:a.management,p_arrival_secret:a.arrival,p_envelope:sealCredential(c,'delivery'),p_account:'acct_mail',p_origin:origin});
 await pay(db,a);return a;
}
const claim=a=>rpc('claim_launch_access_mail',{p_origin:origin,p_recipients:[a.email]});
const context=job=>rpc('read_launch_mail_context',{p_id:job.id,p_claim:job.claim});
const count=async(a,kind)=>scalar(db,'select count(*)::int from private.launch_access_mail where reservation_id=$1 and kind=$2',[a.id,kind]);
const finish=job=>rpc('finish_launch_access_mail',{p_id:job.id,p_claim:job.claim,p_state:'sent',p_provider:'mail_'+job.id});
async function succeed(a) {
 await db.query("update private.launch_refunds set state='succeeded',provider_refund_id=coalesce(provider_refund_id,$2) where reservation_id=$1",[a.id,'re_'+a.id.replaceAll('-','')]);
}
try {
 await installLaunchSchema(db,{lifecycleMail:false});
 await check('rollout preserves history without backfill and refuses to change legacy attempted provider bodies',async()=>{
  const a=await booking();const legacy=await claim(a);
  await rpc('finish_launch_access_mail',{p_id:legacy.id,p_claim:legacy.claim,p_state:'failed'});
  await cancel(db,a);await succeed(a);
  await db.query(readFileSync('supabase/migrations/20261017000001_launch_lifecycle_mail.sql','utf8'));
  assert.equal(await scalar(db,'select state from private.launch_access_mail where id=$1',[legacy.id]),'unknown');
  assert.equal(await scalar(db,'select count(*)::int from private.launch_access_mail where reservation_id=$1',[a.id]),1);
  assert.equal(await scalar(db,'select count(*)::int from private.launch_mail_events'),0);
 });
 await check('one initial confirmation, no reminder/attendance mail; authoritative locale, money and deadline',async()=>{
  const a=await booking({},'fr');await pay(db,a);
  assert.equal(await count(a,'confirmed_access'),1);
  const job=await claim(a),c=parseLaunchMailContext(await context(job));
  assert.equal(c.locale,'fr');assert.equal(c.recipient,a.email);assert.equal(c.amount_minor,1000);assert.equal(c.currency,'eur');
  assert.equal(Date.parse(c.starts_at)-Date.parse(c.cancellation_deadline),48*3600000);assert.equal(c.qr_eligible,true);
  await finish(job);
  await db.query("insert into private.launch_arrivals(reservation_id,outcome,verified_at,method) values($1,'verified',clock_timestamp(),'qr')",[a.id]);
  await admin(db,"select admin_refund_launch_reservation($1,'Verified support exception')",[a.id]);
  assert.equal(await claim(a),null,'arrival/refund initiation does not create mail');
  const late=await booking({start:'1 day',end:'1 day 4 hours'});assert.equal(parseLaunchMailContext(await context(await claim(late))).before_deadline,false);
 });
 await check('timely and late participant cancellations enqueue exactly once and suppress obsolete QR confirmation',async()=>{
  for(const [options,eligible] of [[{},true],[{start:'1 day',end:'1 day 4 hours'},false]]) {
   const a=await booking(options);await cancel(db,a);await cancel(db,a);
   assert.equal(await count(a,'participant_cancelled'),1);
   const job=await claim(a);assert.equal(job.kind,'participant_cancelled');
   const c=parseLaunchMailContext(await context(job));assert.equal(c.refund_eligible,eligible);assert.equal(c.qr_eligible,false);
   assert.equal(await scalar(db,"select state from private.launch_access_mail where reservation_id=$1 and kind='confirmed_access'",[a.id]),'suppressed');await finish(job);
  }
 });
 await check('organizer notices include late-cancelled and already-refunded guests without replaying participant cancellation',async()=>{
  for(const reason of ['cancelled','postponed']) {
   const a=await booking({start:'1 day',end:'1 day 4 hours'});await cancel(db,a);
   if(reason==='cancelled') {await admin(db,"select admin_refund_launch_reservation($1,'Exceptional refund')",[a.id]);await succeed(a);}
   await admin(db,'select admin_cancel_launch_event($1,$2)',[a.night,reason]);
   await admin(db,'select admin_cancel_launch_event($1,$2)',[a.night,reason]);
   const kind=reason==='postponed'?'event_postponed':'event_cancelled';assert.equal(await count(a,kind),1);
   // A refund-success notification can precede the organizer notice.
   let job=await claim(a);if(job.kind==='refund_succeeded'){await finish(job);job=await claim(a);}
   assert.equal(job.kind,kind);const c=parseLaunchMailContext(await context(job));assert.equal(c.refund_eligible,true);assert.equal(c.event_reason,reason);await finish(job);
   assert.equal(await scalar(db,"select state from private.launch_access_mail where reservation_id=$1 and kind='participant_cancelled'",[a.id]),'suppressed');
  }
 });
 await check('only verified refund success queues mail, repeated observations and retained receipts prevent duplicates',async()=>{
  const a=await booking();await finish(await claim(a));await cancel(db,a);await finish(await claim(a));
  for(const state of ['pending','failed','review_needed','queued']) {
   await db.query('update private.launch_refunds set state=$2 where reservation_id=$1',[a.id,state]);assert.equal(await count(a,'refund_succeeded'),0);
  }
  await succeed(a);await succeed(a);assert.equal(await count(a,'refund_succeeded'),1);
  const job=await claim(a);assert.equal(job.kind,'refund_succeeded');await finish(job);
  await db.query('delete from private.launch_access_mail where id=$1',[job.id]);await succeed(a);
  assert.equal(await count(a,'refund_succeeded'),0,'dedup survives message retention');
 });
 await check('failure after provider success suppresses an unsent success notice; no automatic failure mail',async()=>{
  const a=await booking();await finish(await claim(a));await cancel(db,a);await finish(await claim(a));await succeed(a);
  const job=await claim(a);
  await db.query("update private.launch_refunds set state='failed' where reservation_id=$1",[a.id]);
  assert.equal(await context(job),null);assert.equal(await claim(a),null);
  assert.equal(await scalar(db,'select state from private.launch_access_mail where id=$1',[job.id]),'suppressed');
 });
 await check('correction queues one current summary, revokes old mail/proofs and preserves independent QR on exchange',async()=>{
  const a=await booking();const original=await claim(a);const token=randomBytes(32).toString('hex');
  await rpc('bind_launch_access_mail',{p_id:original.id,p_claim:original.claim,p_token:token,p_envelope:sealAccessProof({token})});
  await admin(db,"select admin_correct_launch_email($1,'corrected@example.com','Paid reservation and recipient verified')",[a.id]);
  await admin(db,"select admin_correct_launch_email($1,'corrected@example.com','Same verified recipient')",[a.id]);
  await assert.rejects(exchangeAccess(rpc,original.id,token),/denied/);
  assert.equal(await count(a,'corrected_summary'),1);assert.equal(await claim(a),null);
  a.email='corrected@example.com';const job=await claim(a);assert.equal(job.kind,'corrected_summary');
  const c=parseLaunchMailContext(await context(job));assert.equal(c.qr_eligible,true);
  const proof=randomBytes(32).toString('hex');const bound=await rpc('bind_launch_access_mail',{p_id:job.id,p_claim:job.claim,p_token:proof,p_envelope:sealAccessProof({token:proof})});
  assert.equal(openAccessProof(bound.token_envelope).token,proof);
  const renewed=openCredential((await exchangeAccess(rpc,job.id,proof)).access,'access');assert.equal(renewed.arrival,a.arrival);assert.notEqual(renewed.management,a.management);
 });
 await check('current-state revision fences render races and stale claims; complete encrypted body is immutable on retries',async()=>{
  const a=await booking();const job=await claim(a);const c=parseLaunchMailContext(await context(job));
  const envelope=sealMailPayload(JSON.stringify({subject:'Private confirmation',link:'secret-link'}));
  const args={p_id:job.id,p_claim:job.claim,p_envelope:envelope,p_version:c.version};
  await assert.rejects(rpc('bind_launch_mail_payload',{...args,p_claim:randomUUID()}),/unavailable/);
  await assert.rejects(rpc('bind_launch_mail_payload',{...args,p_envelope:'v1.'+'x'.repeat(262145)}),/invalid mail payload/);
  assert.equal(await rpc('bind_launch_mail_payload',args),envelope);
  assert.equal(await rpc('bind_launch_mail_payload',{...args,p_envelope:sealMailPayload('different body'.repeat(10))}),envelope);
  await rpc('finish_launch_access_mail',{p_id:job.id,p_claim:job.claim,p_state:'failed'});
  await db.query("update private.launch_access_mail set next_attempt_at=clock_timestamp()-interval '1 second' where id=$1",[job.id]);
  const retry=await claim(a);assert.equal((await context(retry)).payload_envelope,envelope);
  await assert.rejects(context(job),/unavailable/);
  await cancel(db,a);assert.equal(await context(retry),null,'no frozen QR confirmation after cancellation');
  const b=await booking();const fresh=await claim(b);const stale=parseLaunchMailContext(await context(fresh));
  await db.query("update venues set name='Updated venue' where id=(select venue_id from venue_nights where id=$1)",[b.night]);
  await assert.rejects(rpc('bind_launch_mail_payload',{p_id:fresh.id,p_claim:fresh.claim,p_envelope:envelope,p_version:stale.version}),/context changed/);
 });
 await check('cancellation retries survive refund processing but suppress contradictory retention after an approved exception',async()=>{
  for(const late of [false,true]) {
   const a=await booking(late?{start:'1 day',end:'1 day 4 hours'}:{});await finish(await claim(a));await cancel(db,a);
   const job=await claim(a);const c=parseLaunchMailContext(await context(job));
   await rpc('bind_launch_mail_payload',{p_id:job.id,p_claim:job.claim,p_envelope:sealMailPayload('Cancellation content '.repeat(10)),p_version:c.version});
   if(late) {
    await admin(db,"select admin_refund_launch_reservation($1,'Approved verified exception')",[a.id]);
    assert.equal(await context(job),null,'do not send an obsolete retained-deposit message');
   } else {
    await db.query("update private.launch_refunds set state='pending' where reservation_id=$1",[a.id]);
    assert.equal(parseLaunchMailContext(await context(job)).version,c.version,'processing progress does not invalidate a cancellation eligibility notice');
   }
  }
 });
 await check('expiry, suppression, preview allowlist and service-only grants apply to every lifecycle kind',async()=>{
  const a=await booking();await cancel(db,a);assert.equal(await claim({...a,email:'elsewhere@example.com'}),null);
  const job=await claim(a);await db.query("update private.launch_access_mail set first_attempt_at=clock_timestamp()-interval '24 hours',lease_until=clock_timestamp()-interval '1 second' where id=$1",[job.id]);
  assert.equal(await claim(a),null);assert.equal(await scalar(db,'select state from private.launch_access_mail where id=$1',[job.id]),'unknown');
  const b=await booking();await cancel(db,b);await db.query('insert into email_suppressions(email) values($1)',[b.email]);assert.equal(await claim(b),null);
  for(const role of ['anon','authenticated']) {
   await assert.rejects(asRole(db,role,'select read_launch_mail_context($1,$2)',[randomUUID(),randomUUID()]),/permission denied/);
   await assert.rejects(asRole(db,role,'select bind_launch_mail_payload($1,$2,$3,$4)',[randomUUID(),randomUUID(),'v1.'+'x'.repeat(100),'0'.repeat(64)]),/permission denied/);
   await assert.rejects(asRole(db,role,'select * from private.launch_mail_events'),/permission denied/);
  }
 });
 await check('runtime guards reject malformed provider context and ciphertext is purpose-separated and tamper-evident',async()=>{
  const a=await booking();const c=parseLaunchMailContext(await context(await claim(a)));
  for(const bad of [null,[],{...c,locale:['en']},{...c,currency:1},{...c,amount_minor:0},{...c,qr_eligible:'true'},{...c,refund_state:{}},{...c,timezone:'invalid'},{...c,version:null}])assert.throws(()=>parseLaunchMailContext(bad));
  for(const size of [46,190001])assert.throws(()=>sealMailPayload('x'.repeat(size)),/invalid_mail_payload/);
  for(const size of [47,190000])assert.equal(openMailPayload(sealMailPayload('x'.repeat(size))).length,size);
  const body=JSON.stringify({private:'link and QR'.repeat(10)}),envelope=sealMailPayload(body);assert.equal(openMailPayload(envelope),body);
  assert.throws(()=>openAccessProof(envelope));assert.throws(()=>openMailPayload(sealAccessProof({token:'a'.repeat(64)})));
  const raw=Buffer.from(envelope.slice(3),'base64url');raw[20]^=1;assert.throws(()=>openMailPayload('v1.'+raw.toString('base64url')));
 });
 console.log(`${groups} lifecycle mail groups passed; actual SQL, no shared changes or email sends.`);
} finally {await pg.close();}
