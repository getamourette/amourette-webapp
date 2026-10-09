import assert from 'node:assert/strict';
import { mock } from 'node:test';
// @ts-expect-error Node strips types and requires source extensions.
import { combineAbortSignals, createParticipantRefresh, isParticipantSignal, parseParticipantRevision } from '../lib/participant-refresh.ts';

const signalDescriptors = ['any', 'timeout'].map(name => [name, Object.getOwnPropertyDescriptor(AbortSignal, name)] as const);
for (const [name] of signalDescriptors) Object.defineProperty(AbortSignal, name, { configurable: true, value: undefined });
const parent = new AbortController();
parent.abort();
const cancelled = combineAbortSignals([parent.signal]);
assert.equal(cancelled.signal.aborted, true, 'already cancelled parents cancel the composed signal');
cancelled.dispose();

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
mock.timers.enable({apis:['setTimeout']});
let timeoutAttempts=0;
const timeoutRecovery=createParticipantRefresh(async signal=>{
  if (++timeoutAttempts > 1) return true;
  await new Promise<void>(resolve=>signal.addEventListener('abort',()=>resolve(),{once:true}));
  return false;
});
const timedOut=timeoutRecovery.request();mock.timers.tick(200);await flush();
mock.timers.tick(15_000);await flush();assert.equal(await timedOut,false);
mock.timers.tick(5000);await flush();assert.equal(timeoutAttempts,2);
timeoutRecovery.dispose();mock.timers.reset();
mock.timers.enable({apis:['setTimeout']});
let pollReads = 0;
let finishPollRead: () => void = () => {};
let pollReadCurrent: () => boolean = () => false;
const polled = createParticipantRefresh(async (_signal, isCurrent) => {
  pollReads++;
  pollReadCurrent = isCurrent;
  await new Promise<void>(resolve => { finishPollRead = resolve; });
  return isCurrent();
});
const fresh = polled.request();
mock.timers.tick(200);
polled.poll();
assert.equal(pollReadCurrent(), true, 'a routine poll must preserve the current in-flight response');
finishPollRead();await flush();assert.equal(await fresh,true);
mock.timers.tick(200);assert.equal(pollReads,1,'a busy poll must not queue a redundant read');
polled.poll();mock.timers.tick(199);assert.equal(pollReads,1);
polled.poll();mock.timers.tick(1);assert.equal(pollReads,2,'idle polls coalesce and start a fresh read');
const mutation = polled.request();
assert.equal(pollReadCurrent(),false,'real changes still invalidate responses during a poll');
polled.poll();finishPollRead();await flush();mock.timers.tick(200);
assert.equal(pollReads,3,'the changed state receives one trailing read');
finishPollRead();await flush();assert.equal(await mutation,true);
polled.dispose();mock.timers.reset();
mock.timers.enable({apis:['setTimeout']});
let backedOffReads = 0;
const backedOff = createParticipantRefresh(async () => ++backedOffReads > 1);
backedOff.poll();mock.timers.tick(200);await flush();
backedOff.poll();mock.timers.tick(4999);assert.equal(backedOffReads,1,'polls preserve failure backoff');
mock.timers.tick(1);await flush();assert.equal(backedOffReads,2);
backedOff.dispose();backedOff.poll();mock.timers.tick(10000);assert.equal(backedOffReads,2,'disposed polls do nothing');
mock.timers.reset();
for (const [name, descriptor] of signalDescriptors) {
  if (descriptor) Object.defineProperty(AbortSignal, name, descriptor);
  else Reflect.deleteProperty(AbortSignal, name);
}
console.log('participant refresh: strict signals, burst coalescing, stale reads, trailing delivery, non-invalidating polls, disposal and retry passed');
