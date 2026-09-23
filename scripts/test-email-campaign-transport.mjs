import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
// Execute the real worker with isolated provider/database seams, never the network.
let source=ts.transpileModule(readFileSync('lib/server/email-delivery.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
source=source.replace(/^import[\s\S]*?;\n/gm,'');
source='const {createClient, renderWelcomeEmail, createEmailPreferenceLinks, isRetryableResendStatus, retryAt, CAMPAIGN_PREFERENCE_URL, isCampaignMessage} = globalThis.__campaignTransport;\n'+source;
const placeholder='https://getamourette.com/unsubscribe?token=CAMPAIGN_PREVIEW';
let mode='sent', allowed=true, requested=0, enabled=true, updates=[], calls=[];
const delivery={id:'delivery-1',kind:'upcoming_nights',recipient_email:'test@example.com',locale:'fr',attempt_count:1,message:{subject:'Frozen subject',html:`<a href="${placeholder}">Preferences</a>`,text:placeholder}};
const client={
  rpc:async name=>{calls.push(name);return {data:name==='claim_email_delivery'?delivery:allowed,error:null};},
  from:()=>({update:values=>{const filters=[];const query={eq:(...pair)=>{filters.push(pair);return query;},then:resolve=>resolve({error:null})};updates.push({values,filters});return query;}}),
};
globalThis.__campaignTransport={createClient:()=>client,renderWelcomeEmail:async()=>({subject:'Welcome',html:'welcome',text:'welcome'}),createEmailPreferenceLinks:async()=>({preferencesUrl:'https://getamourette.com/unsubscribe?token=private',headers:{'List-Unsubscribe':'<https://getamourette.com/api/unsubscribe/one-click?token=private>','List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}}),isRetryableResendStatus:status=>status===429||status>=500,retryAt:()=>new Date(0).toISOString(),CAMPAIGN_PREFERENCE_URL:placeholder,isCampaignMessage:value=>Boolean(value?.subject&&value?.html&&value?.text)};
const originalFetch=globalThis.fetch;
globalThis.fetch=async(_url,options)=>{
  assert.ok(enabled);requested++;
  assert.equal(calls.at(-1),'authorize_email_transport','consent check is immediately before transport');
  const body=JSON.parse(options.body);
  assert.equal(body.subject,'Frozen subject');assert.equal(body.to[0],'test@example.com');
  assert.ok(body.html.includes('token=private') && !body.html.includes('CAMPAIGN_PREVIEW'));
  assert.equal(body.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
  assert.equal(options.headers['Idempotency-Key'],`delivery-1:${delivery.attempt_count}`);
  if(mode==='timeout')throw new Error('network response lost');
  if(mode==='failure')return new Response('',{status:429});
  if(['500','408','409'].includes(mode))return new Response('',{status:Number(mode)});
  if(mode==='malformed')return new Response('{}',{status:200});
  return new Response('{"id":"provider-1"}',{status:200});
};
const saved={EMAIL_DELIVERY_ENABLED:process.env.EMAIL_DELIVERY_ENABLED,VERCEL_ENV:process.env.VERCEL_ENV,RESEND_API_KEY:process.env.RESEND_API_KEY};
process.env.EMAIL_DELIVERY_ENABLED='true';process.env.VERCEL_ENV='production';process.env.RESEND_API_KEY='isolated-test';
const {deliverEmail}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
try {
  assert.equal(await deliverEmail('delivery-1'),'sent');
  assert.equal(updates.at(-1).values.status,'sent');
  mode='failure';delivery.attempt_count=2;
  assert.equal(await deliverEmail('delivery-1'),'failed');assert.equal(updates.at(-1).values.last_error_code,'resend_http_429');
  for(mode of ['timeout','malformed','500','408','409']) { assert.equal(await deliverEmail('delivery-1'),'unknown');assert.equal(updates.at(-1).values.status,'unknown'); }
  const before=requested;allowed=false;assert.equal(await deliverEmail('delivery-1'),'skipped');assert.equal(requested,before);
  enabled=false;process.env.VERCEL_ENV='preview';assert.equal(await deliverEmail('delivery-1'),'disabled');assert.equal(requested,before);
  for(const update of updates)assert.deepEqual(update.filters,[['id','delivery-1'],['status','sending']],'late transport completion cannot overwrite a terminal webhook');
} finally {
  globalThis.fetch=originalFetch;delete globalThis.__campaignTransport;
  for(const [key,value]of Object.entries(saved)) {if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
console.log('Actual campaign worker: frozen content, one-click headers, consent race, retries and ambiguous outcomes passed.');
