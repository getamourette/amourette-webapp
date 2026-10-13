import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { installLaunchSchema, service, admin, asRole, fixture, attempt, create, pay, cancel, scalar, founder, stranger, payment } from './launch-test-database.mjs';
import { refundRecoveryInput } from '../lib/launch-operations.ts';
import { recoverLaunchRefund } from '../lib/server/launch-recovery.ts';
import { reconcileRefund } from '../lib/server/launch-provider.ts';
import { processRefund } from '../lib/server/launch-engine.ts';
const pg = new PGlite();
const db = { query: (sql,args) => args ? pg.query(sql,args) : pg.exec(sql).then(r => r.at(-1)) };
const rpc = async (name,args) => {
  const entries=Object.entries(args);
  return (await service(db,`select ${name}(${entries.map(([key],i)=>`${key}=>$${i+1}`).join(',')}) result`,entries.map(([,v])=>v)))[0].result;
};
const account='acct_operations';
async function paid(options={}) {
  const {night}=await fixture(db,options),a=attempt(night);
  await create(db,a); await pay(db,a);
  await db.query(`insert into private.launch_checkout_work(reservation_id,account_id,origin,delivery_envelope) values($1,$2,'https://example.com',$3)`,[a.id,account,'v1.'+'x'.repeat(100)]);
  return a;
}
let groups=0;
async function check(name,fn){await fn();groups++;console.log(`PASS ${name}`);}
try {
  await installLaunchSchema(db);
  await check('recovery input is strict, bounded in code points and normalized before effects',async()=>{
    const input={reservation:randomUUID(),operation:null,action:'adopt',provider:'re_123',note:' 😀 '};
    assert.equal(refundRecoveryInput(input).note,'😀');
    assert.equal(refundRecoveryInput({...input,note:'😀'.repeat(500)}).note.length,1000);
    for(const patch of [{operation:undefined},{action:'replace'},{provider:'https://stripe.com/re_1'},{note:'😀'.repeat(501)},{note:null},{reservation:null},{actor:founder}])assert.throws(()=>refundRecoveryInput({...input,...patch}));
  });
  await check('founder/service boundaries deny guests, strangers and browser replacement attestations',async()=>{
    const a=await paid();
    for(const user of [null,stranger])await assert.rejects(asRole(db,'authenticated','select admin_launch_overview($1)',[a.night],user),/authorized/);
    for(const role of ['anon','authenticated']) {
      await assert.rejects(asRole(db,role,'select inspect_launch_refund_recovery($1)',[a.id],founder),/permission/);
      await assert.rejects(asRole(db,role,"select admin_replace_failed_launch_refund($1,$2,'re_x','txn_x','verified')",[a.id,randomUUID()],founder),/permission/);
    }
    await assert.rejects(rpc('adopt_launch_refund',{p_id:a.id,p_operation:null,p_provider:'re_123',p_state:'succeeded',p_actor:stranger,p_note:'verified'}),/authorized/);
    assert.equal(await scalar(db,'select count(*)::int from private.launch_refunds'),0);
  });
  await check('whole-event totals separate held, retained, due and refunded; cancellation returns retained deposits',async()=>{
    const a=await paid({start:'1 day',end:'1 day 4 hours'});
    await cancel(db,a);
    let overview=(await admin(db,'select admin_launch_overview($1) result',[a.night]))[0].result;
    assert.equal(overview.finance[0].retained,1000); assert.equal(overview.finance[0].outstanding,0);
    await admin(db,"select admin_cancel_launch_event($1,'postponed')",[a.night]);
    overview=(await admin(db,'select admin_launch_overview($1) result',[a.night]))[0].result;
    assert.equal(overview.finance[0].retained,0);assert.equal(overview.finance[0].outstanding,1000);
    assert.equal(overview.event.cancellation_reason,'postponed');
    const f=await scalar(db,'select to_jsonb(f) from private.launch_refunds f where reservation_id=$1',[a.id]);
    await rpc('adopt_launch_refund',{p_id:a.id,p_operation:f.operation_id,p_provider:'re_organizer',p_state:'succeeded',p_actor:founder,p_note:'Full Dashboard refund verified'});
    overview=(await admin(db,'select admin_launch_overview($1) result',[a.night]))[0].result;
    assert.equal(overview.finance[0].refunded,1000); assert.equal(overview.finance[0].charged,1000); assert.equal(overview.finance[0].outstanding,0);
  });
  await check('search is event-scoped, literal, filtered before pagination and rejects invalid boundaries',async()=>{
    const a=await paid();
    const search=(query,filter='all')=>admin(db,'select admin_search_launch_reservations($1,$2,$3) result',[a.night,query,filter]);
    assert.equal((await search(a.email.toUpperCase()))[0].result.length,1);
    assert.equal((await search('%'))[0].result.length,0);
    assert.equal((await search('','refunded'))[0].result.length,0);
    assert.equal((await search('','paid'))[0].result.length,1);
    for(const [q,f] of [[null,'all'],['x'.repeat(255),'all'],['','unknown']])await assert.rejects(search(q,f),/invalid/);
    const serialized=JSON.stringify((await search(''))[0].result);
    assert.ok(!serialized.includes('hash'));assert.ok(!serialized.includes(a.management));
  });
  await check('external adoption fences stale operations and live workers, is audited once, preserves arrival',async()=>{
    const a=await paid(); await cancel(db,a);
    const f=await scalar(db,'select to_jsonb(f) from private.launch_refunds f where reservation_id=$1',[a.id]);
    const adopt=op=>rpc('adopt_launch_refund',{p_id:a.id,p_operation:op,p_provider:'re_external',p_state:'pending',p_actor:founder,p_note:'Verified in Stripe'});
    await assert.rejects(adopt(randomUUID()),/changed/);
    await db.query("update private.launch_refunds set claim_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes' where id=$1",[f.id]);
    await assert.rejects(adopt(f.operation_id),/busy/);
    await db.query('update private.launch_refunds set claim_id=null,lease_until=null where id=$1',[f.id]);
    await adopt(f.operation_id); await adopt(f.operation_id);
    assert.equal(await scalar(db,"select count(*)::int from private.launch_audit where reservation_id=$1 and action='external_refund_linked'",[a.id]),1);
    assert.equal(await scalar(db,'select count(*)::int from private.launch_arrivals where reservation_id=$1',[a.id]),0);
    const current=await scalar(db,'select to_jsonb(f) from private.launch_refunds f where id=$1',[f.id]);
    const candidate={id:'re_external',amount:1000,currency:'eur',payment_intent:payment(a),status:'pending',metadata:{}};
    assert.equal((await reconcileRefund({refunds:{retrieve:async()=>candidate}}, {...current,payment_id:payment(a)})).id,'re_external');
    await assert.rejects(reconcileRefund({refunds:{retrieve:async()=>({...candidate,amount:999})}}, {...current,payment_id:payment(a)}),/mismatch/);
  });
  await check('first worker attempt detects a Dashboard refund without ever creating another',async()=>{
    let creates=0;
    await assert.rejects(reconcileRefund({refunds:{async *list(){yield {id:'re_manual',status:'succeeded',metadata:{}};},async create(){creates++;}}},
      {payment_id:'pi_x',operation_id:'op',provider_refund_id:null,reconcile_first:false}),/unrecognized/);
    assert.equal(creates,0);
  });
  await check('pending insufficient balance is visible and does not starve later obligations',async()=>{
    // Isolate work eligibility without changing the semantics of financial rows.
    await db.query("update private.launch_refunds set claim_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '1 hour' where state in ('pending','queued')");
    const a=await paid(),b=await paid(); await cancel(db,a);await cancel(db,b);
    const seen=[];
    const provider={refunds:{async *list(){},async create(p){seen.push(p.payment_intent);return {id:`re_${seen.length}`,payment_intent:p.payment_intent,amount:1000,currency:'eur',status:'pending',pending_reason:'insufficient_funds',metadata:p.metadata};}}};
    await processRefund(rpc,provider,account);
    await db.query("update private.launch_refunds set lease_until=clock_timestamp()-interval '1 second' where reservation_id=$1",[a.id]);
    await processRefund(rpc,provider,account);
    assert.deepEqual(seen,[payment(a),payment(b)]);
    const owned=await scalar(db,'select id from private.launch_refunds where reservation_id=$1',[a.id]);
    await admin(db,"select admin_claim_launch_refund($1,'I will coordinate the Stripe funding')",[owned]);
    await admin(db,"select admin_claim_launch_refund($1,'I will coordinate the Stripe funding')",[owned]);
    assert.equal(await scalar(db,'select review_owner from private.launch_refunds where id=$1',[owned]),founder);
    assert.equal(await scalar(db,"select count(*)::int from private.launch_audit where reservation_id=$1 and action='refund_owner_assigned'",[a.id]),1);
    const overview=(await admin(db,'select admin_launch_overview($1) result',[a.night]))[0].result;
    assert.equal(overview.finance[0].awaiting_funds,1);assert.equal(overview.finance[0].refunded,0);
  });
  await check('provider recovery verifies account, payment, full amount, disputes and returned funds before SQL effects',async()=>{
    const a=await paid();
    const evidence=await rpc('inspect_launch_refund_recovery',{p_id:a.id});
    let candidate={id:'re_verified',payment_intent:payment(a),amount:1000,currency:'eur',status:'succeeded',metadata:{}};
    let charge={id:'ch_test',disputed:false,amount:1000,currency:'eur',amount_refunded:0};
    const provider={paymentIntents:{retrieve:async()=>({livemode:false,status:'succeeded',amount_received:1000,currency:'eur',metadata:{integration:'amourette_launch_v1',reservation_id:a.id},latest_charge:charge})},
      refunds:{async *list(){yield candidate;},retrieve:async()=>candidate},balanceTransactions:{retrieve:async()=>({id:'txn_returned',source:candidate.id,type:'refund_failure',amount:1000})}};
    const input={reservation:a.id,operation:null,action:'adopt',provider:candidate.id,note:'Verified full Dashboard refund'};
    await assert.rejects(recoverLaunchRefund(rpc,provider,'acct_wrong',founder,input),/mismatch/);
    candidate.amount=500;await assert.rejects(recoverLaunchRefund(rpc,provider,account,founder,input),/mismatch/);candidate.amount=1000;
    charge.disputed=true;await assert.rejects(recoverLaunchRefund(rpc,provider,account,founder,input),/mismatch/);charge.disputed=false;
    assert.equal((await rpc('inspect_launch_refund_recovery',{p_id:a.id})).refund,null);
    await recoverLaunchRefund(rpc,provider,account,founder,input);
    assert.equal((await rpc('inspect_launch_refund_recovery',{p_id:a.id})).refund.state,'succeeded');
    assert.equal(evidence.refund,null);
    const b=await paid();await cancel(db,b);
    const f=await scalar(db,'select to_jsonb(f) from private.launch_refunds f where reservation_id=$1',[b.id]);
    await db.query("update private.launch_refunds set state='failed',provider_refund_id='re_failed' where id=$1",[f.id]);
    const replacement={reservation:b.id,operation:f.operation_id,action:'replace',provider:'re_failed',note:'Returned funds verified'};
    candidate={...candidate,id:'re_failed',payment_intent:payment(b),status:'failed'};
    provider.paymentIntents.retrieve=async()=>({livemode:false,status:'succeeded',amount_received:1000,currency:'eur',metadata:{integration:'amourette_launch_v1',reservation_id:b.id},latest_charge:charge});
    await assert.rejects(recoverLaunchRefund(rpc,provider,account,founder,replacement),/unverified/);
    candidate.failure_balance_transaction='txn_returned';
    await recoverLaunchRefund(rpc,provider,account,founder,replacement);
    const next=(await rpc('inspect_launch_refund_recovery',{p_id:b.id})).refund;
    assert.notEqual(next.operation_id,f.operation_id);assert.equal(next.provider_refund_id,null);assert.equal(next.state,'queued');
    assert.equal(await scalar(db,'select verified_by from private.launch_refund_attempts where operation_id=$1',[f.operation_id]),founder);
    await assert.rejects(recoverLaunchRefund(rpc,provider,account,founder,replacement),/unverified/);
  });
  console.log(`${groups} launch operations groups passed`);
} finally { await pg.close(); }
