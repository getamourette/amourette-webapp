// Run after one production build. Isolated PostgREST adapter; no shared DB or Stripe calls.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes,randomUUID } from 'node:crypto';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { installLaunchSchema,service,admin,fixture,scalar,pay,cancel } from './launch-test-database.mjs';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { openCredential,sealCredential,sealAccessProof } from '../lib/server/launch-secrets.ts';

const issueFixtureCredential=()=>({id:randomUUID(),management:randomBytes(32).toString('hex'),arrival:randomBytes(32).toString('hex'),issued:Date.now()});
const pg=new PGlite();const db={query:(sql,args)=>args?pg.query(sql,args):pg.exec(sql).then(r=>r.at(-1))};
process.env.LAUNCH_SECRET_KEY=randomBytes(32).toString('hex');
const directory=await mkdtemp(join(tmpdir(),'launch-http-'));
let next,adapter;let queue=Promise.resolve();
const emailRequests=[];const acceptedEmails=new Map();let loseFirstEmailResponse=true;
const rpc=async(name,args)=>{const entries=Object.entries(args);assert.match(name,/^[a-z_]+$/);
 return (await service(db,`select public.${name}(${entries.map(([key],i)=>`${key}=>$${i+1}`).join(',')}) result`,entries.map(([,v])=>v)))[0].result;};
try{
 await installLaunchSchema(db);
 adapter=createServer((req,res)=>{
  queue=queue.then(async()=>{
   try{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=JSON.parse(Buffer.concat(chunks).toString());
    if(req.url==='/resend/emails') {
      const key=req.headers['idempotency-key'];emailRequests.push({key,body});
      if(!acceptedEmails.has(key)) acceptedEmails.set(key,'mail_'+acceptedEmails.size);
      if(loseFirstEmailResponse){loseFirstEmailResponse=false;req.socket.destroy();return;}
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({id:acceptedEmails.get(key)}));return;
    }
    const name=req.url.split('/').at(-1);const result=await rpc(name,body);
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(result));
   }catch(error){res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({code:error.code??'XX000',message:error.message,details:null,hint:null}));}
  });
 });
 await new Promise(resolve=>adapter.listen(0,'127.0.0.1',resolve));
 const preload=join(directory,'fetch.mjs');
 await writeFile(preload,`const original=globalThis.fetch;globalThis.fetch=(input,init)=>{const raw=typeof input==='string'?input:input instanceof URL?input.href:input.url;const url=new URL(raw);if(url.pathname.startsWith('/rest/v1/'))return original(process.env.LAUNCH_HTTP_RPC_URL+url.pathname+url.search,init);if(url.origin==='https://api.resend.com'&&url.pathname==='/emails')return original(process.env.LAUNCH_HTTP_RPC_URL+'/resend/emails',init);throw new Error('Unexpected external HTTP in isolated launch test');};`);
 const origin='http://127.0.0.1:3000',base='http://127.0.0.1:31185';
 next=spawn(process.execPath,['node_modules/next/dist/bin/next',process.env.LAUNCH_HTTP_DEV==='1'?'dev':'start','--hostname','127.0.0.1','--port','31185'],{
  env:{...process.env,NODE_OPTIONS:`--import ${pathToFileURL(preload).href}`,LAUNCH_HTTP_RPC_URL:`http://127.0.0.1:${adapter.address().port}`,
   LAUNCH_SITE_ORIGIN:origin,LAUNCH_SECRET_KEY:process.env.LAUNCH_SECRET_KEY,SUPABASE_SERVICE_ROLE_KEY:'isolated-service',STRIPE_SECRET_KEY:'',STRIPE_WEBHOOK_SECRET:'',VERCEL:'0',VERCEL_ENV:'development',LAUNCH_WORKER_SECRET:'a'.repeat(64),LAUNCH_EMAIL_ENABLED:'true',LAUNCH_EMAIL_TRACKING_DISABLED:'true',LAUNCH_EMAIL_TEST_RECIPIENTS:'guest@example.com',RESEND_API_KEY:'isolated-resend'},
  stdio:['ignore','pipe','pipe']});
 let output='';next.stdout.on('data',c=>{output+=c;});next.stderr.on('data',c=>{output+=c;});
 for(let i=0;i<100;i++){try{if((await fetch(`${base}/api/launch/return`,{redirect:'manual'})).status===303)break;}catch{}await new Promise(r=>setTimeout(r,100));if(i===99)throw Error('Next test server did not start: '+output.slice(-1000));}
 const post=(path,body,access,custom={})=>fetch(`${base}/api/launch/${path}`,{method:'POST',headers:{origin,'content-type':'application/json',...(access?{authorization:`Bearer ${access}`} :{}),...custom},body:typeof body==='string'?body:JSON.stringify(body)});
 assert.equal((await fetch(`${base}/api/launch/checkout?night=bad`)).status,400);
 assert.equal((await fetch(`${base}/preview/reservation-qr`)).status,404,'Synthetic QR fixture must not be available outside Vercel Preview');
 assert.equal((await post('credentials',{},null,{origin:'https://attacker.example'})).status,429);
 assert.equal((await post('credentials',' '.repeat(1025))).status,413);
 assert.equal((await post('credentials',[])).status,400);
 const credentialResponse=await post('credentials',{});assert.equal(credentialResponse.status,200);
 assert.equal(credentialResponse.headers.get('cache-control'),'private, no-store');
 const capability=await credentialResponse.json();const c=openCredential(capability.access,'access');
 const {night}=await fixture(db);
 await rpc('prepare_launch_checkout',{p_id:c.id,p_night:night,p_email:'guest@example.com',p_name:'Guest',p_locale:'en',p_policy:'launch-v1',p_late_ack:true,
  p_management_secret:c.management,p_arrival_secret:c.arrival,p_envelope:sealCredential(c,'delivery'),p_account:'acct_http',p_origin:origin});
 const status=await post('checkout',{action:'status'},capability.access);assert.equal(status.status,200);assert.equal((await status.json()).email,'guest@example.com');
 const other=await (await post('credentials',{})).json();assert.equal((await post('checkout',{action:'status'},other.access)).status,401);
 for(const access of ['guest@example.com',capability.access.slice(0,-5)+'AAAAA',sealCredential({...c,issued:Date.now()-8*86400000},'access')])assert.equal((await post('checkout',{action:'status'},access)).status,401);
 for(const body of [null,[],{action:['status']},{action:'status',email:'guest@example.com'},{action:'create',booking:{amount_minor:1}},{action:'create',booking:{night,email:'guest@example.com',name:'Guest',locale:'en',policy:'launch-v1',late_ack:true,currency:'usd'}}]){
  assert.equal((await post('checkout',body,capability.access)).status,400);
 }
 assert.equal((await post('checkout','x'.repeat(4097),capability.access)).status,413);
 const count=await scalar(db,'select count(*)::int from private.launch_reservations');assert.equal(count,1);
 const returned=await fetch(`${base}/api/launch/return?session_id=cs_fake&paid=true`,{redirect:'manual'});assert.equal(returned.status,303);assert.equal(returned.headers.get('location'),origin+'/reservations/access');
 assert.equal(await scalar(db,"select count(*)::int from private.launch_payments where state='paid'"),0);
 assert.equal((await post('process',{limit:5})).status,401);
 for(let i=0;i<35;i++)await post('credentials',{});
 assert.equal((await post('credentials',{})).status,429);
 // Separate fixture rate window for the QR contract; production limits are unchanged.
 await db.query('delete from private.launch_http_limits');
 assert.equal((await fetch(`${base}/api/launch/arrival-qr`)).status,405);
 assert.equal((await post('arrival-qr',{},capability.access,{origin:'https://attacker.example'})).status,429);
 for(const body of [null,[],{id:c.id},{email:'guest@example.com'},{secret:c.arrival}])assert.equal((await post('arrival-qr',body,capability.access)).status,400);
 assert.equal((await post('arrival-qr?paid=true',{},capability.access)).status,400);
 assert.equal((await post('arrival-qr',' '.repeat(1025),capability.access)).status,413);
 for(const access of [null,other.access,c.arrival,sealCredential({...c,issued:Date.now()-8*86400000},'access')])assert.equal((await post('arrival-qr',{},access)).status,401);
 assert.equal((await post('arrival-qr',{},capability.access)).status,409);
 await pay(db,c);
 const qrResponse=await post('arrival-qr',{},capability.access);assert.equal(qrResponse.status,200);
 assert.equal(qrResponse.headers.get('cache-control'),'private, no-store');
 assert.equal(qrResponse.headers.get('referrer-policy'),'no-referrer');
 const qr=await qrResponse.json();assert.equal(qr.reservation_id,c.id);assert.equal(qr.night_id,night);
 assert.deepEqual(Object.keys(qr).sort(),['reservation_id','night_id','starts_at','ends_at','timezone','verified_at','png_data_url'].sort());
 const {data,info}=await sharp(Buffer.from(qr.png_data_url.split(',')[1],'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(jsQR(new Uint8ClampedArray(data),info.width,info.height)?.data,c.arrival);
 assert.deepEqual(await (await post('arrival-qr',{},capability.access)).json(),qr);
 assert.equal(await scalar(db,'select count(*)::int from private.launch_arrivals'),0);
 // #192: real route and SQL, with no provider request from cancellation.
 await db.query('delete from private.launch_http_limits');
 assert.equal((await fetch(`${base}/api/launch/cancellation`)).status,405);
 for(const body of [null,[],{action:'confirm',accept_retained:'true'},{action:'preview',accept_retained:true},{action:'confirm',accept_retained:false,id:c.id}])assert.equal((await post('cancellation',body,capability.access)).status,400);
 assert.equal((await post('cancellation?x=1',{action:'preview',accept_retained:false},capability.access)).status,400);
 assert.equal((await post('cancellation',' '.repeat(1025),capability.access)).status,413);
 assert.equal((await post('cancellation',{action:'confirm',accept_retained:false},capability.access,{origin:'https://attacker.example'})).status,429);
 assert.equal((await post('cancellation',{action:'preview',accept_retained:false},other.access)).status,401);
 // Public availability polling on the same address must not consume guest command budgets.
 for(let i=0;i<30;i++)assert.equal((await fetch(`${base}/api/launch/checkout?night=${night}`)).status,200);
 assert.equal((await fetch(`${base}/api/launch/checkout?night=${night}`)).status,429);
 for(const action of ['preview','confirm'])assert.equal((await post('cancellation',{action,accept_retained:false},'invalid-access')).status,429);
 assert.equal((await post('checkout',{action:'status'},capability.access)).status,200);
 // This harness disables Stripe; valid resume reaches that dependency instead of the public rate refusal.
 for(const body of [{action:'resume'},{action:'create',booking:{night,email:'guest@example.com',name:'Guest',locale:'en',policy:'launch-v1',late_ack:true}}]){
  // Creation stays on the public budget: collisions must not get a per-capability allowance.
  if(body.action==='create'){assert.equal((await post('checkout',body,capability.access)).status,429);continue;}
  const response=await post('checkout',body,capability.access);assert.equal(response.status,503);
  assert.equal((await response.json()).error,'checkout_pending');
  assert.equal((await post('checkout',body,'invalid-access')).status,429);
 }
 assert.equal((await post('credentials',{},capability.access)).status,429);
 const preview=await post('cancellation',{action:'preview',accept_retained:false},capability.access);
 assert.equal(preview.status,200);
 assert.equal(preview.headers.get('cache-control'),'private, no-store');assert.equal((await preview.json()).can_cancel,true);
 assert.equal((await getCurrent()).state,'confirmed');
 async function getCurrent(){return rpc('get_launch_reservation',{p_id:c.id,p_secret:c.management});}
 const cancelled=await post('cancellation',{action:'confirm',accept_retained:false},capability.access);
 assert.equal(cancelled.status,200);assert.equal((await cancelled.json()).reservation.state,'cancelled');
 assert.equal((await post('cancellation',{action:'confirm',accept_retained:false},capability.access)).status,200);
 assert.equal(await scalar(db,"select count(*)::int from private.launch_audit where reservation_id=$1 and action='participant_cancelled'",[c.id]),1);
 console.log('PASS cancellation HTTP: bounded strict input, origin, ownership, read-only preview, atomic cancellation and harmless retry');
 await cancel(db,c);
 assert.equal((await post('arrival-qr',{},capability.access)).status,409);
 assert.equal(await scalar(db,'select count(*)::int from private.launch_arrivals'),0);
 // Public waitlist and recovery facades exercise the actual SQL through PostgREST.
 await db.query('delete from private.launch_http_limits');
 for(const endpoint of ['access','waitlist']) {
  assert.equal((await post(endpoint,{},null,{origin:'https://attacker.example'})).status,429);
  assert.equal((await post(endpoint,'x'.repeat(2049))).status,413);
  assert.equal((await post(endpoint,[])).status,400);
 }
 const recoveryKnown=await post('access',{action:'request',night,email:'guest@example.com'});
 const recoveryUnknown=await post('access',{action:'request',night,email:'unknown@example.com'});
 assert.equal(recoveryKnown.status,202);assert.equal(recoveryUnknown.status,202);
 assert.deepEqual(await recoveryKnown.json(),await recoveryUnknown.json());
 assert.equal((await post('checkout',{action:'status'},capability.access)).status,200,'requesting email never revokes access');
 let mail=await rpc('claim_launch_access_mail',{p_origin:origin,p_recipients:['guest@example.com']});
 if(mail.kind==='participant_cancelled') {
  await rpc('finish_launch_access_mail',{p_id:mail.id,p_claim:mail.claim,p_state:'sent',p_provider:'isolated_cancellation'});
  mail=await rpc('claim_launch_access_mail',{p_origin:origin,p_recipients:['guest@example.com']});
 }
 assert.equal(mail.kind,'recovery');
 const emailToken=randomBytes(32).toString('hex');
 await rpc('bind_launch_access_mail',{p_id:mail.id,p_claim:mail.claim,p_token:emailToken,p_envelope:sealAccessProof({token:emailToken})});
 assert.equal((await post('access',{action:'exchange',id:mail.id,token:'0'.repeat(64)})).status,401);
 const recovered=await post('access',{action:'exchange',id:mail.id,token:emailToken});assert.equal(recovered.status,200);
 const newAccess=await recovered.json();assert.equal(newAccess.id,c.id);
 assert.equal((await post('checkout',{action:'status'},newAccess.access)).status,200);
 assert.equal((await post('checkout',{action:'status'},capability.access)).status,401);
 assert.equal(openCredential(newAccess.access,'access').arrival,c.arrival);
 const otherNight=await fixture(db);const holder=issueFixtureCredential();
 await rpc('prepare_launch_checkout',{p_id:holder.id,p_night:otherNight.night,p_email:'holder@example.com',p_name:'Holder',p_locale:'en',p_policy:'launch-v1',p_late_ack:true,p_management_secret:holder.management,p_arrival_secret:holder.arrival,p_envelope:sealCredential(holder,'delivery'),p_account:'acct_http',p_origin:origin});
 assert.equal((await post('waitlist',{night:otherNight.night,email:' waiting@example.com ',locale:'fr'})).status,200);
 assert.equal((await post('waitlist',{night:otherNight.night,email:'WAITING@example.com',locale:'fr'})).status,200);
 assert.equal(await scalar(db,'select count(*)::int from private.launch_waitlist where night_id=$1',[otherNight.night]),1);
 assert.equal((await post('waitlist',{night:otherNight.night,email:'waiting@example.com',locale:'fr',marketing:true})).status,400);
 // Exercise compiled mail transport against an isolated provider adapter. A lost
 // response retries the same provider operation without a second accepted email.
 await db.query("update private.launch_access_mail set state='queued',lease_until=null,claim_id=null where id=$1",[mail.id]);
 const work=await post('process',{limit:1},'a'.repeat(64));assert.equal(work.status,503,'Stripe is disabled independently of mail');
 assert.equal((await work.json()).email_attempts,1);assert.equal(emailRequests.length,1);assert.equal(acceptedEmails.size,1);
 assert.equal(await scalar(db,'select state from private.launch_access_mail where id=$1',[mail.id]),'failed');
 await db.query("update private.launch_access_mail set next_attempt_at=clock_timestamp()-interval '1 second' where id=$1",[mail.id]);
 await post('process',{limit:1},'a'.repeat(64));
 assert.equal(emailRequests.length,2);assert.equal(acceptedEmails.size,1);assert.deepEqual(emailRequests[0],emailRequests[1]);
 assert.equal(await scalar(db,'select state from private.launch_access_mail where id=$1',[mail.id]),'sent');
 assert.deepEqual(emailRequests[0].body.to,['guest@example.com']);assert.match(emailRequests[0].body.text,/reservations\/access#/);
 assert.ok(!emailRequests[0].body.headers,'transactional access has no marketing unsubscribe headers');
 // #189: compiled renderer, real SQL and fake provider; complete confirmation
 // replaces the access-only email and embeds the independent QR locally.
 const sendNext=async()=>{
  const before=emailRequests.length;
  await post('process',{limit:1},'a'.repeat(64));
  assert.equal(emailRequests.length,before+1);
  return emailRequests.at(-1).body;
 };
 async function paidMailFixture(locale='en',late=false,usd=false) {
  const {night}=await fixture(db,usd?{opens:'1 hour'}:late?{start:'1 day',end:'1 day 4 hours'}:{});const credential=issueFixtureCredential();
  if(usd){await db.query("update private.launch_events set deposit_minor=2500,currency='usd',registration_opens_at=clock_timestamp()-interval '1 hour' where night_id=$1",[night]);await db.query("update venues set timezone='America/New_York',city='New York' where id=(select venue_id from venue_nights where id=$1)",[night]);}
  await rpc('prepare_launch_checkout',{p_id:credential.id,p_night:night,p_email:'guest@example.com',p_name:'Guest',p_locale:locale,p_policy:'launch-v1',p_late_ack:true,p_management_secret:credential.management,p_arrival_secret:credential.arrival,p_envelope:sealCredential(credential,'delivery'),p_account:'acct_http',p_origin:origin});
  if(usd){
   const suffix=credential.id.replaceAll('-','');await rpc('bind_launch_checkout',{p_id:credential.id,p_checkout:'cs_'+suffix});
   await rpc('record_launch_payment',{p_id:credential.id,p_checkout:'cs_'+suffix,p_payment:'pi_'+suffix,p_amount:2500,p_currency:'usd'});
  }else await pay(db,credential);
  return {...credential,night};
 }
 for(const locale of ['en','fr','es']) {
  const reservation=await paidMailFixture(locale,locale==='fr');const confirmation=await sendNext();
  assert.equal(confirmation.attachments.length,1);const asset=confirmation.attachments[0];
  assert.equal(asset.content_id,'reservation-qr');assert.equal(asset.content_type,'image/png');assert.ok(!asset.path);
  assert.match(confirmation.html,/src="cid:reservation-qr"/);assert.match(confirmation.text,/Europe\/Paris/);
  assert.match(confirmation.text,/hello@getamourette.com/);assert.match(confirmation.text,/reservations\/access#/);assert.ok(confirmation.text.includes('/events/'+reservation.night),'expired proof retains an ordinary recovery entry');
  assert.match(confirmation.html,new RegExp('lang="'+locale+'"'));assert.doesNotMatch(confirmation.text,/\u2014|marketing/i);
  assert.ok(!JSON.stringify(confirmation).includes(reservation.management));
  const decoded=await sharp(Buffer.from(asset.content,'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(jsQR(new Uint8ClampedArray(decoded.data),decoded.info.width,decoded.info.height)?.data,reservation.arrival);
  if(locale==='fr')assert.match(confirmation.text,/date limite d’annulation gratuite est dépassée/);
  await writeFile(`/tmp/launch-mail-preview-${locale}.html`,confirmation.html.replace('cid:reservation-qr','data:image/png;base64,'+asset.content));
  const initialEmails=emailRequests.length;await pay(db,reservation);await post('process',{limit:1},'a'.repeat(64));assert.equal(emailRequests.length,initialEmails,'no duplicate initial access mail');
  await cancel(db,reservation);const cancellation=await sendNext();assert.ok(!cancellation.attachments);assert.ok(!cancellation.html.includes('cid:'));
  await writeFile(`/tmp/launch-mail-cancellation-${locale}.html`,cancellation.html);
  if(locale==='fr')assert.match(cancellation.text,/dépôt est conservé/);
  else assert.match(cancellation.text,locale==='en'?/refunded in full/:/reembolso íntegro/);
  const reason=locale==='es'?'postponed':'cancelled';await admin(db,'select admin_cancel_launch_event($1,$2)',[reservation.night,reason]);
  const organizer=await sendNext();assert.ok(!organizer.attachments);assert.match(organizer.text,locale==='en'?/new date requires a new reservation/:locale==='fr'?/nouvelle date nécessite une nouvelle réservation/:/nueva fecha requiere una nueva reserva/);
  await writeFile(`/tmp/launch-mail-organizer-${locale}.html`,organizer.html);
  // No message for queued/pending/failed/review-needed refund work.
  const beforeSuccess=emailRequests.length;await post('process',{limit:1},'a'.repeat(64));assert.equal(emailRequests.length,beforeSuccess);
  await db.query("update private.launch_refunds set state='succeeded',provider_refund_id=$2 where reservation_id=$1",[reservation.id,'re_'+reservation.id.replaceAll('-','')]);
  const refund=await sendNext();assert.ok(!refund.attachments);assert.match(refund.text,locale==='en'?/several business days/:locale==='fr'?/quelques jours ouvrés/:/varios días hábiles/);
  await writeFile(`/tmp/launch-mail-refund-${locale}.html`,refund.html);
  await db.query("update private.launch_refunds set state='failed' where reservation_id=$1",[reservation.id]);
  const afterSuccess=emailRequests.length;await post('process',{limit:1},'a'.repeat(64));assert.equal(emailRequests.length,afterSuccess,'no automatic failure notification');
 }
 const usReservation=await paidMailFixture('en',false,true);assert.ok(usReservation);
 const usConfirmation=await sendNext();assert.match(usConfirmation.text,/\$25\.00/);assert.match(usConfirmation.text,/America\/New_York/);assert.ok(!usConfirmation.text.includes('€'));
 // Corrected recipient: one current summary; the old address gets no new mail.
 const corrected=await paidMailFixture();
 await admin(db,"select admin_correct_launch_email($1,'holder@example.com','Verified corrected email')",[corrected.id]);
 const oldAddressCount=emailRequests.length;await post('process',{limit:1},'a'.repeat(64));assert.equal(emailRequests.length,oldAddressCount,'corrected address outside preview allowlist is not sent');
 // Correct back to the allowed address. Only the newest correction can send.
 await admin(db,"select admin_correct_launch_email($1,'guest@example.com','Verified recipient again')",[corrected.id]);
 const summary=await sendNext();assert.match(summary.text,/reservation, updated/i);assert.deepEqual(summary.to,['guest@example.com']);assert.equal(summary.attachments.length,1);
 const matches=summary.text.match(/reservations\/access#([a-f0-9-]+)\.([a-f0-9]{64})/);assert.ok(matches);
 const exchange=await post('access',{action:'exchange',id:matches[1],token:matches[2]});assert.equal(exchange.status,200);
 const correctedCredential=openCredential((await exchange.json()).access,'access');
 assert.equal(correctedCredential.arrival,corrected.arrival);corrected.management=correctedCredential.management;
 await cancel(db,corrected);
 await admin(db,"select admin_correct_launch_email($1,'holder@example.com','Verified recipient')",[corrected.id]);
 await admin(db,"select admin_correct_launch_email($1,'guest@example.com','Verified recipient')",[corrected.id]);
 const cancelledSummary=await sendNext();assert.match(cancelledSummary.text,/arrival QR is no longer valid/);assert.ok(!cancelledSummary.attachments);assert.match(cancelledSummary.text,/reservations\/access#/);
 await writeFile('/tmp/launch-mail-corrected-cancelled.html',cancelledSummary.html);
 console.log('PASS lifecycle HTTP/provider: EN/FR/ES complete confirmation and decoded CID QR, cutoff copy, cancellation/retention, organizer cancel/postpone, actual refund success, no reminders/attendance/failure mail, corrected summary and QR-preserving access');
 console.log('PASS isolated mail HTTP: provider response loss, identical retry, one accepted email, preview recipient restriction, Stripe failure independence');
 console.log('PASS guest HTTP: generic recovery, strict inputs/origin, proof exchange, original access revoked, QR preserved, free waitlist deduplication');
 console.log('PASS private arrival QR HTTP: paid-only delivery, exact body, origin, expiry, ownership, independent PNG decoding, read-only replay and cancellation');
 console.log(`PASS ${process.env.LAUNCH_HTTP_DEV==='1'?'development':'production'} Next HTTP: origin, body bounds/shapes, guest capabilities, expiry/tamper, email non-authorization, immutable price input, no-store, untrusted return, worker auth and shared rate limit`);
}finally{
 if(next){next.kill('SIGTERM');await new Promise(resolve=>next.once('exit',resolve));}
 if(adapter)await new Promise(resolve=>adapter.close(resolve));await pg.close();await rm(directory,{recursive:true,force:true});
}
