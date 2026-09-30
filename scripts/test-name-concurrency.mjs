import assert from 'node:assert/strict';
import { installNameSchema,asUser } from './name-test-database.mjs';
import { seedPair,token,command } from './like-test-database.mjs';

// Runs inside the existing disposable PostgreSQL 17 gate, after #231's cases.
export async function testNameConcurrency(observer,one,two,blocked,waitFor) {
  await installNameSchema(observer);
  async function fixture() {
    const f=await seedPair(observer);
    await observer.query('insert into admins values($1)',[f.c]);
    f.request=crypto.randomUUID();
    await asUser(observer,f.a,'select submit_name_correction($1,$2)',[f.request,'Alice']);
    return f;
  }
  const decision=(client,f,action='approved')=>asUser(client,f.c,'select * from decide_name_correction($1,$2)',[f.request,action]);
  const cancel=(client,f)=>asUser(client,f.a,'select cancel_name_correction($1)',[f.request]);
  for(const competitor of ['approve','reject','cancel']) for(const approvalFirst of [true,false]) {
    const f=await fixture();
    const approve=()=>decision(one,f);
    const compete=()=>competitor==='cancel'?cancel(two,f):decision(two,f,competitor==='approve'?'approved':'rejected');
    const holder=approvalFirst?one:two,waiter=approvalFirst?two:one;
    await holder.query('begin');
    await (approvalFirst?approve():compete());
    const pending=approvalFirst?compete():approve();
    await blocked(waiter); await holder.query('commit'); await pending;
    const expected=approvalFirst||competitor==='approve'?'approved':competitor==='cancel'?'cancelled':'rejected';
    const state=(await observer.query('select status from private.name_corrections where id=$1',[f.request])).rows[0].status;
    assert.equal(state,expected);
    assert.equal((await observer.query('select first_name from profiles where id=$1',[f.a])).rows[0].first_name,expected==='approved'?'Alice':'Test');
  }
  // Same UUID submit retries and different pending requests serialize on owner.
  for(const same of [true,false]) {
    const f=await seedPair(observer),id=crypto.randomUUID();
    await one.query('begin');
    await asUser(one,f.a,'select submit_name_correction($1,$2)',[id,'Alice']);
    const waiting=asUser(two,f.a,'select submit_name_correction($1,$2)',[same?id:crypto.randomUUID(),'Alice']);
    // Attach rejection handling before releasing the holder.
    const outcome=waiting.then(()=>true,error=>{assert.match(error.message,/pending correction/);return false;});
    await blocked(two); await one.query('commit'); assert.equal(await outcome,same);
  }
  // Approval before matching excludes history; approval after matching includes it.
  for(const approvalFirst of [true,false]) {
    const f=await fixture();
    await command(observer,{actor:f.a,target:f.b,night:f.night,token:await token(observer,f.a,f.venue,f.b)});
    const reciprocal=await token(observer,f.b,f.venue,f.a);
    const like=()=>command(two,{actor:f.b,target:f.a,night:f.night,token:reciprocal});
    const holder=approvalFirst?one:two,waiter=approvalFirst?two:one;
    await holder.query('begin');
    await (approvalFirst?decision(one,f):like());
    const pending=approvalFirst?like():decision(one,f);
    await blocked(waiter);
    if (!approvalFirst) await two.query('select 1 from profiles where id=$1 for update nowait',[f.a]);
    await holder.query('commit'); await pending;
    assert.equal((await observer.query('select count(*)::int n from private.match_name_notices where recipient_id=$1',[f.b])).rows[0].n,approvalFirst?0:1);
  }
  // Terminal cleanup and approval never deadlock or leave orphan notice state.
  for(const approvalFirst of [true,false]) {
    const f=await fixture();
    await command(observer,{actor:f.a,target:f.b,night:f.night,token:await token(observer,f.a,f.venue,f.b)});
    await command(observer,{actor:f.b,target:f.a,night:f.night,token:await token(observer,f.b,f.venue,f.a)});
    const end=()=>two.query("select private.transition_venue_night($1,'ended',null,null)",[f.night]);
    const holder=approvalFirst?one:two,waiter=approvalFirst?two:one;
    await holder.query('begin'); await (approvalFirst?decision(one,f):end());
    const pending=approvalFirst?end():decision(one,f);
    await blocked(waiter); await holder.query('commit'); await pending;
    assert.equal((await observer.query('select count(*)::int n from private.match_name_notices where recipient_id=$1',[f.b])).rows[0].n,0);
  }
  // A notice receipt that waits across expiry must be refused at execution time.
  {
    const f=await fixture();
    await command(observer,{actor:f.a,target:f.b,night:f.night,token:await token(observer,f.a,f.venue,f.b)});
    const {match_id:match}=await command(observer,{actor:f.b,target:f.a,night:f.night,token:await token(observer,f.b,f.venue,f.a)});
    await decision(observer,f);
    await observer.query("update matches set expires_at=clock_timestamp()+interval '250 milliseconds' where id=$1",[match]);
    await one.query('begin');await one.query('select private.lock_like_eligibility()');
    const pending=asUser(two,f.b,'select acknowledge_name_correction($1,$2) acknowledged',[match,f.request]);
    await blocked(two);
    await waitFor(async()=> (await observer.query('select clock_timestamp()>=expires_at expired from matches where id=$1',[match])).rows[0].expired,'notice expiry');
    await one.query('commit');assert.equal((await pending)[0].acknowledged,false);
  }
  console.log('PostgreSQL 17 name corrections: submit replay, approval/rejection/cancellation, match creation and terminal cleanup in both orders passed.');
}
