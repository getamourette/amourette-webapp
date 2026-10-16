import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { setImmediate } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { replaceRefund, installLaunchSchema,service,admin,fixture,attempt,create,get,cancel,pay,checkout,scalar,founder } from './launch-test-database.mjs';

export async function testLaunchConcurrency(observer,one,two,blocked,waitFor,{installed=false}={}) {
  if(!installed) await installLaunchSchema(observer,{existing:true});
  let cases=0;
  const outcome = promise => promise.then(value=>({value}),error=>({error}));
  const allocations=night=>scalar(observer,"select count(*)::int from private.launch_reservations where night_id=$1 and state in ('holding','confirmed')",[night]);
  async function race(first,second,verify) {
    await one.query('begin'); await first();
    const pending=outcome(second()); await blocked(two); await one.query('commit');
    await verify(await pending); cases++;
  }
  // Independent clients contend on the actual final place, not an in-memory simulation.
  for(const duplicate of ['different','same_email','same_request']) {
    const {night}=await fixture(observer),a=attempt(night),b=duplicate==='same_request'?a:attempt(night,duplicate==='same_email'?a.email:undefined);
    await race(()=>create(one,a),()=>create(two,b),async result=>{
      if(duplicate==='different') assert.match(result.error?.message??'',/event full/);
      else if(duplicate==='same_email') assert.deepEqual(result.value,{access_required:true});
      else assert.equal(result.value.id,a.id);
      assert.equal(await allocations(night),1);
    });
  }
  // Rebooking wins only after cancellation commits. The first deposit stays separate.
  for(const cancelFirst of [true,false]) {
    const {night}=await fixture(observer),a=attempt(night),b=attempt(night,a.email); await create(observer,a); await pay(observer,a);
    const first=()=>cancelFirst?cancel(one,a):create(one,b),second=()=>cancelFirst?create(two,b):cancel(two,a);
    await race(first,second,async r=>{assert.ok(!r.error);assert.equal(await allocations(night),cancelFirst?1:0);assert.equal((await get(observer,a)).refund_state,'queued');});
  }
  // Release and paid confirmation serialize. Release-first can never revive a place.
  for(const releaseFirst of [true,false]) {
    const {night}=await fixture(observer),a=attempt(night); await create(observer,a); await service(observer,'select bind_launch_checkout($1,$2)',[a.id,checkout(a)]);
    const release=db=>service(db,'select release_launch_hold($1,$2,$3)',[a.id,checkout(a),'evt_terminal']);
    await race(()=>releaseFirst?release(one):pay(one,a),()=>releaseFirst?pay(two,a):release(two),async r=>{
      assert.ok(!r.error);const state=await get(observer,a);
      assert.equal(state.state,releaseFirst?'expired':'confirmed');assert.equal(state.refund_state,releaseFirst?'queued':null);assert.equal(await allocations(night),releaseFirst?0:1);
    });
  }
  for(const cancelFirst of [true,false]) {
    const {night}=await fixture(observer),a=attempt(night); await create(observer,a); await service(observer,'select bind_launch_checkout($1,$2)',[a.id,checkout(a)]);
    await race(()=>cancelFirst?admin(one,"select admin_cancel_launch_event($1,'postponed')",[night]):pay(one,a),()=>cancelFirst?pay(two,a):admin(two,"select admin_cancel_launch_event($1,'postponed')",[night]),async r=>{
      assert.ok(!r.error);assert.equal((await get(observer,a)).state,'cancelled');assert.equal((await get(observer,a)).refund_state,'queued');assert.equal(await allocations(night),0);
    });
  }
  // Checkout creation can return after cancellation: preserve its identity for
  // reconciliation, without allowing it to create a new allocation.
  for(const cancelFirst of [true,false]) {
    const {night}=await fixture(observer),a=attempt(night);await create(observer,a);
    const bind=db=>service(db,'select bind_launch_checkout($1,$2)',[a.id,checkout(a)]);
    await race(()=>cancelFirst?cancel(one,a):bind(one),()=>cancelFirst?bind(two):cancel(two,a),async r=>{
      assert.ok(!r.error);const result=await pay(observer,a);assert.equal(result.state,'cancelled');assert.equal(result.refund_state,'queued');assert.equal(await allocations(night),0);
    });
  }
  // Capacity decreases and place acquisition use the same lock.
  for(const reduceFirst of [true,false]) {
    const {night}=await fixture(observer,{capacity:2}),a=attempt(night),b=attempt(night);await create(observer,a);
    const opens=await scalar(observer,'select registration_opens_at::text from private.launch_events where night_id=$1',[night]);
    const reduce=db=>admin(db,"select admin_configure_launch_event($1,$2,1,1000,'eur','launch-v1')",[night,opens]);
    await race(()=>reduceFirst?reduce(one):create(one,b),()=>reduceFirst?create(two,b):reduce(two),async r=>{
      assert.match(r.error?.message??'',reduceFirst?/event full/:/quota below/);assert.equal(await allocations(night),reduceFirst?1:2);
    });
  }
  // Serializing on the night must recheck wall-clock registration eligibility.
  {
    const {night}=await fixture(observer,{start:'30 minutes 2 seconds',end:'2 hours'}),a=attempt(night);
    a.until=new Date(Date.now()+500).toISOString();
    await one.query('begin');await one.query('select 1 from venue_nights where id=$1 for update',[night]);
    const pending=outcome(create(two,a));await blocked(two);
    await waitFor(async()=>scalar(observer,"select clock_timestamp()>=waiting_opens_at-interval '30 minutes' from venue_nights where id=$1",[night]),'registration start');
    await one.query('commit');assert.match((await pending).error?.message??'',/registration closed/);assert.equal(await allocations(night),0);cases++;
  }
  // A deadline passing does not itself free the hold or admit another purchaser.
  {
    const {night}=await fixture(observer),a=attempt(night);a.until=new Date(Date.now()+500).toISOString();await create(observer,a);
    await waitFor(async()=>scalar(observer,'select clock_timestamp()>=hold_until from private.launch_reservations where id=$1',[a.id]),'hold deadline');
    await assert.rejects(create(two,attempt(night)),/event full/);assert.equal((await pay(one,a)).state,'confirmed');cases++;
  }
  // Arrival versus cancellation: first committed action determines the valid outcome.
  for(const arrivalFirst of [true,false]) {
    const {night}=await fixture(observer),a=attempt(night);await create(observer,a);await pay(observer,a);
    // Fixture-only time travel after a legal booking; production schedules stay frozen.
    await observer.query('alter table venue_nights disable trigger launch_night_guard');
    await observer.query("update venue_nights set waiting_opens_at=clock_timestamp()+interval '2 seconds' where id=$1",[night]);
    await observer.query('alter table venue_nights enable trigger launch_night_guard');
    await waitFor(async()=>scalar(observer,'select clock_timestamp()>=waiting_opens_at from venue_nights where id=$1',[night]),'arrival start');
    const arrive=db=>admin(db,"select admin_verify_launch_arrival($1,$2,'qr',$3)",[a.id,a.night,a.arrival]);
    await race(()=>arrivalFirst?arrive(one):cancel(one,a),()=>arrivalFirst?cancel(two,a):arrive(two),async r=>{
      assert.match(r.error?.message??'',arrivalFirst?/no longer/:/unavailable/);const state=await get(observer,a);
      assert.equal(state.arrival,arrivalFirst?'verified':null);assert.equal(state.refund_state,arrivalFirst?'queued':null);
    });
  }
  // Two staff confirmations preserve the original attendance and refund intent.
  {
    const {night}=await fixture(observer),a=attempt(night);await create(observer,a);await pay(observer,a);
    await observer.query('alter table venue_nights disable trigger launch_night_guard');
    await observer.query("update venue_nights set waiting_opens_at=clock_timestamp()-interval '1 hour' where id=$1",[night]);
    await observer.query('alter table venue_nights enable trigger launch_night_guard');
    const arrive=db=>admin(db,"select admin_verify_launch_arrival($1,$2,'qr',$3) result",[a.id,night,a.arrival]);
    let first;
    await race(async()=>{first=(await arrive(one))[0].result;},()=>arrive(two),async result=>{
      assert.ok(!result.error);assert.deepEqual(result.value[0].result,first);
      assert.equal(await scalar(observer,'select count(*)::int from private.launch_arrivals where reservation_id=$1',[a.id]),1);
      assert.equal(await scalar(observer,'select count(*)::int from private.launch_refunds where reservation_id=$1',[a.id]),1);
      assert.equal(await scalar(observer,"select count(*)::int from private.launch_audit where reservation_id=$1 and action='arrival_verified'",[a.id]),1);
    });
  }
  // #191 corrections fence stale edits and scans; worker claims remain intact.
  for(const competing of ['correction','stale_scan','finalize']) {
    const {night}=await fixture(observer),a=attempt(night);await create(observer,a);await pay(observer,a);
    await observer.query('alter table venue_nights disable trigger launch_night_guard');
    await observer.query("update venue_nights set waiting_opens_at=clock_timestamp()-interval '2 hours',guaranteed_launch_at=clock_timestamp()-interval '1 hour' where id=$1",[night]);
    await observer.query('alter table venue_nights enable trigger launch_night_guard');
    await admin(observer,"select admin_confirm_launch_arrival($1,$2,0,'qr',$3)",[a.id,night,a.arrival]);
    if(competing==='finalize') {
      await observer.query('alter table venue_nights disable trigger launch_night_guard');
      await observer.query("update venue_nights set closes_at=clock_timestamp()-interval '1 minute' where id=$1",[night]);
      await observer.query('alter table venue_nights enable trigger launch_night_guard');
    }
    const refund=await scalar(observer,'select to_jsonb(f) from private.launch_refunds f where reservation_id=$1',[a.id]);
    const undo=db=>admin(db,"select admin_correct_launch_arrival($1,$2,1,false,'Wrong guest selected')",[a.id,night]);
    await race(()=>undo(one),()=>competing==='correction'?undo(two):competing==='stale_scan'
      ?admin(two,"select admin_confirm_launch_arrival($1,$2,0,'qr',$3)",[a.id,night,a.arrival])
      :service(two,'select finalize_launch_no_shows($1)',[night]),async result=>{
      if(competing==='finalize') assert.ok(!result.error); else assert.match(result.error?.message??'',/arrival changed/);
      assert.equal((await get(observer,a)).arrival,competing==='finalize'?'no_show':null);
      assert.deepEqual(await scalar(observer,'select to_jsonb(f) from private.launch_refunds f where reservation_id=$1',[a.id]),refund);
      assert.equal(await scalar(observer,"select count(*)::int from private.launch_audit where reservation_id=$1 and action='arrival_corrected'",[a.id]),1);
    });
  }
  // Lookup waits for cancellation, then refuses the formerly valid code.
  {
    const {night}=await fixture(observer),a=attempt(night);await create(observer,a);await pay(observer,a);
    await admin(observer,'select admin_lookup_launch_arrival($1,$2)',[night,a.arrival]);
    await race(()=>cancel(one,a),()=>admin(two,'select admin_lookup_launch_arrival($1,$2)',[night,a.arrival]),async result=>{
      assert.match(result.error?.message??'',/unavailable/);
      assert.equal(await scalar(observer,'select count(*)::int from private.launch_arrivals where reservation_id=$1',[a.id]),0);
    });
  }
  // Capture expiry after acquiring the lock: neither a scan started earlier nor
  // a repeated confirmation bypasses the exclusive scheduled end boundary.
  for(const duplicate of [false,true]) {
    const {night}=await fixture(observer),a=attempt(night);await create(observer,a);await pay(observer,a);
    await observer.query('alter table venue_nights disable trigger launch_night_guard');
    await observer.query("update venue_nights set waiting_opens_at=clock_timestamp()-interval '2 hours',guaranteed_launch_at=clock_timestamp()-interval '1 hour',closes_at=clock_timestamp()+interval '2 seconds' where id=$1",[night]);
    await observer.query('alter table venue_nights enable trigger launch_night_guard');
    const arrive=db=>admin(db,"select admin_verify_launch_arrival($1,$2,'qr',$3)",[a.id,night,a.arrival]);
    if(duplicate)await arrive(observer);
    await one.query('begin');await one.query('select 1 from venue_nights where id=$1 for update',[night]);
    const pending=outcome(arrive(two));await blocked(two);
    await waitFor(async()=>scalar(observer,'select clock_timestamp()>=closes_at from venue_nights where id=$1',[night]),'arrival expiry');
    await one.query('commit');assert.match((await pending).error?.message??'',/unavailable/);
    assert.equal(await scalar(observer,'select count(*)::int from private.launch_arrivals where reservation_id=$1',[a.id]),Number(duplicate));cases++;
  }
  // SKIP LOCKED prevents two workers from claiming the same pending request.
  {
    await one.query('begin');const a=(await service(one,'select claim_launch_refund(60) result'))[0].result;assert.ok(a);
    const b=(await service(two,'select claim_launch_refund(60) result'))[0].result;
    assert.ok(!b||b.id!==a.id);await one.query('commit');cases++;
  }
  // Two approvals of the same terminal failure must create one replacement.
  // An uncertain retry competing with replacement either wins reconciliation or
  // observes the newly queued operation; it never creates a second operation.
  for(const competing of ['replace','retry_before','retry_after']) {
    const f=(await service(observer,'select claim_launch_refund(60) result'))[0].result;assert.ok(f);
    const previousFailures=await scalar(observer,'select count(*)::int from private.launch_refund_attempts where refund_id=$1 and failure_snapshot is not null',[f.id]);
    const provider=`re_${f.operation_id.replaceAll('-','')}`;
    await service(observer,"select complete_launch_refund($1,$2,'failed',$3,'terminal_failure')",[f.id,f.claim_id,provider]);
    const replace=db=>replaceRefund(db,[f.id,f.operation_id,provider,'evt_verified','Terminal failure verified; funds returned']);
    const retry=db=>admin(db,"select admin_retry_launch_refund($1,'Reconcile existing operation')",[f.id]);
    await race(()=>competing==='retry_before'?retry(one):replace(one),()=>competing==='replace'||competing==='retry_before'?replace(two):retry(two),async result=>{
      if(competing==='retry_before') assert.match(result.error?.message??'',/terminal failure/);
      else assert.ok(!result.error);
      const current=await scalar(observer,'select operation_id from private.launch_refunds where id=$1',[f.id]);
      assert.equal(current===f.operation_id,competing==='retry_before');
      assert.equal(await scalar(observer,'select count(*)::int from private.launch_refund_attempts where refund_id=$1 and failure_snapshot is not null',[f.id]),previousFailures+(competing==='retry_before'?0:1));
    });
  }
  // Recovery and a financial exception serialize on the same reservation. Two
  // founders can associate the same full provider refund only once.
  for(const competing of ['adopt','exception']) {
    const {night}=await fixture(observer),a=attempt(night);await create(observer,a);await pay(observer,a);
    const provider=`re_${a.id.replaceAll('-','')}`;
    const adopt=db=>service(db,"select adopt_launch_refund($1,null,$2,'pending',$3,'Full Dashboard refund verified')",[a.id,provider,founder]);
    const exception=db=>admin(db,"select admin_refund_launch_reservation($1,'Support exception')",[a.id]);
    await race(()=>adopt(one),()=>competing==='adopt'?adopt(two):exception(two),async result=>{
      assert.ok(!result.error);
      assert.equal(await scalar(observer,'select count(*)::int from private.launch_refunds where reservation_id=$1',[a.id]),1);
      assert.equal(await scalar(observer,'select provider_refund_id from private.launch_refunds where reservation_id=$1',[a.id]),provider);
      assert.equal(await scalar(observer,"select count(*)::int from private.launch_audit where reservation_id=$1 and action='external_refund_linked'",[a.id]),1);
    });
  }
  // The provider worker lease prevents concurrent creation for one reservation.
  {
    const {night}=await fixture(observer),a=attempt(night);
    const prepare=db=>service(db,'select prepare_launch_checkout($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) result',
      [a.id,a.night,a.email,a.name,a.locale,a.policy,a.late,a.management,a.arrival,'v1.'+'x'.repeat(100),'acct_concurrency','https://test.example.com']);
    await race(()=>prepare(one),()=>prepare(two),async result=>{
      assert.ok(!result.error);assert.equal(await allocations(night),1);
      assert.equal(await scalar(observer,'select count(*)::int from private.launch_checkout_work where reservation_id=$1',[a.id]),1);
    });
    await one.query('begin');
    const first=(await service(one,'select claim_launch_checkout($1) result',[a.id]))[0].result;
    const other=(await service(two,'select claim_launch_checkout($1) result',[a.id]))[0].result;
    assert.ok(first.claim_id);assert.equal(other,null);await one.query('commit');cases++;
    await observer.query("update private.launch_checkout_work set lease_until=clock_timestamp()-interval '1 second' where reservation_id=$1",[a.id]);
    const second=(await service(two,'select claim_launch_checkout($1) result',[a.id]))[0].result;
    await assert.rejects(service(one,'select start_launch_checkout_request($1,$2)',[a.id,first.claim_id]),/stale checkout/);
    await assert.rejects(service(one,"select finish_launch_checkout($1,$2,'done')",[a.id,first.claim_id]),/stale checkout/);
    assert.notEqual(second.claim_id,first.claim_id);assert.equal(second.claims,2);cases++;
  }
  console.log(`${cases} launch PostgreSQL concurrency cases passed (real locks and separate sessions).`);
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const url=new URL(process.env.LAUNCH_TEST_DATABASE_URL??'postgres://postgres:test@127.0.0.1:55438/launch_182');
  assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Disposable loopback PostgreSQL only');
  // Standalone creates its own uniquely named database, never modifies another task's data.
  const adminUrl=new URL(url);adminUrl.pathname='/postgres';
  const bootstrap=new pg.Client({connectionString:adminUrl.href});
  const database=`launch_182_${Date.now()}`;
  await bootstrap.connect();await bootstrap.query(`create database ${database} template template0 encoding 'UTF8'`);await bootstrap.end();url.pathname=`/${database}`;
  const clients=Array.from({length:3},()=>new pg.Client({connectionString:url.href}));const [observer,one,two]=clients;
  try {
    await Promise.all(clients.map(c=>c.connect()));
    assert.equal(Math.floor(Number(await scalar(observer,'show server_version_num'))/10000),17);
    for(const c of clients) await c.query("set statement_timeout='10s'");
    await installLaunchSchema(observer);
    async function waitFor(predicate,label) {const until=performance.now()+8000;while(!await predicate()){if(performance.now()>until)throw new Error(`Barrier timed out: ${label}`);await setImmediate();}}
    const blocked=c=>waitFor(async()=>scalar(observer,'select cardinality(pg_blocking_pids($1))>0',[c.processID]),'waiting on booking lock');
    await testLaunchConcurrency(observer,one,two,blocked,waitFor,{installed:true});
  } finally {
    await Promise.allSettled(clients.map(c=>c.query('rollback')));await Promise.allSettled(clients.map(c=>c.end()));
  }
}
