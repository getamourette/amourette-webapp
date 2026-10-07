// Run after one production build. Isolated PostgREST adapter; no shared DB or Stripe calls.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { installLaunchSchema,service,fixture,scalar } from './launch-test-database.mjs';
import { openCredential,sealCredential } from '../lib/server/launch-secrets.ts';

const pg=new PGlite();const db={query:(sql,args)=>args?pg.query(sql,args):pg.exec(sql).then(r=>r.at(-1))};
process.env.LAUNCH_SECRET_KEY=randomBytes(32).toString('hex');
const directory=await mkdtemp(join(tmpdir(),'launch-http-'));
let next,adapter;let queue=Promise.resolve();
const rpc=async(name,args)=>{const entries=Object.entries(args);assert.match(name,/^[a-z_]+$/);
 return (await service(db,`select public.${name}(${entries.map(([key],i)=>`${key}=>$${i+1}`).join(',')}) result`,entries.map(([,v])=>v)))[0].result;};
try{
 await installLaunchSchema(db);
 adapter=createServer((req,res)=>{
  queue=queue.then(async()=>{
   try{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=JSON.parse(Buffer.concat(chunks).toString());
    const name=req.url.split('/').at(-1);const result=await rpc(name,body);
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(result));
   }catch(error){res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({code:error.code??'XX000',message:error.message,details:null,hint:null}));}
  });
 });
 await new Promise(resolve=>adapter.listen(0,'127.0.0.1',resolve));
 const preload=join(directory,'fetch.mjs');
 await writeFile(preload,`const original=globalThis.fetch;globalThis.fetch=(input,init)=>{const raw=typeof input==='string'?input:input instanceof URL?input.href:input.url;const url=new URL(raw);if(url.pathname.startsWith('/rest/v1/'))return original(process.env.LAUNCH_HTTP_RPC_URL+url.pathname+url.search,init);throw new Error('Unexpected external HTTP in isolated launch test');};`);
 const origin='http://127.0.0.1:3000',base='http://127.0.0.1:31185';
 next=spawn(process.execPath,['node_modules/next/dist/bin/next',process.env.LAUNCH_HTTP_DEV==='1'?'dev':'start','--hostname','127.0.0.1','--port','31185'],{
  env:{...process.env,NODE_OPTIONS:`--import ${pathToFileURL(preload).href}`,LAUNCH_HTTP_RPC_URL:`http://127.0.0.1:${adapter.address().port}`,
   LAUNCH_SITE_ORIGIN:origin,LAUNCH_SECRET_KEY:process.env.LAUNCH_SECRET_KEY,SUPABASE_SERVICE_ROLE_KEY:'isolated-service',STRIPE_SECRET_KEY:'',STRIPE_WEBHOOK_SECRET:'',VERCEL:'0'},
  stdio:['ignore','pipe','pipe']});
 let output='';next.stdout.on('data',c=>{output+=c;});next.stderr.on('data',c=>{output+=c;});
 for(let i=0;i<100;i++){try{if((await fetch(`${base}/api/launch/return`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));if(i===99)throw Error('Next test server did not start: '+output.slice(-1000));}
 const post=(path,body,access,custom={})=>fetch(`${base}/api/launch/${path}`,{method:'POST',headers:{origin,'content-type':'application/json',...(access?{authorization:`Bearer ${access}`} :{}),...custom},body:typeof body==='string'?body:JSON.stringify(body)});
 assert.equal((await fetch(`${base}/api/launch/checkout?night=bad`)).status,400);
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
 const returned=await fetch(`${base}/api/launch/return?session_id=cs_fake&paid=true`);assert.deepEqual(await returned.json(),{status:'verification_required',next:'resume_with_original_reservation_access'});
 assert.equal(await scalar(db,"select count(*)::int from private.launch_payments where state='paid'"),0);
 assert.equal((await post('process',{limit:5})).status,401);
 for(let i=0;i<35;i++)await post('credentials',{});
 assert.equal((await post('credentials',{})).status,429);
 console.log(`PASS ${process.env.LAUNCH_HTTP_DEV==='1'?'development':'production'} Next HTTP: origin, body bounds/shapes, guest capabilities, expiry/tamper, email non-authorization, immutable price input, no-store, untrusted return, worker auth and shared rate limit`);
}finally{
 if(next){next.kill('SIGTERM');await new Promise(resolve=>next.once('exit',resolve));}
 if(adapter)await new Promise(resolve=>adapter.close(resolve));await pg.close();await rm(directory,{recursive:true,force:true});
}
