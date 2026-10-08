import assert from 'node:assert/strict';
import { read, seedPair, token, command } from './like-test-database.mjs';
import { asUser } from './name-test-database.mjs';
import { installTextNormalizer } from './text-moderation-test-database.mjs';

// Extends the existing disposable PostgreSQL gate after names/preferences/sync.
export async function testTextModerationConcurrency(observer,one,two,blocked) {
  await installTextNormalizer(observer);
  await observer.query('alter table reports add id uuid primary key default gen_random_uuid()');
  await observer.query(read('supabase/migrations/20261001000001_profile_text_moderation.sql'));
  async function fixture(field='bio') {
    const f=await seedPair(observer);
    f.secondFounder=crypto.randomUUID();
    await observer.query('insert into auth.users values($1)',[f.secondFounder]);
    await observer.query('insert into admins values($1),($2)',[f.c,f.secondFounder]);
    await asUser(observer,f.a,"update profiles set bio='Original' where id=$1",[f.a]);
    f.field=field;
    f.revision=(await asUser(observer,f.c,'select * from admin_text_reviews($1,$2)',[f.a,f.night])).find(r=>r.field===field).revision;
    return f;
  }
  const require=(client,f)=>asUser(client,f.c,'select require_profile_text_correction($1,$2,$3,$4,$5)',[f.a,f.field,f.revision,'inappropriate',f.night]);
  const decide=(client,f,id,action='approved')=>asUser(client,client===two?f.secondFounder:f.c,`select * from ${f.field==='bio'?'decide_bio_correction':'decide_name_correction'}($1,$2)`,[id,action]);
  async function submit(client,f,value='Corrected') {
    const id=crypto.randomUUID();
    if(f.field==='first_name') await asUser(client,f.a,'select submit_name_correction($1,$2)',[id,value]);
    else {
      const revision=(await asUser(client,f.a,'select * from my_text_corrections()')).find(r=>r.field==='bio').revision;
      await asUser(client,f.a,'select submit_bio_correction($1,$2,$3)',[id,value,revision]);
    }
    return id;
  }
  // Participant edits versus the exact text a founder inspected: neither order
  // may publish a new unchecked value or reject a value the founder never saw.
  for(const rejectionFirst of [true,false]) {
    const f=await fixture();
    const edit=()=>asUser(two,f.a,"update profiles set bio='Concurrent' where id=$1",[f.a]);
    const holder=rejectionFirst?one:two,waiter=rejectionFirst?two:one;
    await holder.query('begin'); await (rejectionFirst?require(one,f):edit());
    const pending=(rejectionFirst?edit():require(one,f)).then(()=>null,error=>error);
    await blocked(waiter); await holder.query('commit');
    assert.match((await pending).message,rejectionFirst?/approval required/:/review changed/);
    assert.equal((await observer.query('select bio from profiles where id=$1',[f.a])).rows[0].bio,rejectionFirst?null:'Concurrent');
  }
  for(const field of ['bio','first_name']) for(const approvalFirst of [true,false]) for(const competing of ['rejected','cancelled']) {
    const f=await fixture(field);await require(observer,f);const id=await submit(observer,f);
    const compete=()=>competing==='rejected'?decide(two,f,id,'rejected'):asUser(two,f.a,
      `select ${field==='bio'?'cancel_bio_correction':'cancel_name_correction'}($1)`,[id]);
    const holder=approvalFirst?one:two,waiter=approvalFirst?two:one;
    await holder.query('begin'); await (approvalFirst?decide(one,f,id):compete());
    const pending=approvalFirst?compete():decide(one,f,id);
    await blocked(waiter);await holder.query('commit');await pending;
    const state=(await asUser(observer,f.a,'select * from my_text_corrections()')).find(r=>r.field===field);
    assert.equal(state.required,!approvalFirst);
    assert.equal(state.status,approvalFirst?'approved':competing);
    const events=(await observer.query("select action,actor_id from private.profile_text_events where request_id=$1 and action in ('approved','rejected','cancelled')",[id])).rows;
    assert.equal(events.length,1,'one terminal decision and one attributable event');
    assert.equal(events[0].actor_id,approvalFirst?f.c:competing==='cancelled'?f.a:f.secondFounder);
    if(!approvalFirst) {
      const newer=await submit(observer,f,'Newer');
      assert.equal((await decide(observer,f,id))[0].applied,false);
      assert.equal((await asUser(observer,f.a,'select * from my_text_corrections()')).find(r=>r.field===field).request_id,newer);
    }
  }
  // Name removal races a reciprocal like; established matches survive, while a
  // delayed old gesture cannot create a match after the restriction commits.
  for(const rejectionFirst of [true,false]) {
    const f=await fixture('first_name');
    await command(observer,{actor:f.a,target:f.b,night:f.night,token:await token(observer,f.a,f.venue,f.b)});
    const permission=await token(observer,f.b,f.venue,f.a);
    const like=()=>command(two,{actor:f.b,target:f.a,night:f.night,token:permission});
    const holder=rejectionFirst?one:two,waiter=rejectionFirst?two:one;
    await holder.query('begin');await(rejectionFirst?require(one,f):like());
    const pending=rejectionFirst?like():require(one,f);
    await blocked(waiter);await holder.query('commit');const result=await pending;
    if(rejectionFirst)assert.equal(result.accepted,false);
    assert.equal((await observer.query('select count(*)::int n from matches where venue_night_id=$1',[f.night])).rows[0].n,rejectionFirst?0:1);
  }
  console.log('Text moderation concurrency: inspected edits, approval/rejection/cancellation, stale requests and reciprocal likes passed.');
}
