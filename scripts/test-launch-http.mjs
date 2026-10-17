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
import { installLaunchSchema,service,fixture,scalar,pay,cancel } from './launch-test-database.mjs';
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
 const preview=await post('cancellation',{action:'preview',accept_retained:false},capability.access);
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
 const mail=await rpc('claim_launch_access_mail',{p_origin:origin,p_recipients:['guest@example.com']});
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
 console.log('PASS isolated mail HTTP: provider response loss, identical retry, one accepted email, preview recipient restriction, Stripe failure independence');
 console.log('PASS guest HTTP: generic recovery, strict inputs/origin, proof exchange, original access revoked, QR preserved, free waitlist deduplication');
 console.log('PASS private arrival QR HTTP: paid-only delivery, exact body, origin, expiry, ownership, independent PNG decoding, read-only replay and cancellation');
 console.log(`PASS ${process.env.LAUNCH_HTTP_DEV==='1'?'development':'production'} Next HTTP: origin, body bounds/shapes, guest capabilities, expiry/tamper, email non-authorization, immutable price input, no-store, untrusted return, worker auth and shared rate limit`);
}finally{
 if(next){next.kill('SIGTERM');await new Promise(resolve=>next.once('exit',resolve));}
 if(adapter)await new Promise(resolve=>adapter.close(resolve));await pg.close();await rm(directory,{recursive:true,force:true});
}
