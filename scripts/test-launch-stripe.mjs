import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { receiveLaunchWebhook } from '../lib/server/launch-webhook.ts';
import { PGlite } from '@electric-sql/pglite';
import Stripe from 'stripe';
import { installLaunchSchema,service,fixture,attempt,create,scalar,asRole,admin } from './launch-test-database.mjs';
import { bookingInput } from '../lib/launch-contract.ts';
import { issueCredential,openCredential,sealCredential } from '../lib/server/launch-secrets.ts';
import { processCheckout,processRefund,handleLaunchEvent } from '../lib/server/launch-engine.ts';
import { checkoutParams,verifySession,reconcileRefund,REPLAY_WINDOW_MS,createLaunchStripe,launchProvider } from '../lib/server/launch-provider.ts';

const pg=new PGlite();
const db={query:(sql,args)=>args?pg.query(sql,args):pg.exec(sql).then(r=>r.at(-1))};
const rpc=async(name,args)=>{
 const entries=Object.entries(args).filter(([,v])=>v!==undefined);
 assert.match(name,/^[a-z_]+$/);
 return (await service(db,`select public.${name}(${entries.map(([key],i)=>`${key}=>$${i+1}`).join(',')}) result`,entries.map(([,v])=>v)))[0].result;
};
const account='acct_test185';
let accountConfiguration={id:account,charges_enabled:true,capabilities:{card_payments:'active'}};
let sessions=new Map(),payments=new Map(),refunds=new Map(),creates=0,refundCreates=0,loseCreate=false,loseRefund=false,definiteReject=false,refundOutcome='succeeded';
const stripe={
 accounts:{async retrieve(){return structuredClone(accountConfiguration);}},
 checkout:{sessions:{
  async create(p,options){creates++;if(definiteReject)throw {type:'StripeInvalidRequestError',statusCode:400,param:'expires_at',requestId:'req_expired'};
   let s=[...sessions.values()].find(s=>s.key===options.idempotencyKey);
   if(!s){s={id:`cs_test_${creates}`,key:options.idempotencyKey,created:Math.floor(Date.now()/1000),expires_at:p.expires_at,
    livemode:false,mode:'payment',status:'open',payment_status:'unpaid',payment_intent:null,client_reference_id:p.client_reference_id,
    metadata:p.metadata,amount_total:p.line_items[0].price_data.unit_amount,currency:p.line_items[0].price_data.currency,payment_method_types:['card'],url:'https://checkout.stripe.com/c/pay/test'};sessions.set(s.id,s);}
   if(loseCreate){loseCreate=false;throw {type:'StripeConnectionError'};}return structuredClone(s);
  },
  async retrieve(id){assert.ok(sessions.has(id));return structuredClone(sessions.get(id));},
  async expire(id){const s=sessions.get(id);if(s.status!=='open')throw Error('not open');s.status='expired';return structuredClone(s);},
  async *list(){for(const s of sessions.values())yield structuredClone(s);}
 }},
 paymentIntents:{async retrieve(id){assert.ok(payments.has(id));return structuredClone(payments.get(id));}},
 refunds:{
  async create(p,options){refundCreates++;let r=[...refunds.values()].find(r=>r.key===options.idempotencyKey);
   if(!r){r={id:`re_${refundCreates}`,key:options.idempotencyKey,payment_intent:p.payment_intent,amount:p.amount,currency:payments.get(p.payment_intent).currency,metadata:p.metadata,status:refundOutcome};refunds.set(r.id,r);}
   if(loseRefund){loseRefund=false;throw {type:'StripeConnectionError'};}return structuredClone(r);
  },
  async retrieve(id){assert.ok(refunds.has(id));return structuredClone(refunds.get(id));},
  async *list({payment_intent}){for(const r of refunds.values())if(r.payment_intent===payment_intent)yield structuredClone(r);}
 }
};
async function prepare(options={}){
 const {night}=await fixture(db,options),a=attempt(night);
 await rpc('prepare_launch_checkout',{p_id:a.id,p_night:a.night,p_email:a.email,p_name:a.name,p_locale:a.locale,p_policy:a.policy,p_late_ack:a.late,
 p_management_secret:a.management,p_arrival_secret:a.arrival,p_envelope:'v1.'+'x'.repeat(100),p_account:account,p_origin:'https://test.example.com'});
 return a;
}
const inspect=a=>rpc('inspect_launch_checkout',{p_id:a.id});
async function paidSession(a){const data=await inspect(a),s=sessions.get(data.checkout_id);s.status='complete';s.payment_status='paid';s.payment_intent=`pi_${a.id.replaceAll('-','')}`;
 payments.set(s.payment_intent,{id:s.payment_intent,livemode:false,status:'succeeded',amount_received:data.amount_minor,currency:data.currency,metadata:s.metadata});return s;}
async function event(a,type='checkout.session.completed'){const s=sessions.get((await inspect(a)).checkout_id);await handleLaunchEvent(rpc,stripe,account,{livemode:false,type,data:{object:structuredClone(s)}});}
let groups=0;async function check(name,fn){await fn();groups++;console.log(`PASS ${name}`);}
try{
 await installLaunchSchema(db);
 await check('guest input, separate encrypted secrets, tamper/purpose/expiry and live-key isolation',async()=>{
  const oldKey=process.env.STRIPE_SECRET_KEY;process.env.STRIPE_SECRET_KEY='sk_live_refused';assert.throws(()=>createLaunchStripe(),/sandbox/);if(oldKey===undefined)delete process.env.STRIPE_SECRET_KEY;else process.env.STRIPE_SECRET_KEY=oldKey;
  process.env.LAUNCH_SECRET_KEY=randomBytes(32).toString('hex');const {access}=issueCredential();const c=openCredential(access,'access');
  assert.notEqual(c.management,c.arrival);assert.ok(!access.includes(c.management));
  assert.throws(()=>openCredential(access,'delivery'));assert.throws(()=>openCredential(access.slice(0,-4)+'AAAA','access'));
  assert.throws(()=>openCredential(access,'access',c.issued+7*86400000));
  assert.deepEqual(openCredential(sealCredential(c,'delivery'),'delivery',c.issued+9*86400000),c);
  const b={night:c.id,email:' A+tag@Example.com ',name:' 😀 ',locale:'en',policy:'v1',late_ack:false};
  assert.equal(bookingInput(b).email,'a+tag@example.com');assert.equal(bookingInput(b).name,'😀');
  for(const patch of [{night:null},{email:'bad'},{name:'😀'.repeat(31)},{locale:'de'},{locale:['en']},{late_ack:'false'},{amount_minor:1},{policy:null}])assert.throws(()=>bookingInput({...b,...patch}));
  assert.equal(bookingInput({...b,name:'😀'.repeat(30)}).name.length,60);
 });
 await check('database cutoff, waitlist, full/closed/ended/cancelled states and rollback before effects',async()=>{
  for(const start of ['30 minutes','29 minutes','-1 minute']){
   const {night}=await fixture(db,{start,end:'2 hours'}),a=attempt(night);
   const availability=await rpc('launch_event_availability',{p_night:night});assert.equal(availability.registration_open,false);assert.equal(availability.walk_ins_possible,true);
   await assert.rejects(create(db,a),/registration closed/);assert.equal(await scalar(db,'select count(*)::int from private.launch_reservations where night_id=$1',[night]),0);
   await assert.rejects(rpc('join_launch_waitlist',{p_night:night,p_email:a.email,p_locale:'en'}),/unavailable/);
  }
  const a=await prepare({start:'30 minutes 10 seconds',end:'2 hours'}),row=await inspect(a);
  assert.ok(Date.parse(row.hold_until)<=Date.parse(row.starts_at));assert.ok(Date.parse(row.hold_until)-Date.parse(row.created_at)<=1800000);
  assert.equal((await rpc('launch_event_availability',{p_night:a.night})).available,0);
  await rpc('admin_cancel_launch_event',{p_night:a.night,p_reason:'cancelled'}).catch(()=>{});
  await db.query("update private.launch_events set cancelled_at=clock_timestamp(),cancellation_reason='cancelled' where night_id=$1",[a.night]);
  assert.equal((await rpc('launch_event_availability',{p_night:a.night})).walk_ins_possible,false);
  await assert.rejects(asRole(db,'authenticated','select inspect_launch_checkout($1)',[a.id]),/permission denied/);
  await assert.rejects(rpc('prepare_launch_checkout',{p_id:a.id,p_night:a.night,p_email:a.email,p_name:a.name,p_locale:a.locale,p_policy:a.policy,p_late_ack:a.late,p_management_secret:'0'.repeat(64),p_arrival_secret:a.arrival,p_envelope:'v1.'+'x'.repeat(100),p_account:account,p_origin:'https://test.example.com'}),/access denied/);
 });
 await check('creation timeout recovers exactly the same operation, no second allocation/session',async()=>{
  const a=await prepare();loseCreate=true;const before=creates;await processCheckout(rpc,stripe,account,a.id);
  assert.equal((await inspect(a)).checkout_id,null);assert.equal((await inspect(a)).state,'holding');
  await processCheckout(rpc,stripe,account,a.id);assert.equal(creates,before+1);assert.ok((await inspect(a)).checkout_id);
  const data=await inspect(a);const params=checkoutParams(data);assert.deepEqual(params.allowed_payment_method_types,['card']);assert.equal(params.adaptive_pricing.enabled,false);
  assert.equal(params.wallet_options.link.display,'never');
  const s=sessions.get(data.checkout_id);assert.throws(()=>verifySession(data,{...s,amount_total:999}));assert.throws(()=>verifySession(data,{...s,currency:'usd'}));assert.throws(()=>verifySession(data,{...s,expires_at:s.expires_at+1}));
 });
 await check('database response loss after provider creation reconciles without creating again',async()=>{
  const a=await prepare();const before=creates;let fail=true;
  const interrupted=async(name,args)=>{if(name==='bind_launch_checkout'&&fail){fail=false;throw Error('database network unavailable');}return rpc(name,args);};
  await processCheckout(interrupted,stripe,account,a.id);assert.equal((await inspect(a)).checkout_state,'pending');
  await processCheckout(rpc,stripe,account,a.id);assert.equal(creates,before+1);assert.ok((await inspect(a)).checkout_id);
 });
 await check('no blind retry past provider retention; absence is not unpaid proof',async()=>{
  const a=await prepare();await db.query("update private.launch_checkout_work set first_requested_at=clock_timestamp()-interval '25 hours' where reservation_id=$1",[a.id]);
  const before=creates;await processCheckout(rpc,stripe,account,a.id);assert.equal(creates,before);assert.equal((await inspect(a)).state,'holding');
  assert.equal(await scalar(db,'select state from private.launch_checkout_work where reservation_id=$1',[a.id]),'review_needed');
 });
 await check('definite first expiration rejection releases; uncertain replay rejection preserves allocation',async()=>{
  const a=await prepare();definiteReject=true;await processCheckout(rpc,stripe,account,a.id);assert.equal((await inspect(a)).state,'expired');
  const b=await prepare();await db.query('update private.launch_checkout_work set first_requested_at=clock_timestamp() where reservation_id=$1',[b.id]);
  await processCheckout(rpc,stripe,account,b.id);assert.equal((await inspect(b)).state,'holding');definiteReject=false;
 });
 await check('duplicate and out-of-order events use current Stripe truth and never trust browser return',async()=>{
  const a=await prepare();await processCheckout(rpc,stripe,account,a.id);await paidSession(a);await event(a);
  const audit=await scalar(db,'select count(*) from private.launch_audit where reservation_id=$1',[a.id]);
  await event(a);await event(a,'checkout.session.expired');assert.equal(await scalar(db,'select count(*) from private.launch_audit where reservation_id=$1',[a.id]),audit);
  assert.equal((await inspect(a)).state,'confirmed');
  const b=await prepare();await processCheckout(rpc,stripe,account,b.id);await event(b);assert.equal((await inspect(b)).state,'holding');
 });
 await check('verified expiry releases once; later payment queues one full refund without resurrection',async()=>{
  const a=await prepare();await processCheckout(rpc,stripe,account,a.id);
  sessions.get((await inspect(a)).checkout_id).status='expired';await event(a,'checkout.session.expired');assert.equal((await inspect(a)).state,'expired');
  await create(db,attempt(a.night,a.email));await paidSession(a);await event(a);await event(a);
  assert.equal((await inspect(a)).state,'expired');assert.equal(await scalar(db,'select count(*)::int from private.launch_refunds where reservation_id=$1',[a.id]),1);
  loseRefund=true;const before=refundCreates;await processRefund(rpc,stripe,account);
  const f=(await db.query('select * from private.launch_refunds where reservation_id=$1',[a.id])).rows[0];assert.equal(f.state,'pending');
  await db.query("update private.launch_refunds set lease_until=clock_timestamp()-interval '1 second' where id=$1",[f.id]);
  await processRefund(rpc,stripe,account);assert.equal(refundCreates,before+1);assert.equal(await scalar(db,'select state from private.launch_refunds where id=$1',[f.id]),'succeeded');
  assert.equal([...refunds.values()].at(-1).amount,1000);await processRefund(rpc,stripe,account);assert.equal(refundCreates,before+1);
 });
 await check('in-flight payment prevents capacity release; delayed notification on held allocation confirms',async()=>{
  const a=await prepare();await processCheckout(rpc,stripe,account,a.id);const s=sessions.get((await inspect(a)).checkout_id);s.status='expired';s.payment_intent='pi_processing';payments.set('pi_processing',{livemode:false,status:'processing'});
  await event(a,'checkout.session.expired');assert.equal((await inspect(a)).state,'holding');
  await paidSession(a);await event(a);assert.equal((await inspect(a)).state,'confirmed');
 });
 await check('refund retries beyond retention refuse recreation, terminal failures stay failed',async()=>{
  const f={id:'refund',operation_id:'operation',provider_refund_id:null,payment_id:'pi_none',amount_minor:1000,currency:'eur',reconcile_first:true,first_requested_at:new Date(Date.now()-REPLAY_WINDOW_MS-1000).toISOString()};
  const before=refundCreates;await assert.rejects(reconcileRefund(stripe,f),/horizon/);assert.equal(refundCreates,before);
  const r={id:'re_failure',payment_intent:'pi_none',amount:1000,currency:'eur',metadata:{operation_id:'operation',refund_id:'refund'},status:'failed'};refunds.set(r.id,r);
  assert.equal((await reconcileRefund(stripe,{...f,provider_refund_id:r.id})).status,'failed');assert.equal(refundCreates,before);
 });
 await check('terminal refund failure requires verified replacement; new operation executes once',async()=>{
  const a=await prepare();await processCheckout(rpc,stripe,account,a.id);
  await rpc('cancel_launch_reservation',{p_id:a.id,p_secret:a.management});await paidSession(a);await event(a);
  refundOutcome='failed';await processRefund(rpc,stripe,account);refundOutcome='succeeded';
  const f=(await db.query('select * from private.launch_refunds where reservation_id=$1',[a.id])).rows[0];assert.equal(f.state,'failed');
  const before=refundCreates;await processRefund(rpc,stripe,account);assert.equal(refundCreates,before);
  await admin(db,'select admin_replace_failed_launch_refund($1,$2,$3,$4,$5)',[f.id,f.operation_id,f.provider_refund_id,'evt_verified','Terminal failure and returned funds verified']);
  await processRefund(rpc,stripe,account);assert.equal(refundCreates,before+1);
  const replacement=(await db.query('select * from private.launch_refunds where id=$1',[f.id])).rows[0];
  assert.equal(replacement.state,'succeeded');assert.notEqual(replacement.operation_id,f.operation_id);assert.notEqual(replacement.provider_refund_id,f.provider_refund_id);
  await processRefund(rpc,stripe,account);assert.equal(refundCreates,before+1);
  await assert.rejects(rpc('complete_launch_refund',{p_id:f.id,p_claim:f.claim_id,p_provider_id:f.provider_refund_id,p_state:'failed'}),/provider identifier mismatch/);
 });
 await check('disabled charges or card capability block creation without blocking reconciliation/refunds',async()=>{
  for(const disabled of [
   {charges_enabled:false,capabilities:{card_payments:'active'}},
   {charges_enabled:true,capabilities:{card_payments:'inactive'}},
   {charges_enabled:true,capabilities:{}},
  ]){
   const paid=await prepare();await processCheckout(rpc,stripe,account,paid.id);await paidSession(paid);
   const interrupted=await prepare();loseCreate=true;await processCheckout(rpc,stripe,account,interrupted.id);
   const cancelled=await prepare();await processCheckout(rpc,stripe,account,cancelled.id);
   await rpc('cancel_launch_reservation',{p_id:cancelled.id,p_secret:cancelled.management});
   const fresh=await prepare(),before=creates,refundsBefore=refundCreates;
   accountConfiguration={id:account,...disabled};
   try{
    // Exercise the same initializer used by /process and guest resumption.
    const provider=await launchProvider(stripe);assert.equal(provider.account,account);
    await processCheckout(rpc,provider.stripe,provider.account,fresh.id);
    const blocked=await inspect(fresh);assert.equal(blocked.checkout_id,null);assert.equal(blocked.first_requested_at,null);
    assert.equal(blocked.checkout_state,'pending');assert.equal(blocked.state,'holding');
    assert.equal(await scalar(db,'select last_error from private.launch_checkout_work where reservation_id=$1',[fresh.id]),'stripe_cards_unavailable');
    await processCheckout(rpc,provider.stripe,provider.account,interrupted.id);assert.ok((await inspect(interrupted)).checkout_id);
    await processCheckout(rpc,provider.stripe,provider.account,cancelled.id);assert.equal((await inspect(cancelled)).payment_state,'unpaid');
    await processCheckout(rpc,provider.stripe,provider.account,paid.id);assert.equal((await inspect(paid)).state,'confirmed');
    await rpc('cancel_launch_reservation',{p_id:paid.id,p_secret:paid.management});
    loseRefund=true;await processRefund(rpc,provider.stripe,provider.account);
    await db.query("update private.launch_refunds set lease_until=clock_timestamp()-interval '1 second' where reservation_id=$1",[paid.id]);
    await processRefund(rpc,provider.stripe,provider.account);
    assert.equal(await scalar(db,'select state from private.launch_refunds where reservation_id=$1',[paid.id]),'succeeded');
    assert.equal(refundCreates,refundsBefore+1);assert.equal(creates,before);
   }finally{accountConfiguration={id:account,charges_enabled:true,capabilities:{card_payments:'active'}};}
   await processCheckout(rpc,stripe,account,fresh.id);assert.ok((await inspect(fresh)).checkout_id);
  }
 });
 await check('healthy Checkout waits until expiry; cancellation wakes work and founder detail hides delivery',async()=>{
  await db.query("update private.launch_checkout_work set state='done'");
  const a=await prepare();await processCheckout(rpc,stripe,account,a.id);
  const planned=await scalar(db,'select next_run_at >= (select hold_until from private.launch_reservations where id=$1) from private.launch_checkout_work where reservation_id=$1',[a.id]);assert.equal(planned,true);
  assert.equal(await rpc('claim_launch_checkout',{}),null);
  const detail=(await admin(db,'select admin_launch_reservation($1) result',[a.id]))[0].result;
  assert.equal(detail.checkout_work.state,'pending');assert.equal(JSON.stringify(detail).includes('v1.'+'x'.repeat(100)),false);
  await assert.rejects(asRole(db,'authenticated','select read_launch_delivery($1)',[a.id]),/permission denied/);
  await rpc('cancel_launch_reservation',{p_id:a.id,p_secret:a.management});
  assert.equal((await rpc('claim_launch_checkout',{})).id,a.id);
 });
 await check('Stripe raw-body signature, timestamp tolerance and tamper rejection',async()=>{
  const sdk=new Stripe('sk_test_local'),secret='whsec_local_test',payload=JSON.stringify({id:'evt_test',livemode:false,type:'checkout.session.completed',data:{object:{}}});
  const signature=sdk.webhooks.generateTestHeaderString({payload,secret});assert.equal(sdk.webhooks.constructEvent(payload,signature,secret).id,'evt_test');
  assert.throws(()=>sdk.webhooks.constructEvent(payload+' ',signature,secret));
  assert.throws(()=>sdk.webhooks.constructEvent(payload,sdk.webhooks.generateTestHeaderString({payload,secret,timestamp:Math.floor(Date.now()/1000)-301}),secret));
 });
 await check('webhook HTTP bounds/signatures reject before account/database access',async()=>{
  const sdk=new Stripe('sk_test_local'),secret='whsec_local_test';let calls=0;
  const noRpc=async()=>{calls++;throw Error('Unexpected effect');};
  const accountLookup=async()=>{calls++;return account;};
  for(const [body,signature,expected] of [['{}','bad',400],['x'.repeat(256*1024+1),'t=1,v1=bad',413]]){
   const response=await receiveLaunchWebhook(new Request('https://test/webhook',{method:'POST',body,headers:{'stripe-signature':signature}}),sdk,noRpc,accountLookup,secret);
   assert.equal(response.status,expected);assert.equal(calls,0);
  }
 });
 await check('database worker schedule is inert without Vault setup, guarded and service-only',async()=>{
  await db.query(`create schema if not exists vault; create table if not exists vault.decrypted_secrets(name text,decrypted_secret text);
   create schema if not exists net; create table net.requests(headers jsonb,body jsonb);
   create or replace function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$
   begin insert into net.requests values(headers,body);return 1;end $$;
   create schema if not exists cron; create table cron.jobs(name text,schedule text,command text);
   create or replace function cron.schedule(text,text,text) returns bigint language plpgsql as $$
   begin insert into cron.jobs values($1,$2,$3);return 1;end $$;`);
  await db.query(readFileSync('supabase/migrations/20261007000003_launch_stripe_schedule.sql','utf8'));
  assert.equal(await scalar(db,'select private.dispatch_launch_worker()'),null);
  assert.equal(await scalar(db,'select schedule from cron.jobs'),'* * * * *');
  await db.query("insert into vault.decrypted_secrets values('launch_worker_url','https://test.example.com/api/launch/process'),('launch_worker_secret',$1)",['a'.repeat(64)]);
  assert.equal(await scalar(db,'select private.dispatch_launch_worker()'),1);
  assert.deepEqual(await scalar(db,'select body from net.requests'),{limit:5});
  for(const role of ['anon','authenticated','service_role'])await assert.rejects(asRole(db,role,'select private.dispatch_launch_worker()'),/permission denied/);
  await db.query("update vault.decrypted_secrets set decrypted_secret='http://unsafe' where name='launch_worker_url'");
  await assert.rejects(db.query('select private.dispatch_launch_worker()'),/invalid launch worker/);
 });
 console.log(`${groups} Stripe orchestration groups passed against actual isolated SQL and controlled provider failures.`);
} finally {await pg.close();}
