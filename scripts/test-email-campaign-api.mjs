import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { parseCampaignCommand, CAMPAIGN_PREFERENCE_URL } from '../lib/email-campaigns.ts';
import { readBoundedJson, RequestBodyError } from '../lib/server/request-body.ts';
let actor='founder', allowed=true, sending=false, serviceCalls=[];
const actorId='00000000-0000-0000-0000-000000000001';
const campaignId='00000000-0000-0000-0000-000000000002';
const service={rpc:async(name,args)=>{serviceCalls.push({name,args});return {data:{nights:[],campaigns:[],hasMore:false},error:null};}};
globalThis.__campaignApi={parseCampaignCommand,CAMPAIGN_PREFERENCE_URL,readBoundedJson,RequestBodyError,
  createClient:()=>({auth:{getUser:async()=>({data:{user:actor?{id:actorId}:null},error:null})},rpc:async()=>({data:allowed,error:null})}),
  createServiceClient:()=>service,emailDeliveryEnabled:()=>sending,renderUpcomingNightsEmail:async()=>({subject:'Subject',html:'HTML',text:'Text'})};
let code=ts.transpileModule(readFileSync('app/api/admin/email-campaigns/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
code=code.replace(/^import[\s\S]*?;\n/gm,'');
code='const {createClient,parseCampaignCommand,CAMPAIGN_PREFERENCE_URL,readBoundedJson,RequestBodyError,createServiceClient,emailDeliveryEnabled,renderUpcomingNightsEmail}=globalThis.__campaignApi;\n'+code;
const {GET,POST}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const request=(body,auth=true)=>new Request('https://example.invalid/api/admin/email-campaigns',{method:'POST',headers:auth?{Authorization:'Bearer isolated'}:{},body:typeof body==='string'?body:JSON.stringify(body)});
try {
  assert.equal((await GET(new Request('https://example.invalid/api/admin/email-campaigns'))).status,401);
  for(const who of ['no-user','non-founder']) {
    actor=who==='no-user'?'':'founder';allowed=who!=='non-founder';
    assert.equal((await POST(request({action:'review',campaignId}))).status,401);
  }
  actor='founder';allowed=true;
  for(const input of [null,[],{}, {action:'retry',campaignId,confirmed:true,actor:actorId},{action:'preview',nightIds:[campaignId,campaignId]}]) assert.equal((await POST(request(input))).status,400);
  assert.equal((await POST(request(' '.repeat(4097)))).status,413);
  for(const action of ['retry','confirm']) {
    const body={action,campaignId,confirmed:true,...(action==='confirm'?{audience:{eligible:1,en:1,fr:0,es:0,frequency:0,suppressed:0}}:{})};
    assert.equal((await POST(request(body))).status,409);
  }
  assert.equal(serviceCalls.length,0,'refusals have no privileged database effects');
  for(const query of ['offset=-20','offset=1','offset=100020','offset=0&offset=20','extra=1']) assert.equal((await GET(new Request(`https://example.invalid/api/admin/email-campaigns?${query}`,{headers:{Authorization:'Bearer isolated'}}))).status,400);
  const dashboard=await GET(new Request('https://example.invalid/api/admin/email-campaigns?offset=20',{headers:{Authorization:'Bearer isolated'}}));
  assert.equal(dashboard.status,200);assert.equal(dashboard.headers.get('cache-control'),'no-store');
  assert.deepEqual(serviceCalls.at(-1),{name:'admin_email_campaign_dashboard',args:{p_actor:actorId,p_offset:20}});
  sending=true;
  assert.equal((await POST(request({action:'retry',campaignId,confirmed:true}))).status,200);
  assert.equal(serviceCalls.at(-1).args.p_actor,actorId,'actor comes from verified Auth, never caller JSON');
} finally {delete globalThis.__campaignApi;}
console.log('Actual campaign API: Auth/founder checks, bounds, no-effects refusals and preview send protection passed.');
