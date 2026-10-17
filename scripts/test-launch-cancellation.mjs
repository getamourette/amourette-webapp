import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { installLaunchSchema,service,admin,asRole,fixture,attempt,create,get,pay,scalar } from './launch-test-database.mjs';
import { cancellationInput,parseCancellation } from '../lib/launch-cancellation.ts';
import { parseWaitlist } from '../lib/launch-waitlist.ts';
const pg=new PGlite();const db={query:(sql,args)=>args?pg.query(sql,args):pg.exec(sql).then(r=>r.at(-1))};
let groups=0;const check=async(name,fn)=>{await fn();groups++;console.log('PASS '+name);};
const manage=async(a,confirm=false,retain=false)=>(await service(db,'select manage_launch_cancellation($1,$2,$3,$4) result',[a.id,a.management,confirm,retain]))[0].result;
const follow=(night,id,expected,state)=>admin(db,'select admin_follow_up_launch_waitlist($1,$2,$3,$4)',[night,id,expected,state]);
try {
 await installLaunchSchema(db);
 await check('strict command and response boundaries',async()=>{
  for(const bad of [null,[],{}, {action:['preview'],accept_retained:false},{action:'confirm',accept_retained:'true'},{action:'preview',accept_retained:true},{action:'confirm',accept_retained:false,extra:1}])assert.throws(()=>cancellationInput(bad));
  assert.deepEqual(cancellationInput({action:'confirm',accept_retained:false}),{p_confirm:true,p_accept_retained:false});
  assert.throws(()=>parseCancellation({}));assert.throws(()=>parseWaitlist([{id:9007199254740992}]));
  const row={id:1,email:'guest@example.com',locale:'en',state:'waiting',created_at:new Date().toISOString()};
  for(const bad of [{...row,locale:['en']},{...row,state:['waiting']},{...row,id:0},{...row,email:null},{...row,created_at:'bad'}])assert.throws(()=>parseWaitlist([bad]));
  assert.deepEqual(parseWaitlist([row]),[row]);
 });
 await check('preview has no effects; timely cancellation queues one refund, revokes QR and allows rebooking',async()=>{
  const {night}=await fixture(db);const a=attempt(night);await create(db,a);await pay(db,a);
  const before=await scalar(db,'select count(*)::int from private.launch_audit');
  const preview=parseCancellation(await manage(a));assert.equal(preview.refundable,true);assert.equal(preview.can_cancel,true);
  assert.equal(await scalar(db,'select count(*)::int from private.launch_audit'),before);
  const result=await manage(a,true);assert.equal(result.reservation.state,'cancelled');assert.equal(result.reservation.refund_state,'queued');
  await manage(a,true);assert.equal(await scalar(db,"select count(*)::int from private.launch_audit where reservation_id=$1 and action='participant_cancelled'",[a.id]),1);
  assert.equal(await scalar(db,'select arrival_revoked_at is not null from private.launch_credentials where reservation_id=$1',[a.id]),true);
  await create(db,attempt(night,a.email));assert.equal((await get(db,a)).refund_state,'queued');
 });
 await check('late confirmation refuses all effects until retention is explicitly accepted',async()=>{
  const {night}=await fixture(db,{start:'1 day',end:'1 day 4 hours'});const a=attempt(night);await create(db,a);await pay(db,a);
  const before=await scalar(db,'select count(*)::int from private.launch_audit');
  const stale=await manage(a,true);assert.equal(stale.confirmation_required,true);assert.equal(stale.refundable,false);assert.equal(stale.reservation.state,'confirmed');
  assert.equal(await scalar(db,'select count(*)::int from private.launch_audit'),before);
  assert.equal(await scalar(db,'select arrival_revoked_at from private.launch_credentials where reservation_id=$1',[a.id]),null);
  const done=await manage(a,true,true);assert.equal(done.reservation.cancellation_refundable,false);assert.equal(done.reservation.refund_state,null);
  const b=attempt(night,a.email);await create(db,b);await pay(db,b);assert.equal((await get(db,a)).refund_state,null);
 });
 await check('late cancellation preserves an existing exceptional refund without claiming retention',async()=>{
  const {night}=await fixture(db,{start:'1 day',end:'1 day 4 hours'});const a=attempt(night);await create(db,a);await pay(db,a);
  await admin(db,"select admin_refund_launch_reservation($1,'Approved exception')",[a.id]);
  const result=await manage(a,true,false);assert.equal(result.reservation.state,'cancelled');assert.equal(result.reservation.refund_state,'queued');
  assert.equal(await scalar(db,"select reason from private.launch_refunds where reservation_id=$1",[a.id]),'exception');
  assert.equal(await scalar(db,"select count(*)::int from private.launch_refunds where reservation_id=$1",[a.id]),1);
 });
 await check('eligibility boundary is inclusive, instant based and cancellation after start remains possible',async()=>{
  const start='2026-10-25T18:00:00Z';
  assert.equal(await scalar(db,'select private.launch_cancellation_refundable($1,$2)',[start,'2026-10-23T18:00:00Z']),true);
  assert.equal(await scalar(db,'select private.launch_cancellation_refundable($1,$2)',[start,'2026-10-23T18:00:00.000001Z']),false);
  // Real booking must precede opening; fixture transitions alone move the frozen schedule.
  const f=await fixture(db,{start:'1 day',end:'1 day 4 hours'});const b=attempt(f.night);await create(db,b);await pay(db,b);
  await db.query('alter table venue_nights disable trigger user');
  await db.query("update venue_nights set waiting_opens_at=clock_timestamp()-interval '1 hour',closes_at=clock_timestamp()+interval '2 hours' where id=$1",[f.night]);
  await db.query('alter table venue_nights enable trigger user');
  assert.equal((await manage(b,true,true)).reservation.state,'cancelled');
 });
 await check('wrong secrets, expired access, unpaid and attended or ended reservations refuse safely',async()=>{
  const {night}=await fixture(db);const a=attempt(night);await create(db,a);
  await assert.rejects(manage({...a,management:'0'.repeat(64)},true),/denied/);
  await assert.rejects(manage(a,true),/no longer/);assert.equal((await get(db,a)).state,'holding');await pay(db,a);
  await db.query("insert into private.launch_arrivals(reservation_id,outcome,verified_at,verified_by,method,note) values($1,'verified',clock_timestamp(),$2,'manual','Verified at door')",[a.id,'00000000-0000-0000-0000-000000000182']);
  await assert.rejects(manage(a,true),/no longer/);assert.equal((await get(db,a)).state,'confirmed');
  await db.query('delete from private.launch_arrivals where reservation_id=$1',[a.id]);
  await db.query('alter table venue_nights disable trigger user');
  await db.query("update venue_nights set waiting_opens_at=clock_timestamp()-interval '4 hours',guaranteed_launch_at=clock_timestamp()-interval '3 hours',closes_at=clock_timestamp()-interval '1 hour' where id=$1",[night]);
  await db.query('alter table venue_nights enable trigger user');
  await assert.rejects(manage(a,true,true),/no longer/);assert.equal((await get(db,a)).state,'confirmed');
  await db.query("update private.launch_credentials set management_expires_at=clock_timestamp()-interval '1 second' where reservation_id=$1",[a.id]);
  await assert.rejects(manage(a,true),/denied/);
  for(const role of ['anon','authenticated'])await assert.rejects(asRole(db,role,'select manage_launch_cancellation($1,$2,false,false)',[a.id,a.management]),/permission denied/);
 });
 await check('ordered founder follow-up is scoped, audited, replay safe and refuses stale transitions',async()=>{
  const {night}=await fixture(db);const a=attempt(night);await create(db,a);
  for(const email of ['first@example.com','second@example.com'])await service(db,'select join_launch_waitlist($1,$2,\'fr\')',[night,email]);
  const list=async()=>parseWaitlist((await admin(db,"select admin_launch_list($1,'waitlist',0) result",[night]))[0].result);
  const rows=await list();assert.deepEqual(rows.map(x=>x.email),['first@example.com','second@example.com']);
  await follow(night,rows[0].id,'waiting','contacted');await follow(night,rows[0].id,'waiting','contacted');
  await assert.rejects(follow(night,rows[0].id,'waiting','closed'),/changed/);
  const other=await fixture(db);await assert.rejects(follow(other.night,rows[0].id,'contacted','closed'),/unavailable/);
  await assert.rejects(asRole(db,'authenticated','select admin_follow_up_launch_waitlist($1,$2,$3,$4)',[night,rows[0].id,'contacted','closed']),/not authorized/);
  await follow(night,rows[0].id,'contacted','closed');await follow(night,rows[0].id,'closed','waiting');
  assert.deepEqual((await list()).map(x=>x.id),rows.map(x=>x.id));
  assert.equal(await scalar(db,"select count(*)::int from private.launch_audit where night_id=$1 and action='waitlist_updated'",[night]),3);
  assert.equal(await scalar(db,"select count(*)::int from private.launch_reservations where night_id=$1",[night]),1);
 });
 console.log(`${groups} cancellation/waitlist groups passed; isolated database, no payment or email sent.`);
} finally {await pg.close();}
