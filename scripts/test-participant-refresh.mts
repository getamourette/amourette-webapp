import assert from 'node:assert/strict';
import { mock } from 'node:test';
// @ts-expect-error Node strips types and requires source extensions.
import { createParticipantRefresh, isParticipantSignal, parseParticipantRevision } from '../lib/participant-refresh.ts';

for (const invalid of [null, [], 'state_changed', {}, {version:'1'}, {version:1,reason:'block'}, {version:1,id:'person'}, {version:1,id:crypto.randomUUID(),subject:crypto.randomUUID()}]) assert.equal(isParticipantSignal(invalid),false);
assert.equal(isParticipantSignal({version:1}),true);
assert.equal(isParticipantSignal({version:1,id:crypto.randomUUID()}),true);
assert.equal(parseParticipantRevision(null),null);
for(const value of ['',{},0,[], 'not-a-uuid']) assert.throws(()=>parseParticipantRevision(value));

mock.timers.enable({apis:['setTimeout']});
const flush=async()=>{for(let i=0;i<8;i++) await Promise.resolve();};
let calls=0; let release:()=>void=()=>{}; let current:()=>boolean=()=>false; let signal:AbortSignal|undefined;
const refresh=createParticipantRefresh(async (nextSignal,isCurrent)=>{
  calls++;signal=nextSignal;current=isCurrent;
  await new Promise<void>(resolve=>{release=resolve;});
  return isCurrent();
});
const burst=Array.from({length:100},()=>refresh.request());
mock.timers.tick(199);assert.equal(calls,0);
mock.timers.tick(1);assert.equal(calls,1);assert.equal(current(),true);
const trailing=refresh.request();assert.equal(current(),false,'invalidate before a second read starts');
mock.timers.tick(1000);assert.equal(calls,1,'never overlap reads');
release();await flush();mock.timers.tick(200);assert.equal(calls,2);
release();await flush();assert.equal(await trailing,true);assert.ok((await Promise.all(burst)).every(Boolean));
const disposed=refresh.request();mock.timers.tick(200);refresh.dispose();assert.equal(signal?.aborted,true);assert.equal(current(),false);assert.equal(await disposed,false);
release();await flush();mock.timers.tick(10000);assert.equal(calls,3);
let retries=0;
const recovering=createParticipantRefresh(async()=>++retries>1);
const failed=recovering.request();mock.timers.tick(200);await flush();assert.equal(await failed,false);
mock.timers.tick(4999);assert.equal(retries,1);mock.timers.tick(1);await flush();assert.equal(retries,2);
recovering.dispose();mock.timers.reset();
mock.timers.enable({apis:['setTimeout']});
let attempts=0;let obsolete:AbortSignal|undefined;
const recovery=createParticipantRefresh(async signal=>{
  if(++attempts>1)return true;
  obsolete=signal;
  await new Promise<void>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  return false;
});
const stalled=recovery.request();mock.timers.tick(200);await flush();
const resumed=recovery.request(true);assert.equal(obsolete?.aborted,true);
await flush();mock.timers.tick(200);await flush();
assert.equal(await stalled,true);assert.equal(await resumed,true);assert.equal(attempts,2);
recovery.dispose();mock.timers.reset();
mock.timers.enable({apis:['setTimeout']});
let eventReads=0;
const interruptedRetry=createParticipantRefresh(async()=>++eventReads>1);
const unsuccessful=interruptedRetry.request();mock.timers.tick(200);await flush();assert.equal(await unsuccessful,false);
const changed=interruptedRetry.request();mock.timers.tick(200);await flush();
assert.equal(eventReads,2,'a new event does not wait for the old failure backoff');
assert.equal(await changed,true);interruptedRetry.dispose();mock.timers.reset();
console.log('participant refresh: strict signals, burst coalescing, stale reads, trailing delivery, disposal and retry passed');
