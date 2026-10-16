import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { installLaunchSchema, admin, service, asRole, fixture, attempt, create, pay, cancel, scalar, founder, stranger } from './launch-test-database.mjs';
import { isArrivalCode, readStaffArrival, readArrivalSearch, readArrivalSummary } from '../lib/launch-arrivals.ts';

const pg = new PGlite();
const db = { query: (sql,args) => args ? pg.query(sql,args) : pg.exec(sql).then(r => r.at(-1)) };
let groups = 0;
const check = async (name, run) => { await run(); groups++; console.log(`PASS ${name}`); };
const inspect = async a => (await admin(db, 'select admin_inspect_launch_arrival($1,$2) result', [a.night, a.id]))[0].result;
const summary = async a => (await admin(db, 'select admin_launch_arrival_summary($1) result', [a.night]))[0].result;
const confirm = async (a, revision = 0, method = 'qr', secret = a.arrival, note = null) =>
  (await admin(db, 'select admin_confirm_launch_arrival($1,$2,$3,$4,$5,$6) result', [a.id,a.night,revision,method,secret,note]))[0].result;
const correct = async (a, revision, verified, note = 'Verified with the guest and founder on duty') =>
  (await admin(db, 'select admin_correct_launch_arrival($1,$2,$3,$4,$5) result', [a.id,a.night,revision,verified,note]))[0].result;
async function time(a, ended = false) {
  await db.query('alter table venue_nights disable trigger launch_night_guard');
  await db.query(`update venue_nights set waiting_opens_at=clock_timestamp()-interval '4 hours',
    guaranteed_launch_at=clock_timestamp()-interval '3 hours',closes_at=clock_timestamp()+$2::interval where id=$1`,[a.night,ended?'-1 hour':'1 hour']);
  await db.query('alter table venue_nights enable trigger launch_night_guard');
  await db.query('alter table private.launch_events disable trigger launch_event_guard');
  await db.query("update private.launch_events set registration_opens_at=clock_timestamp()-interval '5 hours' where night_id=$1",[a.night]);
  await db.query('alter table private.launch_events enable trigger launch_event_guard');
}
async function paid() { const {night}=await fixture(db); const a=attempt(night); await create(db,a); await pay(db,a); return a; }
const snapshot = a => scalar(db,`select jsonb_build_object('arrival',(select to_jsonb(a) from private.launch_arrivals a where reservation_id=$1),
  'revision',(select arrival_revision from private.launch_reservations where id=$1),
  'refund',(select to_jsonb(f) from private.launch_refunds f where reservation_id=$1),
  'audit',(select jsonb_agg(to_jsonb(h) order by id) from private.launch_audit h where reservation_id=$1))`,[a.id]);
try {
  await installLaunchSchema(db);
  await check('founder-only reads and writes refuse participants, anonymous sessions and service role', async () => {
    const a=await paid();
    for(const [sql,args] of [
      ['select admin_inspect_launch_arrival($1,$2)',[a.night,a.id]],
      ['select admin_launch_arrival_summary($1)',[a.night]],
      ["select admin_confirm_launch_arrival($1,$2,0,'qr',$3)",[a.id,a.night,a.arrival]],
      ["select admin_correct_launch_arrival($1,$2,0,true,'Evidence')",[a.id,a.night]],
    ]) for(const [role,user] of [['anon',null],['authenticated',null],['authenticated',stranger],['service_role',null]]) {
      await assert.rejects(asRole(db,role,sql,args,user),/authorized|permission denied/);
    }
    assert.equal((await inspect(a)).revision,0);
    assert.equal(await scalar(db,'select count(*)::int from private.launch_refunds'),0);
  });
  await check('strict camera and response contracts reject malformed, cross-night and nullable inputs', async () => {
    const a=await paid(); const row=await inspect(a);
    assert.ok(isArrivalCode(a.arrival));
    for(const value of [null,123,'',a.arrival+'\n',a.arrival.toUpperCase(),` ${a.arrival}`,`https://example.com/${a.arrival}`]) assert.equal(isArrivalCode(value),false);
    assert.equal(readStaffArrival(row,a.night).id,a.id);
    for(const patch of [{id:null},{night_id:randomUUID()},{revision:-1},{can_correct:null},{availability:'other'},{history:[{}]},{verified_at:'never'}])
      assert.throws(()=>readStaffArrival({...row,...patch},a.night));
    assert.equal(readArrivalSummary(await summary(a)).remaining,1);
    const counts=await summary(a); assert.throws(()=>readArrivalSummary({...counts,remaining:'1'}));
    assert.equal(readArrivalSearch([row],a.night).length,1); assert.throws(()=>readArrivalSearch([row],randomUUID()));
    for(const args of [[null,a.id,null],[a.night,null,null],[a.night,a.id,a.arrival],[randomUUID(),a.id,null],[a.night,null,'bad']])
      await assert.rejects(admin(db,'select admin_inspect_launch_arrival($1,$2,$3)',args));
    await assert.rejects(confirm(a),/outside scheduled/);
    await assert.rejects(correct(a,0,true),/unavailable/);
  });
  await check('live QR confirmation is explicit, duplicate-safe and retains original verification', async () => {
    const a=await paid(); await time(a);
    const before=await inspect(a); assert.equal(before.arrival,null); assert.equal(before.availability,'open');
    const result=await confirm(a); assert.equal(result.arrival,'verified'); assert.equal(result.revision,1);
    assert.equal(result.refund_state,'queued'); assert.equal(result.verified_by,founder);
    assert.equal((await summary(a)).verified,1); assert.equal((await summary(a)).remaining,0);
    const saved=await snapshot(a); assert.deepEqual(await confirm(a),result); assert.deepEqual(await snapshot(a),saved);
    await assert.rejects(confirm(a,1,'qr','0'.repeat(64)),/unavailable/);
    await assert.rejects(confirm({...a,night:randomUUID()},1),/unavailable/);
    assert.deepEqual(await snapshot(a),saved);
  });
  await check('manual verification requires bounded notes and rechecks cancellation after lookup', async () => {
    const a=await paid(); await time(a); const before=await snapshot(a);
    for(const note of [null,'','  ','😀'.repeat(501)]) await assert.rejects(confirm(a,0,'manual',null,note),/invalid/);
    await assert.rejects(confirm(a,0,'manual',a.arrival,'Verified'),/invalid/);
    assert.deepEqual(await snapshot(a),before);
    const result=await confirm(a,0,'manual',null,'  '+'😀'.repeat(500)+'  ');
    assert.equal([...result.note].length,500); assert.equal(result.method,'manual');
    const b=await paid(); await time(b); await inspect(b); await cancel(db,b);
    assert.equal((await inspect(b)).availability,'cancelled'); await assert.rejects(confirm(b),/unavailable/);
    assert.equal((await summary(b)).cancelled_count,1);
  });
  await check('undo keeps refund exactly intact, records prior evidence and prevents stale scan/correction replay', async () => {
    const a=await paid(); await time(a); const verified=await confirm(a);
    const refund=await scalar(db,'select to_jsonb(f) from private.launch_refunds f where reservation_id=$1',[a.id]);
    const result=await correct(a,verified.revision,false,'  Wrong booking selected; guest was not here  ');
    assert.equal(result.arrival,null); assert.equal(result.revision,2);
    assert.equal(result.history[0].detail.previous.verified_at,verified.verified_at);
    assert.equal(result.history[0].detail.previous.verified_by,founder);
    assert.equal(result.history[0].detail.note,'Wrong booking selected; guest was not here');
    assert.equal((await summary(a)).remaining,1); assert.equal((await summary(a)).absent,0);
    assert.deepEqual(await scalar(db,'select to_jsonb(f) from private.launch_refunds f where reservation_id=$1',[a.id]),refund);
    await assert.rejects(correct(a,1,false),/arrival changed/); await assert.rejects(confirm(a,0),/arrival changed/);
    const later=await confirm(a,2); assert.equal(later.revision,3); await assert.rejects(correct(a,1,false),/arrival changed/);
    assert.deepEqual(await scalar(db,'select to_jsonb(f) from private.launch_refunds f where reservation_id=$1',[a.id]),refund);
  });
  await check('correction preserves both complete boundary notes, including JSON escaping, during and after the event', async () => {
    for (const character of ['😀', '\u0001']) for (const ended of [false,true]) {
      const a=await paid(); await time(a);
      const previousNote=character.repeat(500), correctionNote=character.repeat(499)+'!';
      const verified=await confirm(a,0,'manual',null,previousNote);
      const refund=(await snapshot(a)).refund;
      if(ended) await time(a,true);
      const result=await correct(a,verified.revision,false,correctionNote);
      assert.equal(result.arrival,ended?'no_show':null); assert.equal(result.revision,2);
      const audit=result.history[0];
      assert.equal(audit.detail.note,correctionNote);
      assert.equal(audit.detail.previous.note,previousNote);
      assert.equal(audit.detail.previous.verified_at,verified.verified_at);
      assert.equal(audit.detail.previous.verified_by,founder);
      assert.equal(audit.actor_id,founder);
      const bytes=await scalar(db,'select octet_length(detail::text) from private.launch_audit where id=$1',[audit.id]);
      assert.ok(bytes>4096); assert.ok(bytes<=8192);
      assert.deepEqual((await snapshot(a)).refund,refund);
    }
  });
  await check('audit storage retains object validation and bounded per-action payload sizes', async () => {
    const a=await paid(); const before=await snapshot(a);
    for(const [action,detail] of [['arrival_corrected',{padding:'x'.repeat(8192)}],['arrival_verified',{padding:'x'.repeat(4096)}],['arrival_corrected',[]]]) {
      await assert.rejects(db.query('insert into private.launch_audit(night_id,reservation_id,action,detail) values($1,$2,$3,$4::jsonb)',
        [a.night,a.id,action,JSON.stringify(detail)]),/launch_audit_detail_check/);
    }
    assert.deepEqual(await snapshot(a),before);
  });
  await check('ended-night missed attendance replaces no-show, updates finance and preserves expired QR refusal', async () => {
    const a=await paid(); await time(a,true); await service(db,'select finalize_launch_no_shows($1)',[a.night]);
    assert.equal((await inspect(a)).arrival,'no_show'); assert.equal((await summary(a)).absent,1);
    let finance=(await admin(db,'select admin_launch_overview($1) result',[a.night]))[0].result.finance[0]; assert.equal(finance.retained,1000);
    await assert.rejects(confirm(a,1),/unavailable/);
    const result=await correct(a,1,true,'Founder verified actual attendance retrospectively');
    assert.equal(result.arrival,'verified'); assert.equal(result.availability,'ended');
    assert.ok(Date.parse(result.verified_at)>Date.now()-10000); assert.equal(result.refund_state,'queued');
    assert.equal((await summary(a)).verified,1); assert.equal((await summary(a)).absent,0);
    finance=(await admin(db,'select admin_launch_overview($1) result',[a.night]))[0].result.finance[0];
    assert.equal(finance.retained,0); assert.equal(finance.outstanding,1000);
    await assert.rejects(admin(db,'select admin_lookup_launch_arrival($1,$2)',[a.night,a.arrival]),/unavailable/);
    const undone=await correct(a,2,false); assert.equal(undone.arrival,'no_show'); assert.equal((await summary(a)).absent,1);
    finance=(await admin(db,'select admin_launch_overview($1) result',[a.night]))[0].result.finance[0];
    assert.equal(finance.retained,0); assert.equal(finance.outstanding,1000);
  });
  await check('correction refuses invalid boundaries without effects and cannot revive cancelled bookings', async () => {
    const a=await paid(); await time(a); await confirm(a); const before=await snapshot(a);
    for(const [rev,verified,note] of [[null,false,'Evidence'],[-1,false,'Evidence'],[1,null,'Evidence'],[1,false,null],[1,false,'\u2003'],[1,false,'😀'.repeat(501)]])
      await assert.rejects(correct(a,rev,verified,note),/invalid/);
    await assert.rejects(correct({...a,night:randomUUID()},1,false),/unavailable/);
    assert.deepEqual(await snapshot(a),before);
    const b=await paid(); await time(b); await cancel(db,b); await time(b,true);
    assert.equal((await inspect(b)).can_correct,false); await assert.rejects(correct(b,0,true),/unavailable/);
    await admin(db,"select admin_cancel_launch_event($1,'cancelled')",[a.night]);
    await correct(a,1,false); await assert.rejects(correct(a,2,true),/unavailable/);
  });
  await check('issued, pending and failed refunds survive attendance correction without new provider work', async () => {
    for(const state of ['pending','succeeded','failed','review_needed']) {
      const a=await paid(); await time(a); await confirm(a);
      // Fixture-only provider states; existing Stripe tests cover their transitions.
      await db.query("update private.launch_refunds set state=$2,provider_refund_id=$3 where reservation_id=$1",[a.id,state,'re_'+a.id.replaceAll('-','')]);
      const before=await scalar(db,'select to_jsonb(f) from private.launch_refunds f where reservation_id=$1',[a.id]);
      await correct(a,1,false); await correct(a,2,true);
      assert.deepEqual(await scalar(db,'select to_jsonb(f) from private.launch_refunds f where reservation_id=$1',[a.id]),before);
    }
  });
  console.log(`${groups} staff arrival groups passed.`);
} finally { await pg.close(); }
