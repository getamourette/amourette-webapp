import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { installLaunchSchema,asRole,service,admin,fixture,attempt,create,get,cancel,pay,checkout,payment,scalar,stranger } from './launch-test-database.mjs';
const pg = new PGlite();
const db = {query:(sql,args)=>args ? pg.query(sql,args) : pg.exec(sql).then(r=>r.at(-1))};
let checks=0;
async function check(name,fn) { await fn(); checks++; console.log(`PASS ${name}`); }
try {
  await installLaunchSchema(db);
  await check('guest/founder grants: no direct reads/writes or private helper execution',async()=>{
    const tables=(await db.query("select tablename from pg_tables where schemaname='private' and tablename like 'launch_%'")).rows;
    for(const role of ['anon','authenticated','service_role']) for(const {tablename} of tables) {
      await assert.rejects(asRole(db,role,`select * from private.${tablename}`),/permission denied/);
      assert.equal(await scalar(db,'select has_table_privilege($1,$2,\'INSERT,UPDATE,DELETE,TRUNCATE\')',[role,`private.${tablename}`]),false);
    }
    const funcs=(await db.query("select p.oid::regprocedure::text signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'launch_%'")).rows;
    for(const role of ['anon','authenticated','service_role']) for(const {signature} of funcs) assert.equal(await scalar(db,"select has_function_privilege($1,$2,'EXECUTE')",[role,signature]),false);
    for(const user of [null,stranger]) await assert.rejects(asRole(db,'authenticated','select admin_launch_list($1,\'audit\',0)',[randomUUID()],user),/not authorized/);
    await assert.rejects(asRole(db,'anon','select launch_event_availability($1)',[randomUUID()]),/permission denied/);
    await assert.rejects(asRole(db,'authenticated','select get_launch_reservation($1,$2)',[randomUUID(),'0'.repeat(64)],stranger),/permission denied/);
  });
  await check('normalized active email, safe duplicate response, immutable replay and capacity',async()=>{
    const {night}=await fixture(db),a=attempt(night,' Alice@Example.com ');
    assert.equal((await create(db,a)).email,'alice@example.com');
    assert.deepEqual(await create(db,a),await get(db,a));
    await assert.rejects(create(db,{...a,name:'Bob'}),/identifier reused/);
    await assert.rejects(create(db,{...a,management:'1'.repeat(64)}),/access denied/);
    assert.deepEqual(await create(db,attempt(night,'alice@example.com')),{access_required:true});
    await assert.rejects(create(db,attempt(night)),/event full/);
    await pay(db,a); assert.deepEqual(await create(db,attempt(night,'ALICE@example.com')),{access_required:true});
    const before=await scalar(db,'select count(*) from private.launch_audit where reservation_id=$1',[a.id]);
    await pay(db,a); assert.equal(await scalar(db,'select count(*) from private.launch_audit where reservation_id=$1',[a.id]),before);
    await assert.rejects(service(db,'select record_launch_payment($1,$2,$3,999,\'eur\')',[a.id,checkout(a),payment(a)]),/mismatch/);
    await assert.rejects(service(db,'select record_launch_payment($1,$2,$3,1000,\'usd\')',[a.id,checkout(a),payment(a)]),/mismatch/);
    await assert.rejects(db.query('update private.launch_events set capacity=0 where night_id=$1',[night]));
    await admin(db,"select admin_configure_launch_event($1,(select registration_opens_at from private.launch_events where night_id=$1),2,1000,'eur','launch-v1')",[night]).catch(async e=>{
      // Founder cannot SELECT the settings table even inside a command argument.
      assert.match(e.message,/permission denied/);
      const opens=await scalar(db,'select registration_opens_at::text from private.launch_events where night_id=$1',[night]);
      await admin(db,"select admin_configure_launch_event($1,$2,2,1000,'eur','launch-v1')",[night,opens]);
    });
    await create(db,attempt(night));
    await assert.rejects(db.query('update private.launch_events set capacity=1 where night_id=$1',[night]),/quota below/);
    assert.equal(await scalar(db,'select count(*)::int from presence where venue_night_id=$1',[night]),0);
  });
  await check('cancellation/rebooking preserves full payment/refund history and invalidates QR',async()=>{
    const {night}=await fixture(db),a=attempt(night); await create(db,a); await pay(db,a);
    const result=await cancel(db,a); assert.equal(result.cancellation_refundable,true); assert.equal(result.refund_state,'queued');
    assert.deepEqual(await cancel(db,a),result);
    await assert.rejects(admin(db,'select admin_lookup_launch_arrival($1)',[a.arrival]),/unavailable/);
    const b=attempt(night,a.email); await create(db,b); await pay(db,b);
    assert.equal((await get(db,a)).state,'cancelled'); assert.equal((await get(db,b)).state,'confirmed');
    assert.equal(await scalar(db,'select count(*)::int from private.launch_payments p join private.launch_reservations r on r.id=p.reservation_id where r.night_id=$1',[night]),2);
    assert.equal(await scalar(db,'select count(*)::int from private.launch_refunds where reservation_id=$1',[a.id]),1);
    await assert.rejects(db.query('update private.launch_payments set amount_minor=900 where reservation_id=$1',[a.id]),/immutable/);
    await assert.rejects(db.query('update private.launch_refunds set amount_minor=900 where reservation_id=$1',[a.id]),/equal paid/);

  });
  await check('late cancellation retains deposit; rebooking and later allocation do not change it',async()=>{
    const {night}=await fixture(db,{start:'1 day',end:'1 day 4 hours'}),a=attempt(night);
    await assert.rejects(create(db,{...a,late:false}),/acknowledgement/);
    await create(db,a); await pay(db,a); assert.equal((await cancel(db,a)).cancellation_refundable,false);
    await create(db,attempt(night,a.email)); assert.equal((await get(db,a)).refund_state,null);
  });
  await check('hold deadline is advisory; verified release and late payment never oversell',async()=>{
    const {night}=await fixture(db),a=attempt(night); await create(db,a);
    await service(db,'select bind_launch_checkout($1,$2)',[a.id,checkout(a)]);
    await assert.rejects(service(db,'select release_launch_hold($1,$2,$3)',[a.id,'wrong','evt_1']),/evidence/);
    await service(db,'select release_launch_hold($1,$2,$3)',[a.id,checkout(a),'evt_1']);
    await service(db,'select release_launch_hold($1,$2,$3)',[a.id,checkout(a),'evt_1']);
    const b=attempt(night,a.email); await create(db,b); await pay(db,b);
    assert.equal((await pay(db,a)).state,'expired'); assert.equal((await get(db,a)).refund_state,'queued');
    assert.equal(await scalar(db,"select count(*)::int from private.launch_reservations where night_id=$1 and state in ('holding','confirmed')",[night]),1);
  });
  await check('Checkout creation racing cancellation still reconciles without reviving capacity',async()=>{
    const {night}=await fixture(db),a=attempt(night); await create(db,a); await cancel(db,a);
    const result=await pay(db,a); assert.equal(result.state,'cancelled'); assert.equal(result.payment_state,'paid'); assert.equal(result.refund_state,'queued');
    await create(db,attempt(night,a.email));
  });
  await check('management and arrival credentials are separate; recovery and verified correction',async()=>{
    const {night}=await fixture(db),a=attempt(night); await create(db,a); await pay(db,a);
    await assert.rejects(get(db,{...a,management:a.arrival}),/denied/);
    for(const token of [null,'','0'.repeat(63),' '+a.management,a.management.toUpperCase()]) await assert.rejects(get(db,{...a,management:token}));
    const secret=randomBytes(32).toString('hex');
    assert.equal((await service(db,'select renew_launch_access($1,$2) result',[a.id,secret]))[0].result.recipient_email,a.email);
    await assert.rejects(get(db,a),/denied/); a.management=secret; await get(db,a);
    assert.equal((await admin(db,'select admin_lookup_launch_arrival($1) result',[a.arrival]))[0].result.id,a.id);
    await assert.rejects(asRole(db,'authenticated','select admin_correct_launch_email($1,$2,$3)',[a.id,'new@example.com','verified payment'],stranger),/not authorized/);
    await assert.rejects(admin(db,'select admin_correct_launch_email($1,$2,$3)',[a.id,'new@example.com',' ']),/verification|correction/);
    await admin(db,'select admin_correct_launch_email($1,$2,$3)',[a.id,' NEW@example.com ','Payment and reservation checked by support']);
    await assert.rejects(get(db,a),/denied/);
    assert.equal((await admin(db,'select admin_lookup_launch_arrival($1) result',[a.arrival]))[0].result.email,'new@example.com');
  });
  await check('free ordered waitlist is idempotent, founder only and never allocates',async()=>{
    const {night}=await fixture(db); await assert.rejects(service(db,"select join_launch_waitlist($1,'w@example.com','en')",[night]),/unavailable/);
    await create(db,attempt(night));
    for(const email of ['first@example.com','second@example.com','FIRST@example.com']) await service(db,"select join_launch_waitlist($1,$2,'en')",[night,email]);
    const list=(await admin(db,"select admin_launch_list($1,'waitlist') result",[night]))[0].result;
    assert.deepEqual(list.map(r=>r.email),['first@example.com','second@example.com']);
    await admin(db,"select admin_update_launch_waitlist($1,'contacted')",[list[0].id]);
    await admin(db,"select admin_update_launch_waitlist($1,'contacted')",[list[0].id]);
    assert.equal(await scalar(db,'select count(*)::int from private.launch_reservations where night_id=$1',[night]),1);
  });
  await check('null/invalid inputs refuse without any new attempt or audit',async()=>{
    const {night}=await fixture(db,{capacity:20}),a=attempt(night);
    const before=await scalar(db,'select count(*) from private.launch_audit');
    const invalid={email:[null,'bad','x@localhost','a..b@example.com','é@example.com','a'.repeat(65)+'@example.com'],name:[null,'',' '.repeat(16385),'😀'.repeat(31)],locale:[null,'EN','de'],policy:[null,'wrong'],late:[null],until:[null,'infinity','2000-01-01'],management:[null,'','X'.repeat(64)],id:[null]};
    for(const [key,values] of Object.entries(invalid)) for(const value of values) await assert.rejects(create(db,{...a,[key]:value}),`${key}:${value}`);
    await assert.rejects(create(db,{...a,arrival:a.management}),/differ/);
    assert.equal(await scalar(db,'select count(*) from private.launch_audit'),before);
    assert.equal(await scalar(db,'select count(*)::int from private.launch_reservations where night_id=$1',[night]),0);
    await create(db,{...a,name:'\u00a0'+'😀'.repeat(30)+'\n'});
  });
  await check('inclusive 48 elapsed hours across DST and immutable opening terms',async()=>{
    for(const start of ['2026-03-30T18:00:00+02:00','2026-10-26T18:00:00+01:00']) {
      const result=(await db.query(`select
        private.launch_cancellation_refundable($1::timestamptz,$1::timestamptz-interval '48 hours') exact,
        private.launch_cancellation_refundable($1::timestamptz,$1::timestamptz-interval '48 hours 0.000001 seconds') before,
        private.launch_cancellation_refundable($1::timestamptz,$1::timestamptz-interval '47 hours 59 minutes 59.999999 seconds') after`,[start])).rows[0];
      assert.deepEqual(result,{exact:true,before:true,after:false});
    }
    const {night}=await fixture(db);
    for(const edit of ["deposit_minor=1500","currency='usd'","registration_opens_at=clock_timestamp()+interval '1 day'","policy_version='v2'"]) await assert.rejects(db.query(`update private.launch_events set ${edit} where night_id=$1`,[night]),/frozen/);
    await assert.rejects(db.query("update venue_nights set waiting_opens_at=waiting_opens_at+interval '1 hour' where id=$1",[night]),/frozen/);
    await assert.rejects(db.query('delete from venue_nights where id=$1',[night]),/foreign key/);
    const future=await fixture(db,{opens:'1 day'});
    await admin(db,"select admin_configure_launch_event($1,$2,7,1700,'usd','v2')",[future.night,new Date(Date.now()+86400000).toISOString()]);
    assert.equal((await service(db,'select launch_event_availability($1) result',[future.night]))[0].result.amount_minor,1700);
    await assert.rejects(create(db,attempt(future.night)),/closed/);
    await admin(db,"select admin_configure_launch_event($1,$2,7,1700,'usd','v2')",[future.night,new Date(Date.now()-1000).toISOString()]);
    const usd={...attempt(future.night),policy:'v2'}; await create(db,usd);
    await service(db,'select bind_launch_checkout($1,$2)',[usd.id,checkout(usd)]);
    await service(db,"select record_launch_payment($1,$2,$3,1700,'usd')",[usd.id,checkout(usd),payment(usd)]);
    await cancel(db,usd);
    assert.deepEqual((await db.query('select amount_minor,currency from private.launch_refunds where reservation_id=$1',[usd.id])).rows,[{amount_minor:1700,currency:'usd'}]);

  });
  // Fixture-only time travel: production commands cannot bypass schedule freezing.
  async function moveNight(night,start,end) {
    await db.query('alter table venue_nights disable trigger launch_night_guard');
    await db.query('alter table private.launch_events disable trigger launch_event_guard');
    await db.query("update private.launch_events set registration_opens_at=clock_timestamp()+$2::interval-interval '1 day' where night_id=$1",[night,start]);
    await db.query('alter table private.launch_events enable trigger launch_event_guard');
    try { await db.query(`update venue_nights set waiting_opens_at=clock_timestamp()+$2::interval,
      guaranteed_launch_at=clock_timestamp()+$2::interval+interval '1 minute',closes_at=clock_timestamp()+$3::interval where id=$1`,[night,start,end]); }
    finally { await db.query('alter table venue_nights enable trigger launch_night_guard'); }
  }
  await check('arrival throughout event, duplicate validation, no public presence, no early no-show',async()=>{
    const {night}=await fixture(db,{capacity:2}),a=attempt(night),b=attempt(night);
    await create(db,a); await pay(db,a); await create(db,b); await pay(db,b);
    await assert.rejects(admin(db,"select admin_verify_launch_arrival($1,'qr')",[a.id]),/outside/);
    await assert.rejects(service(db,'select finalize_launch_no_shows($1)',[night]),/not ended/);
    await moveNight(night,'-3 hours','1 minute');
    await assert.rejects(create(db,attempt(night)),/closed/);
    await assert.rejects(admin(db,"select admin_verify_launch_arrival($1,'manual','')",[a.id]),/invalid/);
    await assert.rejects(asRole(db,'authenticated',"select admin_verify_launch_arrival($1,'qr')",[a.id],stranger),/not authorized/);
    const first=(await admin(db,"select admin_verify_launch_arrival($1,'manual','Verified outside; bar full') result",[a.id]))[0].result;
    assert.equal(first.arrival,'verified'); assert.equal(first.refund_state,'queued');
    const audit=await scalar(db,'select count(*) from private.launch_audit where reservation_id=$1',[a.id]);
    await admin(db,"select admin_verify_launch_arrival($1,'qr')",[a.id]);
    assert.equal(await scalar(db,'select count(*) from private.launch_audit where reservation_id=$1',[a.id]),audit);
    assert.equal(await scalar(db,'select count(*)::int from presence where venue_night_id=$1',[night]),0);
    await assert.rejects(cancel(db,a),/no longer/);
    await moveNight(night,'-4 hours','-1 second');
    await assert.rejects(admin(db,"select admin_verify_launch_arrival($1,'qr')",[b.id]),/outside/);
    assert.equal((await service(db,'select finalize_launch_no_shows($1) n',[night]))[0].n,1);
    assert.equal((await service(db,'select finalize_launch_no_shows($1) n',[night]))[0].n,0);
    assert.equal((await get(db,b)).arrival,'no_show'); assert.equal((await get(db,b)).refund_state,null);
    await db.query("select private.transition_venue_night($1,'ended',null,null)",[night]);
    assert.equal((await get(db,a)).arrival,'verified');
    await admin(db,"select admin_refund_launch_reservation($1,'Verified exceptional circumstances')",[b.id]);
    assert.equal((await get(db,b)).refund_state,'queued');
  });
  await check('organizer cancellation/postponement and existing lifecycle cancellation queue once',async()=>{
    for(const action of ['cancelled','postponed','lifecycle']) {
      const {night}=await fixture(db,{capacity:2}),a=attempt(night),b=attempt(night);
      await create(db,a); await pay(db,a); await create(db,b);
      await service(db,'select bind_launch_checkout($1,$2)',[b.id,checkout(b)]);
      if(action==='lifecycle') await db.query("select private.transition_venue_night($1,'cancelled',null,null)",[night]);
      else await admin(db,'select admin_cancel_launch_event($1,$2)',[night,action]);
      const state=await get(db,a); assert.equal(state.state,'cancelled'); assert.equal(state.refund_state,'queued');
      await admin(db,"select admin_cancel_launch_event($1,'cancelled')",[night]);
      await pay(db,b); assert.equal((await get(db,b)).state,'cancelled'); assert.equal((await get(db,b)).refund_state,'queued');
      assert.equal(await scalar(db,'select count(*)::int from private.launch_refunds where reservation_id=$1',[a.id]),1);
      await assert.rejects(create(db,attempt(night)),/closed/);
    }
  });
  await check('refund leases, duplicate outcomes, reconciliation, stale workers and stable idempotency key',async()=>{
    const claim=async()=> (await service(db,'select claim_launch_refund(60) result'))[0].result;
    const f=await claim(); assert.ok(f); assert.equal(f.amount_minor,1000); assert.equal(f.reconcile_first,false);
    await assert.rejects(service(db,'select complete_launch_refund($1,$2,\'succeeded\',\'re_x\')',[f.id,randomUUID()]),/stale/);
    const complete=(state,provider=null,error=null,c=f)=>service(db,'select complete_launch_refund($1,$2,$3,$4,$5)',[c.id,c.claim_id,state,provider,error]);
    await complete('review_needed',null,'network_unknown');
    const audit=await scalar(db,'select count(*) from private.launch_audit where reservation_id=$1',[f.reservation_id]);
    await complete('review_needed',null,'network_unknown');
    assert.equal(await scalar(db,'select count(*) from private.launch_audit where reservation_id=$1',[f.reservation_id]),audit);
    await assert.rejects(complete('pending'),/reconciliation/);
    await assert.rejects(admin(db,"select admin_retry_launch_refund($1,'')",[f.id]),/note/);
    await admin(db,"select admin_retry_launch_refund($1,'Provider searched; retry same refund identity')",[f.id]);
    const retry=await claim(); assert.equal(retry.id,f.id); assert.equal(retry.reconcile_first,true); assert.notEqual(retry.claim_id,f.claim_id);
    await assert.rejects(complete('succeeded','re_x'),/stale/);
    await complete('pending','re_x',null,retry); await complete('succeeded','re_x',null,retry);
    await complete('succeeded','re_x',null,retry);
    await assert.rejects(complete('succeeded','re_other',null,retry),/mismatch/);
    assert.equal(await scalar(db,'select state from private.launch_refunds where id=$1',[f.id]),'succeeded');
    const next=await claim(); assert.notEqual(next.id,f.id);
    await db.query("update private.launch_refunds set lease_until=clock_timestamp()-interval '1 second' where id=$1",[next.id]);
    const recovered=await claim(); assert.equal(recovered.id,next.id); assert.equal(recovered.reconcile_first,true);
    await assert.rejects(complete('failed',null,'timeout',next),/stale/);
    await complete('failed',null,'provider_failed',recovered);
  });
  await check('verified terminal refund failure permits one replacement and preserves prior attempts',async()=>{
    const claim=async()=> (await service(db,'select claim_launch_refund(60) result'))[0].result;
    const f=await claim(); assert.ok(f?.operation_id);
    const finish=(c,state,provider,error=null)=>service(db,'select complete_launch_refund($1,$2,$3,$4,$5)',[c.id,c.claim_id,state,provider,error]);
    const replace=(c,provider='re_terminal',evidence='evt_terminal',note='Provider confirms failed refund; funds returned; replacement permitted')=>
      admin(db,'select admin_replace_failed_launch_refund($1,$2,$3,$4,$5)',[c.id,c.operation_id,provider,evidence,note]);
    await finish(f,'review_needed','re_terminal','network_unknown');
    await assert.rejects(replace(f),/terminal failure/);
    await admin(db,"select admin_retry_launch_refund($1,'Reconcile uncertain result without another provider operation')",[f.id]);
    const reconciled=await claim(); assert.equal(reconciled.id,f.id); assert.equal(reconciled.operation_id,f.operation_id);
    assert.equal(reconciled.provider_refund_id,'re_terminal'); assert.equal(reconciled.reconcile_first,true);
    await assert.rejects(finish(reconciled,'succeeded','re_replacement'),/mismatch/);
    await finish(reconciled,'failed','re_terminal','provider_failed');
    const oldSnapshot=await scalar(db,'select to_jsonb(f) from private.launch_refunds f where id=$1',[f.id]);
    for(const args of [[f.id,null,'re_terminal','evt_terminal','verified'],[f.id,f.operation_id,'re_terminal',null,'verified'],[f.id,f.operation_id,'re_terminal','evt_terminal',' ']]) {
      await assert.rejects(admin(db,'select admin_replace_failed_launch_refund($1,$2,$3,$4,$5)',args),/verification/);
    }
    await assert.rejects(asRole(db,'authenticated','select admin_replace_failed_launch_refund($1,$2,$3,$4,$5)',
      [f.id,f.operation_id,'re_terminal','evt_terminal','verified'],stranger),/not authorized/);
    await assert.rejects(replace(f,'re_wrong'),/terminal failure/);
    await assert.rejects(db.query("update private.launch_refunds set operation_id=gen_random_uuid(),provider_refund_id=null,state='queued' where id=$1",[f.id]),/terminal failure/);
    assert.deepEqual(await scalar(db,'select to_jsonb(f) from private.launch_refunds f where id=$1',[f.id]),oldSnapshot);
    await replace(f); await replace(f);
    assert.deepEqual(await scalar(db,'select failure_snapshot from private.launch_refund_attempts where operation_id=$1',[f.operation_id]),oldSnapshot);
    assert.equal(await scalar(db,"select count(*)::int from private.launch_audit where reservation_id=$1 and action='refund_replacement'",[f.reservation_id]),1);
    const replacement=await claim(); assert.equal(replacement.id,f.id); assert.notEqual(replacement.operation_id,f.operation_id);
    assert.equal(replacement.provider_refund_id,null); assert.equal(replacement.reconcile_first,false);
    await assert.rejects(finish(reconciled,'succeeded','re_terminal'),/stale/);
    await assert.rejects(finish(replacement,'succeeded','re_terminal'),/unique|binding/);
    await finish(replacement,'failed','re_replacement','provider_failed_again');
    // An old approval replay must not replace a later failed operation.
    await replace(f); assert.equal(await scalar(db,'select operation_id from private.launch_refunds where id=$1',[f.id]),replacement.operation_id);
    await assert.rejects(replace({...f,operation_id:randomUUID()}),/stale/);
    await replace(replacement,'re_replacement','evt_second');
    const final=await claim(); assert.notEqual(final.operation_id,replacement.operation_id);
    await finish(final,'succeeded','re_success'); await finish(final,'succeeded','re_success');
    await assert.rejects(replace(final,'re_success'),/terminal failure/);
    assert.equal(await scalar(db,'select count(*)::int from private.launch_refunds where id=$1',[f.id]),1);
    const details=(await admin(db,'select admin_launch_reservation($1) result',[f.reservation_id]))[0].result;
    assert.equal(details.refund_state,'succeeded'); assert.equal(details.failed_refund_attempts.length,2);
    assert.deepEqual(details.failed_refund_attempts.map(a=>a.provider_refund_id),['re_terminal','re_replacement']);
    assert.ok(details.failed_refund_attempts.every(a=>!('claim_id' in a.failure_snapshot)));
  });
  console.log(`${checks} launch reservation SQL groups passed; isolated PostgreSQL only.`);
} finally { await pg.close(); }
