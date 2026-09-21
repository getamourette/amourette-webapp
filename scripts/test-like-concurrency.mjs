import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { setImmediate } from 'node:timers/promises';
import pg from 'pg';
import { installLikeSchema,seedPair,token,command } from './like-test-database.mjs';

// Deliberately accept only a loopback, disposable PostgreSQL 17 database.
const url = new URL(process.env.LIKE_TEST_DATABASE_URL ?? 'postgres://postgres:test@127.0.0.1:55431/like_test');
assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Only a disposable local PostgreSQL server is allowed');
const clients = Array.from({length:3},()=>new pg.Client({connectionString:url.href}));
const [observer,one,two]=clients;
const timings=[];
async function waitFor(predicate,label) {
 const deadline=performance.now()+8000;
 while (!(await predicate())) {
   if(performance.now()>deadline) throw new Error(`Barrier timed out: ${label}`);
   await setImmediate();
 }
}
async function blocked(client) {
 await waitFor(async()=> (await observer.query('select cardinality(pg_blocking_pids($1))>0 blocked',[client.processID])).rows[0].blocked,'transaction waits on lock');
}
const counts=async(night)=>(await observer.query(`select (select count(*)::int from likes where venue_night_id=$1) likes,
 (select count(*)::int from matches where venue_night_id=$1) matches,
 (select count(*)::int from venue_match_events e join matches m on m.id=e.match_id where m.venue_night_id=$1) events`,[night])).rows[0];
try {
 await Promise.all(clients.map(c=>c.connect()));
 assert.equal(Math.floor(Number((await observer.query('show server_version_num')).rows[0].server_version_num)/10000),17);
 // Fail instead of clearing an existing schema. CI starts an empty service.
 assert.equal((await observer.query("select to_regclass('public.profiles') present")).rows[0].present,null,'Use a fresh test database');
 await installLikeSchema(observer);
 for(const client of clients) await client.query("set statement_timeout='10s'");

 // The same starting token is preserved for compatible edits, in either order.
 for(const reciprocal of [false,true]) for(const editFirst of [false,true]) for(const compatible of [false,true]) {
   const {a,b,venue,night}=await seedPair(observer);
   const aToken=await token(one,a,venue,b), bToken=await token(two,b,venue,a);
   if(reciprocal) await command(one,{actor:b,target:a,night,token:bToken});
   const edit=()=>two.query('update profiles set interested_in=$1 where id=$2',[compatible?['woman','man']:['man'],b]);
   const like=()=>command(one,{actor:a,target:b,night,token:aToken});
   const holder=editFirst?two:one, waiter=editFirst?one:two;
   await holder.query('begin');
   const first=await (editFirst?edit():like());
   const waiting=(editFirst?like():edit());
   await blocked(waiter);
   await holder.query('commit');
   const last=await waiting;
   assert.equal((editFirst?last:first).accepted,compatible||!editFirst);
   const established=reciprocal&&(compatible||!editFirst);
   assert.deepEqual(await counts(night),{likes:established?2:compatible?1:0,matches:Number(established),events:Number(established)});
 }
 console.log('Both orders: preference changes versus first and reciprocal likes passed.');

 // Two reciprocal writes, held at the pair lock: exactly one match/event.
 {
   const {a,b,venue,night}=await seedPair(observer);
   const ta=await token(one,a,venue,b),tb=await token(two,b,venue,a);
   await one.query('begin');
   await command(one,{actor:a,target:b,night,token:ta});
   const pending=command(two,{actor:b,target:a,night,token:tb});
   await blocked(two); await one.query('commit'); assert.ok((await pending).match_id);
   assert.deepEqual(await counts(night),{likes:2,matches:1,events:1});
 }
 // Concurrent identical receipt, mismatch reuse, unlike/re-like replay.
 {
   const {a,b,c,venue,night}=await seedPair(observer);
   const click={actor:a,target:b,night,token:await token(one,a,venue,b),request:crypto.randomUUID()};
   await one.query('begin'); await command(one,click);
   const same=command(two,click); await blocked(two); await one.query('commit'); assert.equal((await same).liked,true);
   await assert.rejects(command(two,{...click,target:c}),/identifier reused/);
   const remove={actor:a,target:b,night,action:'unlike',request:crypto.randomUUID()};
   await one.query('begin'); await command(one,remove);
   const add=command(two,{...click,request:crypto.randomUUID()}); await blocked(two); await one.query('commit'); await add;
   await command(one,remove); assert.equal((await counts(night)).likes,1);
 }
 // Two profile writers serialize before row locks. A round trip cannot revive a token.
 {
   const {a,b,venue,night}=await seedPair(observer);
   const old=await token(one,a,venue,b);
   await one.query('begin'); await one.query("update profiles set interested_in=array['man'] where id=$1",[a]);
   const edit=two.query("update profiles set interested_in=array['woman','man'] where id=$1",[b]);
   await blocked(two); await one.query('commit'); await edit;
   await one.query("update profiles set interested_in=array['woman'] where id=$1",[a]);
   assert.equal((await command(one,{actor:a,target:b,night,token:old})).accepted,false);
   assert.equal((await command(one,{actor:a,target:b,night,token:await token(one,a,venue,b)})).accepted,true);
 }
 // Every interrupting writer commits ahead of an already-issued gesture.
 for(const mutation of ['block','photo','leave','hidden','ejection','pause','lifecycle']) {
   const {a,b,venue,night}=await seedPair(observer); const old=await token(one,a,venue,b);
   const mutations={
     block:['insert into blocks values($1,$2)',[b,a]],
     photo:['update photo_state set correction_required=true where profile_id=$1',[b]],
     leave:['update presence set left_at=now() where profile_id=$1',[b]],
     hidden:['update presence set is_visible=false where profile_id=$1',[b]],
     ejection:['insert into venue_ejections(profile_id,venue_night_id) values($1,$2)',[b,night]],
     pause:["select private.transition_venue_night($1,'closed',null,null)",[night]],
     lifecycle:["select private.transition_venue_night($1,'ended',null,null)",[night]],
   };
   await two.query('begin'); await two.query(...mutations[mutation]);
   const pending=command(one,{actor:a,target:b,night,token:old}); await blocked(one); await two.query('commit');
   assert.equal((await pending).accepted,false,mutation); assert.equal((await counts(night)).likes,0);
 }
 // Actual photo RPC must wait BEFORE taking its existing photo-state row lock.
 {
   const {a,b,venue,night}=await seedPair(observer); const t=await token(one,a,venue,b);
   await observer.query('insert into admins values($1)',[a]);
   await two.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
   const state=(await observer.query('select displayed_id,revision from photo_state where profile_id=$1',[b])).rows[0];
   await one.query('begin'); await command(one,{actor:a,target:b,night,token:t});
   const review=two.query("select decide_profile_photo($1,$2,$3,'rejected','face_unclear')",[b,state.displayed_id,state.revision]);
   await blocked(two);
   // If review had locked photo_state before waiting on eligibility, this NOWAIT
   // would fail. That inversion previously caused like/moderation deadlocks.
   await one.query('select 1 from photo_state where profile_id=$1 for update nowait',[b]);
   await one.query('commit'); await review;
   assert.equal((await counts(night)).likes,0);
 }
 // Permanent venue deletion must wait before locking the venue row. The fixture's
 // real venue/night foreign keys then exercise the protected cascade itself.
 for (const deletionPath of ['rpc','direct']) {
   const {a,b,venue,night}=await seedPair(observer); const t=await token(one,a,venue,b);
   await observer.query('insert into admins values($1)',[a]);
   await one.query('begin');
   // Pause a like immediately after its first lock, before any foreign-key
   // checks can themselves lock the venue row.
   await one.query('select pg_advisory_xact_lock_shared(231,0)');
   await two.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
   if(deletionPath==='rpc') await two.query('set role authenticated');
   const deletion=two.query(deletionPath==='rpc' ? 'select delete_venue_configuration($1)' : 'delete from venues where id=$1',[venue]);
   await blocked(two);
   // Without the entry-point barrier, DELETE already owns this row while its
   // cascades wait for the like transaction, completing the deadlock cycle.
   await one.query('select 1 from venues where id=$1 for update nowait',[venue]);
   assert.equal((await command(one,{actor:a,target:b,night,token:t})).accepted,true);
   await one.query('commit'); await deletion; await two.query('reset role');
   const remaining=(await observer.query(`select
     (select count(*)::int from venues where id=$1) venues,
     (select count(*)::int from venue_nights where id=$2) nights,
     (select count(*)::int from presence where venue_night_id=$2) presences,
     (select count(*)::int from likes where venue_night_id=$2) likes,
     (select count(*)::int from private.like_pair_authorizations where venue_night_id=$2) authorizations,
     (select count(*)::int from private.like_request_receipts where venue_night_id=$2) receipts`,[venue,night])).rows[0];
   assert.deepEqual(remaining,{venues:0,nights:0,presences:0,likes:0,authorizations:0,receipts:0});
 }
 // Eligibility barrier excludes pure heartbeats and permits independent likes.
 {
   const f=await seedPair(observer),g=await seedPair(observer);
   const t=await token(one,f.a,f.venue,f.b),u=await token(two,g.a,g.venue,g.b);
   await one.query('begin'); await command(one,{actor:f.a,target:f.b,night:f.night,token:t});
   await two.query('update presence set last_seen_at=now() where profile_id=$1',[f.a]);
   assert.equal((await command(two,{actor:g.a,target:g.b,night:g.night,token:u})).accepted,true);
   await one.query('commit');
 }
 // Wall clock advances while a command is blocked, even within its transaction.
 {
   const {a,b,venue,night}=await seedPair(observer); const t=await token(one,a,venue,b);
   await observer.query("update venue_nights set closes_at=clock_timestamp()+interval '250 milliseconds' where id=$1",[night]);
   await two.query('begin'); await two.query('select pg_advisory_xact_lock(233,hashtext(least($1::uuid,$2::uuid)::text||greatest($1::uuid,$2::uuid)::text||$3::uuid::text))',[a,b,night]);
   const pending=command(one,{actor:a,target:b,night,token:t}); await blocked(one);
   await waitFor(async()=> (await observer.query('select clock_timestamp()>=closes_at expired from venue_nights where id=$1',[night])).rows[0].expired,'scheduled expiry');
   await two.query('commit'); assert.equal((await pending).accepted,false); assert.equal((await counts(night)).likes,0);
 }
 // Measure the small synthetic fixture workload; this is not a capacity claim.
 {
   const {a,b,venue,night}=await seedPair(observer); const t=await token(one,a,venue,b);
   for(let i=0;i<20;i++) {const start=performance.now(); await command(one,{actor:a,target:b,night,token:t}); timings.push(performance.now()-start);}
   await two.query('begin'); await two.query("update profiles set interested_in=array['woman','man'] where id=$1",[b]);
   const start=performance.now(); const pending=command(one,{actor:a,target:b,night,token:t}); await blocked(one);
   await two.query('commit'); await pending;
   console.log(`Synthetic local command latency: median ${timings.sort((a,b)=>a-b)[10].toFixed(2)} ms; controlled eligibility wait + command ${(performance.now()-start).toFixed(2)} ms.`);
 }
 console.log('PostgreSQL 17 concurrency: pair locks, receipts, two writers, safety, venue deletion cascade, heartbeat, expiry and single match/event passed.');
} finally {
 // Roll back holders first to release any pending waiter after a failed assertion.
 await Promise.allSettled(clients.map(client=>client.query('rollback')));
 await Promise.allSettled(clients.map(client=>client.end()));
}
