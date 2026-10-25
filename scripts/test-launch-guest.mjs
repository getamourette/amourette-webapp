import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { installLaunchSchema,service,admin,asRole,fixture,attempt,get,pay,scalar } from './launch-test-database.mjs';
import { openCredential,sealCredential,sealAccessProof,openAccessProof } from '../lib/server/launch-secrets.ts';
import { exchangeAccess } from '../lib/server/launch-access.ts';
import { parseBookingEvent,parseReservation } from '../lib/booking.ts';
process.env.LAUNCH_SECRET_KEY=randomBytes(32).toString('hex');
const pg=new PGlite();const db={query:(sql,args)=>args?pg.query(sql,args):pg.exec(sql).then(r=>r.at(-1))};
const origin='https://guest-test.example.com';let groups=0;
const check=async(name,fn)=>{await fn();groups++;console.log('PASS '+name);};
const rpc=async(name,args)=>{assert.match(name,/^[a-z_]+$/);const entries=Object.entries(args);return (await service(db,`select public.${name}(${entries.map(([k],i)=>`${k}=>$${i+1}`).join(',')}) result`,entries.map(([,v])=>v)))[0].result;};
async function prepared(night,email) {
 const a=attempt(night,email); const c={id:a.id,management:a.management,arrival:a.arrival,issued:Date.now()};
 await rpc('prepare_launch_checkout',{p_id:a.id,p_night:night,p_email:a.email,p_name:a.name,p_locale:a.locale,p_policy:a.policy,p_late_ack:a.late,p_management_secret:a.management,p_arrival_secret:a.arrival,p_envelope:sealCredential(c,'delivery'),p_account:'acct_guest',p_origin:origin});
 return a;
}
async function request(a) {await rpc('request_launch_access',{p_night:a.night,p_email:a.email,p_origin:origin});}
async function claim(recipient) { return rpc('claim_launch_access_mail',{p_origin:origin,p_recipients:[recipient]}); }
async function bind(job) {const token=randomBytes(32).toString('hex');const b=await rpc('bind_launch_access_mail',{p_id:job.id,p_claim:job.claim,p_token:token,p_envelope:sealAccessProof({token})});return {id:job.id,token:openAccessProof(b.token_envelope).token,envelope:b.token_envelope};}
try {
 await installLaunchSchema(db);
 await check('late terms refuse before allocation; an existing attempt conflict is distinct',async()=>{
  const {night}=await fixture(db,{start:'1 day',end:'1 day 4 hours'});const a=attempt(night);
  const c={id:a.id,management:a.management,arrival:a.arrival,issued:Date.now()};
  const args={p_id:a.id,p_night:night,p_email:a.email,p_name:a.name,p_locale:a.locale,p_policy:a.policy,p_late_ack:false,p_management_secret:a.management,p_arrival_secret:a.arrival,p_envelope:sealCredential(c,'delivery'),p_account:'acct_guest',p_origin:origin};
  await assert.rejects(rpc('prepare_launch_checkout',args),/late cancellation acknowledgement required/);
  assert.equal(await scalar(db,'select count(*)::int from private.launch_reservations where id=$1',[a.id]),0);
  assert.equal(await scalar(db,'select count(*)::int from private.launch_checkout_work where reservation_id=$1',[a.id]),0);
  await rpc('prepare_launch_checkout',{...args,p_late_ack:true});
  await assert.rejects(rpc('prepare_launch_checkout',args),/reservation identifier reused/);
  assert.equal((await get(db,a)).state,'holding');
  assert.equal(await scalar(db,'select count(*)::int from private.launch_reservations where id=$1',[a.id]),1);
 });
 await check('event projection and guest response validators refuse malformed data',async()=>{
  const {night}=await fixture(db);const e=await rpc('launch_booking_event',{p_night:night}); assert.equal(parseBookingEvent(e).night_id,night);
  for(const bad of [null,[],{...e,available:-1},{...e,now:'invalid'},{...e,timezone:'invalid'},{...e,currency:'gbp'}]) assert.throws(()=>parseBookingEvent(bad));
  const a=await prepared(night,'projection@example.com');assert.equal(parseReservation(await get(db,a)).id,a.id);
  assert.throws(()=>parseReservation({state:'paid'}));
  const reservation=await get(db,a);
  for (const bad of [undefined,'false',0,[]]) assert.throws(()=>parseReservation({...reservation,cancellation_refundable:bad}));
  for (const value of [null,true,false]) assert.equal(parseReservation({...reservation,cancellation_refundable:value}).cancellation_refundable,value);
 });
 await check('paid confirmation queues one email without a marketing subscription',async()=>{
  const {night}=await fixture(db);const a=await prepared(night,'initial@example.com');
  assert.equal(await scalar(db,'select count(*)::int from private.launch_access_mail where reservation_id=$1',[a.id]),0);
  await pay(db,a); await pay(db,a);
  assert.equal(await scalar(db,'select count(*)::int from private.launch_access_mail where reservation_id=$1',[a.id]),1);
  const job=await claim(a.email); assert.equal(job.kind,'confirmed_access'); assert.equal(job.recipient,a.email);
  const proof=await bind(job); assert.equal((await get(db,a)).state,'confirmed');
  await rpc('finish_launch_access_mail',{p_id:job.id,p_claim:job.claim,p_state:'sent',p_provider:'provider_initial'});
  assert.equal(await claim(a.email),null);
  const recovered=await exchangeAccess(rpc,proof.id,proof.token);const c=openCredential(recovered.access,'access');
  assert.equal(c.arrival,a.arrival);assert.notEqual(c.management,a.management);
  await assert.rejects(get(db,a),/denied/);a.management=c.management;await get(db,a);
  const replay=await exchangeAccess(rpc,proof.id,proof.token);assert.equal(openCredential(replay.access,'access').management,a.management);
  assert.equal(await scalar(db,"select count(*)::int from private.launch_audit where reservation_id=$1 and action='access_renewed'",[a.id]),1);
 });
 await check('recovery does not rotate credentials, cooldown is generic, unknown emails have no effect',async()=>{
  const {night}=await fixture(db);const a=await prepared(night,'recovery@example.com');await request(a);await request(a);await get(db,a);
  assert.equal(await scalar(db,'select count(*)::int from private.launch_access_mail where reservation_id=$1',[a.id]),1);
  const before=await scalar(db,'select count(*)::int from private.launch_access_mail');await request({...a,email:'unknown@example.com'});
  assert.equal(await scalar(db,'select count(*)::int from private.launch_access_mail'),before);
  const job=await claim(a.email);const p=await bind(job);
  await assert.rejects(exchangeAccess(rpc,p.id,'0'.repeat(64)),/denied/);
  await get(db,a);const renewed=await exchangeAccess(rpc,p.id,p.token);assert.equal(renewed.id,a.id);
  assert.equal(await scalar(db,'select count(*)::int from private.launch_reservations where night_id=$1',[night]),1);
 });
 await check('expired links and founder email correction revoke proof without changing arrival',async()=>{
  const {night}=await fixture(db);const a=await prepared(night,'old@example.com');await request(a);const job=await claim(a.email);const p=await bind(job);
  await db.query("update private.launch_access_mail set token_expires_at=clock_timestamp()-interval '1 second' where id=$1",[job.id]);
  await assert.rejects(exchangeAccess(rpc,p.id,p.token),/denied/);await get(db,a);
  await db.query("update private.launch_access_mail set token_expires_at=clock_timestamp()+interval '1 day' where id=$1",[job.id]);
  await pay(db,a);await admin(db,'select admin_correct_launch_email($1,$2,$3)',[a.id,'correct@example.com','Verified payment and recipient']);
  await assert.rejects(exchangeAccess(rpc,p.id,p.token),/denied/);
  assert.equal(await scalar(db,'select arrival_hash=private.launch_secret_hash($2) from private.launch_credentials where reservation_id=$1',[a.id,a.arrival]),true);
 });
 await check('retry retains immutable proof, stale workers cannot finish, replay horizon stops retries',async()=>{
  const {night}=await fixture(db);const a=await prepared(night,'retry@example.com');await request(a);const job=await claim(a.email);const p=await bind(job);
  await rpc('finish_launch_access_mail',{p_id:job.id,p_claim:randomUUID(),p_state:'sent',p_provider:'stale'});
  assert.equal(await scalar(db,'select state from private.launch_access_mail where id=$1',[job.id]),'sending');
  await db.query("update private.launch_access_mail set lease_until=clock_timestamp()-interval '1 second' where id=$1",[job.id]);
  const next=await claim(a.email);assert.notEqual(next.claim,job.claim);const second=await bind(next);assert.equal(second.token,p.token);assert.equal(second.envelope,p.envelope);
  await db.query("update private.launch_access_mail set first_attempt_at=clock_timestamp()-interval '24 hours',lease_until=clock_timestamp()-interval '1 second' where id=$1",[job.id]);
  assert.equal(await claim(a.email),null);assert.equal(await scalar(db,'select state from private.launch_access_mail where id=$1',[job.id]),'unknown');
 });
 await check('suppression and preview allowlist prevent delivery without changing booking',async()=>{
  const {night}=await fixture(db);const a=await prepared(night,'blocked@example.com');await request(a);assert.equal(await claim('different@example.com'),null);
  await db.query('insert into public.email_suppressions(email) values($1)',[a.email]);assert.equal(await claim(a.email),null);await get(db,a);
  assert.equal(await scalar(db,'select state from private.launch_access_mail where reservation_id=$1',[a.id]),'suppressed');
 });
 await check('address input is bounded, founder-only and frozen after booking opens',async()=>{
  const {night,venue}=await fixture(db,{opens:'1 hour'});
  await admin(db,'select admin_set_venue_address($1,$2)',[venue,'  12 Test Street  ']);
  assert.equal((await rpc('launch_booking_event',{p_night:night})).address,'12 Test Street');
  await assert.rejects(admin(db,'select admin_set_venue_address($1,$2)',[venue,'a'.repeat(301)]),/invalid address/);
  await assert.rejects(asRole(db,'authenticated','select admin_set_venue_address($1,$2)',[venue,'Other']),/not authorized/);
  const open=await fixture(db);await assert.rejects(admin(db,'select admin_set_venue_address($1,$2)',[open.venue,'Changed']),/frozen/);
 });
 await check('booked evening freezes location, permits renaming and unfreezes after closure or cancellation',async()=>{
  const save=(venue,name,city='New York',timezone='America/New_York')=>admin(db,'select to_jsonb(save_venue_details($1,$2,$3,$4,$5)) result',[venue,name,'unchanged-slug',city,timezone]);
  const open=await fixture(db);await db.query("update public.venues set city='Paris',slug='original-slug' where id=$1",[open.venue]);
  const a=await prepared(open.night,'location@example.com');await pay(db,a);
  await assert.rejects(save(open.venue,'Changed'),/location is frozen while reservations are open/);
  const unchanged=(await db.query('select name,city,timezone from public.venues where id=$1',[open.venue])).rows[0];
  assert.deepEqual(unchanged,{name:'Test venue',city:'Paris',timezone:'Europe/Paris'});
  const renamed=(await save(open.venue,'  Renamed venue  ','Paris','Europe/Paris'))[0].result;
  assert.equal(renamed.name,'Renamed venue');assert.equal(renamed.slug,'original-slug');
  await admin(db,'select admin_set_venue_address($1,$2)',[open.venue,null]);
  await assert.rejects(admin(db,'select admin_set_venue_address($1,$2)',[open.venue,'Changed']),/address is frozen/);
  await admin(db,'select admin_cancel_launch_event($1,$2)',[open.night,'cancelled']);
  assert.equal((await save(open.venue,'Cancelled evening'))[0].result.city,'New York');
  await admin(db,'select admin_set_venue_address($1,$2)',[open.venue,'New address']);
  for(const options of [{opens:'1 hour'},{start:'-4 hours',end:'-1 hour',opens:'-1 day'}]){
   const f=await fixture(db,options);
   assert.equal((await save(f.venue,'Location available'))[0].result.timezone,'America/New_York');
   await admin(db,'select admin_set_venue_address($1,$2)',[f.venue,'Available address']);
  }
  const terminal=await fixture(db);
  await db.query("update public.venue_nights set terminal_at=clock_timestamp(),terminal_reason='cancelled' where id=$1",[terminal.night]);
  assert.equal((await save(terminal.venue,'Terminal evening'))[0].result.city,'New York');
  await assert.rejects(asRole(db,'authenticated','select save_venue_details($1,$2,$3,$4,$5)',[open.venue,'Unauthorized','slug','Paris','Europe/Paris']),/not authorized/);
  for(const role of ['anon','authenticated','service_role'])await assert.rejects(asRole(db,role,'select private.launch_venue_location_frozen($1)',[open.venue]),/permission denied/);
 });
 await check('guest email/proof RPCs are service-only and secrets are purpose-separated',async()=>{
  for(const role of ['anon','authenticated']) {
   await assert.rejects(asRole(db,role,'select request_launch_access($1,$2,$3)',[randomUUID(),'test@example.com',origin]),/permission denied/);
   await assert.rejects(asRole(db,role,'select claim_launch_access_mail($1)',[origin]),/permission denied/);
   await assert.rejects(asRole(db,role,'select inspect_launch_access($1,$2)',[randomUUID(),'0'.repeat(64)]),/permission denied/);
  }
  const envelope=sealAccessProof({token:'a'.repeat(64)});assert.throws(()=>openCredential(envelope,'access'));assert.equal(openAccessProof(envelope).token,'a'.repeat(64));
 });
 console.log(`${groups} guest booking SQL/access groups passed; isolated database, no email sent.`);
} finally {await pg.close();}
