// #558: reservation reminders two days before and on the morning of the night,
// on the real migrations in an isolated database. No shared data, no provider send.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { installLaunchSchema,service,admin,fixture,attempt,pay,cancel,scalar } from './launch-test-database.mjs';
import { sealCredential,sealAccessProof,openCredential } from '../lib/server/launch-secrets.ts';
import { exchangeAccess } from '../lib/server/launch-access.ts';
import { parseLaunchMailContext } from '../lib/launch-mail.ts';
process.env.LAUNCH_SECRET_KEY=randomBytes(32).toString('hex');
const pg=new PGlite();const db={query:(sql,args)=>args?pg.query(sql,args):pg.exec(sql).then(r=>r.at(-1))};
const origin='https://reminders.example.com';
const rpc=async(name,args)=>{const entries=Object.entries(args);return (await service(db,`select public.${name}(${entries.map(([k],i)=>`${k}=>$${i+1}`).join(',')}) result`,entries.map(([,v])=>v)))[0].result;};
const check=async(name,fn)=>{await fn();console.log('PASS '+name);};
const claim=a=>rpc('claim_launch_access_mail',{p_origin:origin,p_recipients:[a.email]});
const finish=job=>rpc('finish_launch_access_mail',{p_id:job.id,p_claim:job.claim,p_state:'sent',p_provider:'mail_'+job.id});
const reminders=a=>db.query("select kind from private.launch_access_mail where reservation_id=$1 and kind like 'reminder_%' order by kind",[a.id]).then(r=>r.rows.map(x=>x.kind));
const queue=now=>db.query('select private.queue_launch_reminders($1::timestamptz)',[now]);
const at=(kind,night)=>scalar(db,`select private.launch_reminder_at($1,n.waiting_opens_at,v.timezone) from venue_nights n join venues v on v.id=n.venue_id where n.id=$2`,[kind,night]);
const plus=(time,minutes)=>new Date(new Date(time).getTime()+minutes*60000).toISOString();

// A night at `hour` venue time, `days` calendar days after today in that zone.
async function night(days,timezone='Europe/Paris',hour='20:00') {
 const start=await scalar(db,"select (((clock_timestamp() at time zone $1)::date+$2::int)+$3::time) at time zone $1",[timezone,days,hour]);
 const seconds=Math.round((new Date(start).getTime()-Date.now())/1000);
 const {venue,night:id}=await fixture(db,{capacity:10,start:`${seconds} seconds`,end:`${seconds+4*3600} seconds`});
 await db.query('update venues set timezone=$1 where id=$2',[timezone,venue]);
 return id;
}
// A paid reservation, confirmed `confirmedDaysAgo` days earlier, its confirmation mail already sent.
async function booking(nightId,{locale='fr',confirmedDaysAgo=6}={}) {
 const a=attempt(nightId);const c={id:a.id,management:a.management,arrival:a.arrival,issued:Date.now()};
 await rpc('prepare_launch_checkout',{p_id:a.id,p_night:nightId,p_email:a.email,p_name:a.name,p_locale:locale,p_policy:a.policy,p_late_ack:a.late,p_management_secret:a.management,p_arrival_secret:a.arrival,p_envelope:sealCredential(c,'delivery'),p_account:'acct_reminders',p_origin:origin});
 await pay(db,a);
 await db.query("update private.launch_reservations set confirmed_at=confirmed_at-make_interval(days=>$2) where id=$1",[a.id,confirmedDaysAgo]);
 const confirmation=await claim(a);assert.equal(confirmation.kind,'confirmed_access');await finish(confirmation);
 return a;
}

try {
 await installLaunchSchema(db);

 await check('reminder times are 10:00 venue time two days before and on the day; windows close early when they must',async()=>{
  const two=s=>scalar(db,"select private.launch_reminder_at('reminder_two_days',$1::timestamptz,'Europe/Paris')",[s]);
  const morning=s=>scalar(db,"select private.launch_reminder_at('reminder_morning',$1::timestamptz,'Europe/Paris')",[s]);
  const until=(k,s)=>scalar(db,"select private.launch_reminder_until($1,$2::timestamptz,'Europe/Paris')",[k,s]);
  const iso=v=>new Date(v).toISOString();
  assert.equal(iso(await two('2026-12-10T20:00:00+01:00')),'2026-12-08T09:00:00.000Z');
  assert.equal(iso(await morning('2026-12-10T20:00:00+01:00')),'2026-12-10T09:00:00.000Z');
  // Six hours, or until the free-cancellation deadline, or until the night starts.
  assert.equal(iso(await until('reminder_two_days','2026-12-10T20:00:00+01:00')),'2026-12-08T15:00:00.000Z');
  assert.equal(iso(await until('reminder_two_days','2026-12-10T11:00:00+01:00')),'2026-12-08T10:00:00.000Z');
  assert.equal(iso(await until('reminder_morning','2026-12-10T11:00:00+01:00')),'2026-12-10T10:00:00.000Z');
  // A night starting before 10:00 has no morning reminder: its window is empty.
  assert.ok(new Date(await until('reminder_morning','2026-12-10T09:00:00+01:00'))<=new Date(await morning('2026-12-10T09:00:00+01:00')));
  // Summer time: still 10:00 on the venue's clock.
  assert.equal(iso(await two('2027-06-10T20:00:00+02:00')),'2027-06-08T08:00:00.000Z');
 });

 await check('each reminder is queued once, at its time, however often the job runs',async()=>{
  const n=await night(5),a=await booking(n);
  const two=await at('reminder_two_days',n),morning=await at('reminder_morning',n);
  await queue(plus(two,-1));assert.deepEqual(await reminders(a),[],'nothing before 10:00');
  await queue(plus(two,1));await queue(plus(two,1));await queue(plus(two,6));
  assert.deepEqual(await reminders(a),['reminder_two_days']);
  await queue(plus(morning,1));await queue(plus(morning,30));
  assert.deepEqual(await reminders(a),['reminder_morning','reminder_two_days']);
  assert.equal(await scalar(db,"select count(*)::int from private.launch_access_mail where reservation_id=$1 and kind like 'reminder_%'",[a.id]),2);
  // A mail deleted by the 30-day retention never comes back: the receipt stays.
  await db.query("delete from private.launch_access_mail where reservation_id=$1 and kind like 'reminder_%'",[a.id]);
  await queue(plus(morning,2));assert.deepEqual(await reminders(a),[]);
 });

 await check('no reminder for a cancelled, refunded, arrived, revoked or cancelled-night reservation',async()=>{
  const n=await night(5),two=await at('reminder_two_days',n);
  const cancelled=await booking(n);await cancel(db,cancelled);
  const refunded=await booking(n);await admin(db,"select admin_refund_launch_reservation($1,'Support exception')",[refunded.id]);
  const arrived=await booking(n);
  await db.query("insert into private.launch_arrivals(reservation_id,outcome,verified_at,method) values($1,'verified',clock_timestamp(),'qr')",[arrived.id]);
  const revoked=await booking(n);await db.query('update private.launch_credentials set arrival_revoked_at=clock_timestamp() where reservation_id=$1',[revoked.id]);
  const control=await booking(n);
  await queue(plus(two,1));
  for(const a of [cancelled,refunded,arrived,revoked]) assert.deepEqual(await reminders(a),[]);
  assert.deepEqual(await reminders(control),['reminder_two_days']);
  const other=await night(5),guest=await booking(other);
  await admin(db,'select admin_cancel_launch_event($1,$2)',[other,'cancelled']);
  await queue(plus(await at('reminder_two_days',other),1));
  assert.deepEqual(await reminders(guest),[]);
 });

 await check('never late: not for a reservation confirmed after 10:00, not 6 hours after, not after the deadline it states',async()=>{
  const n=await night(5),two=await at('reminder_two_days',n);
  const after=await booking(n);await db.query('update private.launch_reservations set confirmed_at=$2 where id=$1',[after.id,plus(two,5)]);
  const missed=await booking(n);
  await queue(plus(two,10));assert.deepEqual(await reminders(after),[],'confirmed after the reminder time');
  assert.deepEqual(await reminders(missed),['reminder_two_days']);
  const n2=await night(5),late=await booking(n2);
  await queue(plus(await at('reminder_two_days',n2),6*60));assert.deepEqual(await reminders(late),[],'job down for six hours');
  // A night at 11:00: the free-cancellation deadline (D-2 11:00) closes the two-day window early.
  const n3=await night(5,'Europe/Paris','11:00');
  const early=await booking(n3),deadline=(await scalar(db,"select waiting_opens_at-interval '48 hours' from venue_nights where id=$1",[n3])).toISOString();
  assert.equal(new Date(deadline)-new Date(await at('reminder_two_days',n3)) < 61*60000,true);
  await queue(deadline);assert.deepEqual(await reminders(early),[]);
  await queue(plus(deadline,-1));assert.deepEqual(await reminders(early),['reminder_two_days']);
 });

 // Real clock from here: a venue zone where it is now about 11:00 puts both
 // reminders of tonight's and the day-after-tomorrow's nights inside their window.
 const offset=11-new Date().getUTCHours();
 const zone=offset===0?'Etc/GMT':`Etc/GMT${offset>0?'-':'+'}${Math.abs(offset)}`;

 await check('the worker claims a due reminder, binds a management link that keeps the existing access, and reads its facts',async()=>{
  for(const [days,kind,beforeDeadline] of [[2,'reminder_two_days',true],[0,'reminder_morning',false]]) {
   const n=await night(days,zone),a=await booking(n,{locale:'fr'});
   await queue(new Date().toISOString());assert.deepEqual(await reminders(a),[kind]);
   const job=await claim(a);assert.equal(job.kind,kind);
   const c=parseLaunchMailContext(await rpc('read_launch_mail_context',{p_id:job.id,p_claim:job.claim}));
   assert.equal(c.kind,kind);assert.equal(c.locale,'fr');assert.equal(c.before_deadline,beforeDeadline);assert.ok('address' in c);
   const token=randomBytes(32).toString('hex');
   await rpc('bind_launch_access_mail',{p_id:job.id,p_claim:job.claim,p_token:token,p_envelope:sealAccessProof({token})});
   await finish(job);
   const opened=openCredential((await exchangeAccess(rpc,job.id,token)).access,'access');
   assert.equal(opened.management,a.management,'opening a reminder never revokes the tab that paid');
  }
 });

 await check('a queued reminder is dropped, not sent, when the reservation is cancelled before the worker claims it',async()=>{
  const n=await night(2,zone),a=await booking(n);
  await queue(new Date().toISOString());assert.deepEqual(await reminders(a),['reminder_two_days']);
  await cancel(db,a);
  let job=await claim(a);while(job&&job.kind!=='reminder_two_days'){await finish(job);job=await claim(a);}
  assert.equal(job,null);
  assert.equal(await scalar(db,"select state from private.launch_access_mail where reservation_id=$1 and kind='reminder_two_days'",[a.id]),'suppressed');
 });

 await check('a frozen reminder is dropped when the venue address changes after it was written',async()=>{
  const n=await night(0,zone),a=await booking(n);
  await queue(new Date().toISOString());
  const job=await claim(a);const c=parseLaunchMailContext(await rpc('read_launch_mail_context',{p_id:job.id,p_claim:job.claim}));
  await rpc('bind_launch_mail_payload',{p_id:job.id,p_claim:job.claim,p_envelope:'v1.'+'A'.repeat(120),p_version:c.version});
  await rpc('finish_launch_access_mail',{p_id:job.id,p_claim:job.claim,p_state:'failed'});
  await db.query("update venues set address='2 new street' where id=(select venue_id from venue_nights where id=$1)",[n]);
  await db.query("update private.launch_access_mail set next_attempt_at=clock_timestamp() where id=$1",[job.id]);
  const retry=await claim(a);assert.equal(retry.id,job.id);
  assert.equal(await rpc('read_launch_mail_context',{p_id:retry.id,p_claim:retry.claim}),null);
  assert.equal(await scalar(db,'select state from private.launch_access_mail where id=$1',[job.id]),'suppressed');
 });

 await check('queueing and schedule helpers are not reachable through the API',async()=>{
  for(const role of ['authenticated','service_role']) {
   await assert.rejects(db.query(`set role ${role}; select private.queue_launch_reminders()`),/permission denied/);
   await db.query('reset role');
  }
 });
} finally { await pg.close(); }
