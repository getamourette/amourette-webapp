// Explicit opt-in sandbox exercise; never included in CI or test:logic.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { receiveLaunchWebhook } from '../lib/server/launch-webhook.ts';
import { PGlite } from '@electric-sql/pglite';
import { chromium } from '@playwright/test';
import { installLaunchSchema,service,fixture,attempt,scalar } from './launch-test-database.mjs';
import { createLaunchStripe } from '../lib/server/launch-provider.ts';
import { processCheckout,processRefund,handleLaunchEvent } from '../lib/server/launch-engine.ts';

if(process.env.LAUNCH_SANDBOX_TEST!=='1')throw new Error('Set LAUNCH_SANDBOX_TEST=1 to create test payments/refunds in Stripe.');
const stripe=createLaunchStripe();
const account=(await stripe.accounts.retrieve(null)).id;
const faultMode=process.env.LAUNCH_SANDBOX_FAULTS==='1';let lostSession=false,lostRefund=false;
if(faultMode){
 const createSession=stripe.checkout.sessions.create.bind(stripe.checkout.sessions);
 stripe.checkout.sessions.create=async(...args)=>{const result=await createSession(...args);if(!lostSession){lostSession=true;throw Object.assign(Error('Simulated lost response after actual Stripe creation'),{type:'StripeConnectionError'});}return result;};
 const createRefund=stripe.refunds.create.bind(stripe.refunds);
 stripe.refunds.create=async(...args)=>{const result=await createRefund(...args);if(!lostRefund){lostRefund=true;throw Object.assign(Error('Simulated lost response after actual Stripe refund'),{type:'StripeConnectionError'});}return result;};
}
const pg=new PGlite();const db={query:(sql,args)=>args?pg.query(sql,args):pg.exec(sql).then(r=>r.at(-1))};
const rpc=async(name,args)=>{
 const entries=Object.entries(args).filter(([,v])=>v!==undefined);assert.match(name,/^[a-z_]+$/);
 return (await service(db,`select public.${name}(${entries.map(([key],i)=>`${key}=>$${i+1}`).join(',')}) result`,entries.map(([,v])=>v)))[0].result;
};
let browser,listener,server,webhookSecret;const created=[];let stage='schema';let delivered=0;
const webhookMode=process.env.LAUNCH_SANDBOX_WEBHOOK==='1';
try{
 await installLaunchSchema(db);
 if(webhookMode){
  assert.ok(process.env.STRIPE_CLI_PATH,'Set STRIPE_CLI_PATH for real signed forwarding');
  server=createServer(async(req,res)=>{
   try{
    const request=new Request('http://localhost/webhook',{method:'POST',headers:req.headers,body:Readable.toWeb(req),duplex:'half'});
    const response=await receiveLaunchWebhook(request,stripe,rpc,async()=>account,webhookSecret);
    if(response.status===200)delivered++;
    res.writeHead(response.status);res.end(await response.text());
   }catch{res.writeHead(500);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  listener=spawn(process.env.STRIPE_CLI_PATH,['listen','--events','checkout.session.completed','--forward-to',`http://127.0.0.1:${server.address().port}/webhook`],
   {env:{...process.env,STRIPE_API_KEY:process.env.STRIPE_SECRET_KEY},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('Stripe listener setup timed out')),20000);
   const read=bytes=>{const match=bytes.toString().match(/whsec_[A-Za-z0-9]+/);if(match){webhookSecret=match[0];clearTimeout(timeout);resolve();}};
   listener.stdout.on('data',read);listener.stderr.on('data',read);listener.once('error',reject);
  });
 }
 browser=await chromium.launch({headless:true});
 for(const currency of (webhookMode?['eur']:faultMode?['usd']:['eur','usd'])){
  stage=`${currency}:prepare`;
  const {night}=await fixture(db),a=attempt(night,`launch-${randomBytes(5).toString('hex')}@example.com`);
  if(currency==='usd'){
   await db.query('alter table private.launch_events disable trigger launch_event_guard');
   await db.query("update private.launch_events set currency='usd' where night_id=$1",[night]);
   await db.query('alter table private.launch_events enable trigger launch_event_guard');
  }
  await rpc('prepare_launch_checkout',{p_id:a.id,p_night:a.night,p_email:a.email,p_name:a.name,p_locale:a.locale,p_policy:a.policy,p_late_ack:a.late,
   p_management_secret:a.management,p_arrival_secret:a.arrival,p_envelope:'v1.'+'x'.repeat(100),p_account:account,p_origin:'http://localhost:3000'});
  stage=`${currency}:create`;
  await processCheckout(rpc,stripe,account,a.id);
  if(faultMode){assert.equal((await rpc('inspect_launch_checkout',{p_id:a.id})).checkout_id,null);await processCheckout(rpc,stripe,account,a.id);}
  const attemptRow=await rpc('inspect_launch_checkout',{p_id:a.id});assert.ok(attemptRow.checkout_id);created.push(attemptRow.checkout_id);
  const session=await stripe.checkout.sessions.retrieve(attemptRow.checkout_id);assert.equal(session.livemode,false);assert.equal(session.currency,currency);assert.equal(session.amount_total,1000);
  stage=`${currency}:hosted_form`;
  const page=await browser.newPage();
  await page.goto(session.url,{waitUntil:'domcontentloaded'});
  await page.locator('#cardNumber').fill('4242424242424242');
  await page.locator('#cardExpiry').fill('1230');
  await page.locator('#cardCvc').fill('123');
  const name=page.locator('#billingName');if(await name.count())await name.fill('Amourette Sandbox');
  const zip=page.locator('#billingPostalCode');if(await zip.count())await zip.fill('10001');
  // Cancel locally after Stripe presents the form, then accept its actual paid
  // result: exercises #182's compensation contract with a real test payment.
  if(!webhookMode)await rpc('cancel_launch_reservation',{p_id:a.id,p_secret:a.management});
  stage=`${currency}:submit`;
  await page.getByTestId('hosted-payment-submit-button').click();
  let paid;
  for(let i=0;i<30;i++){
   paid=await stripe.checkout.sessions.retrieve(session.id);if(paid.payment_status==='paid')break;
   await page.waitForTimeout(1000);
  }
  if(paid?.payment_status!=='paid'){
   console.log('Hosted validation:',(await page.locator('body').innerText()).slice(-1500));
   throw new Error('Hosted test payment did not complete');
  }
  stage=`${currency}:webhook_reconciliation`;
  const events=await stripe.events.list({type:'checkout.session.completed',limit:20});
  const event=events.data.find(e=>e.data.object.id===session.id);assert.ok(event,'Real Stripe event must be present');
  await handleLaunchEvent(rpc,stripe,account,event);await handleLaunchEvent(rpc,stripe,account,event);
  assert.equal((await rpc('inspect_launch_checkout',{p_id:a.id})).state,webhookMode?'confirmed':'cancelled');
  if(webhookMode){
   for(let i=0;i<15&&!delivered;i++)await page.waitForTimeout(1000);
   assert.ok(delivered>0,'Real signed Stripe webhook must reach the production receiver');
   await rpc('cancel_launch_reservation',{p_id:a.id,p_secret:a.management});
  }
  assert.equal(await scalar(db,'select reason from private.launch_refunds where reservation_id=$1',[a.id]),webhookMode?'timely_cancellation':'unallocated_payment');
  stage=`${currency}:refund`;
  await processRefund(rpc,stripe,account);
  if(faultMode){await db.query("update private.launch_refunds set lease_until=clock_timestamp()-interval '1 second' where reservation_id=$1",[a.id]);await processRefund(rpc,stripe,account);}
  const refund=(await db.query('select provider_refund_id,state from private.launch_refunds where reservation_id=$1',[a.id])).rows[0];assert.ok(refund.provider_refund_id);
  const providerRefund=await stripe.refunds.retrieve(refund.provider_refund_id);assert.equal(providerRefund.amount,1000);assert.equal(providerRefund.currency,currency);
  await processRefund(rpc,stripe,account);
  const all=await stripe.refunds.list({payment_intent:paid.payment_intent});assert.equal(all.data.length,1);
  console.log(`PASS ${currency.toUpperCase()} hosted card payment, ${webhookMode?'real signed HTTP webhook and confirmed reservation':'real repeated event and cancelled allocation'}, full refund (${providerRefund.status}), ${faultMode?'lost creation/refund responses recovered, ':''}no duplicate`);
  await page.close();
 }
}catch(error){console.error(JSON.stringify({stage,error:error.type??error.name,message:error.message}));process.exitCode=1;}
finally{
 for(const id of created){try{const s=await stripe.checkout.sessions.retrieve(id);if(s.status==='open')await stripe.checkout.sessions.expire(id);}catch{console.error('Sandbox session cleanup requires inspection');}}
 listener?.kill('SIGTERM');if(server)await new Promise(resolve=>server.close(resolve));
 await browser?.close();await pg.close();
}
