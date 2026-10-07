import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
const read = (path) => readFileSync(path, 'utf8');
const one = async (sql, args=[]) => (await db.query(sql,args)).rows[0];
try {
  await db.exec(read('tests/night-reports/schema.sql'));
  // Existing legacy source tables and message collector, not a reimplementation.
  await db.exec(read('supabase/migrations/20260709000002_admin_scan_completion_stats.sql'));
  await db.exec(read('supabase/migrations/20260717000002_founder_analytics.sql'));
  for (const table of ['venue_scan_events','venue_match_events','venue_chat_start_events','venue_conversation_events','analytics_events']) {
    await db.exec(`alter table ${table} add column venue_night_id uuid references venue_nights(id) on delete set null`);
  }
  const lifecycle = read('supabase/migrations/20260724000001_durable_venue_night_lifecycle.sql');
  await db.exec(lifecycle.slice(lifecycle.indexOf('create or replace function public.set_like_expires_at()'), lifecycle.indexOf('create or replace function private.my_active_venue_night_ids()')));
  await db.exec(lifecycle.slice(lifecycle.indexOf('create or replace function private.scope_analytics_to_venue_night()'), lifecycle.indexOf('-- QA venues use ordinary')));
  await db.exec('create trigger likes_create_match after insert on likes for each row execute function handle_new_like()');
  const founder = '00000000-0000-0000-0000-000000000001';
  const people = Array.from({length:12},(_,i)=>`00000000-0000-0000-0000-${String(i+10).padStart(12,'0')}`);
  for (const id of [founder,...people]) await db.query('insert into auth.users values($1)',[id]);
  await db.query('insert into admins values($1)',[founder]);
  for (const [index,id] of people.entries()) {
    await db.query('insert into profiles values($1,$2)',[id,index<3?'woman':index<7?'man':'nonbinary']);
    await db.query('insert into profile_private values($1,null)',[id]);
  }
  const venue = (await one('insert into venues default values returning id')).id;
  const oldNight = (await one("insert into venue_nights(venue_id,waiting_opens_at,closes_at,terminal_at,terminal_reason) values($1,now()-interval '2 days',now()-interval '1 day',now()-interval '1 day','scheduled_end') returning id",[venue])).id;
  await db.query('insert into presence(profile_id,venue_id,venue_night_id,checked_in_at,left_at) values($1,$2,$3,now()-interval \'2 days\',now()-interval \'1 day\')',[people[0],venue,oldNight]);
  // Old uniqueness allowed one row per date even within a multi-day exact night.
  await db.query("insert into venue_scan_events(user_id,venue_id,venue_night_id,night) values($1,$2,$3,current_date-2),($1,$2,$3,current_date-1)",[people[0],venue,oldNight]);
  // An unassigned legacy event must not be attributed to this historical night.
  await db.query("insert into analytics_events(event_name,user_id,session_id) values('landing_viewed',$1,'old-session')",[people[0]]);
  await db.exec(read('supabase/migrations/20260930000002_durable_night_reports.sql'));
  // #182 must coexist with the actual current report/lifecycle cleanup.
  const inputRules = read('supabase/migrations/20260909000003_input_validation_contract.sql');
  await db.exec(inputRules.slice(0,inputRules.indexOf('-- Runs before existing')));
  await db.exec(read('supabase/migrations/20261007000001_launch_reservations.sql'));

  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[founder]);
  const report = async (id) => one('select * from admin_venue_night_report($1)',[id]);
  const historical = await report(oldNight);
  assert.equal(historical.partial,true); assert.equal(historical.participants,1); assert.equal(historical.scanners,1);
  for(const key of ['preexisting_profiles','completed_profiles','likes','likes_distribution','matches_distribution','arrival_distribution','first_match_sample','gender_mix','likes_by_gender']) assert.equal(historical[key],null,key);
  assert.equal(Number((await one("select deleted_rows from private.unassigned_analytics_cleanup where source_table='analytics_events'")).deleted_rows),1);
  assert.equal((await one('select count(*)::int n from analytics_events')).n,0);
  const night = (await one("insert into venue_nights(venue_id,waiting_opens_at,closes_at,stats_started_at,opened_at,launched_at) values($1,now()-interval '2 hours',now()+interval '2 hours',now()-interval '3 hours',now()-interval '2 hours',now()-interval '2 hours') returning id",[venue])).id;
  const as = async (id) => db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  // A booked participant is independent of profiles/presence. Seed an already-paid
  // reservation for the currently live fixture, then exercise real cancellation.
  const booking='00000000-0000-0000-0000-000000000182';
  await db.query("insert into private.launch_events values($1,now()-interval '7 days',1,1000,'eur','launch-v1',null,null)",[night]);
  await db.query(`insert into private.launch_reservations(id,night_id,email,first_name,locale,policy_version,late_cancellation_acknowledged,hold_until,state,confirmed_at)
    values($1,$2,'booking@example.com','Alice','en','launch-v1',true,now()+interval '1 hour','confirmed',now())`,[booking,night]);
  await db.query("insert into private.launch_payments(reservation_id,amount_minor,currency,state,payment_id,paid_at) values($1,1000,'eur','paid','pi_report',now())",[booking]);
  await db.query("insert into private.launch_credentials values($1,private.launch_secret_hash(repeat('a',64)),now()+interval '7 days',private.launch_secret_hash(repeat('b',64)),null)",[booking]);

  await db.query('update profile_private set adult_confirmed_at=now() where id=$1',[people[0]]);
  for (const id of people.slice(0,4)) { await as(id); await db.query('select record_venue_scan($1)',[venue]); await db.query('select record_venue_scan($1)',[venue]); }
  await db.query('update profile_private set adult_confirmed_at=now() where id=$1',[people[1]]);
  for (const id of people.slice(0,5)) await db.query("insert into presence(profile_id,venue_id,venue_night_id,checked_in_at) values($1,$2,$3,now()-interval '90 minutes')",[id,venue,night]);
  // Freeze the entry gender. Include inactive/zero-activity participants in groups.
  await db.query("update profiles set gender='man' where id=$1",[people[0]]);
  await db.query("insert into presence(profile_id,venue_id,venue_night_id,checked_in_at,left_at) values($1,$2,$3,now()-interval '60 minutes',now()-interval '30 minutes')",[people[0],venue,night]);
  const like = async (a,b) => db.query('insert into likes(liker_id,liked_id,venue_id,venue_night_id) values($1,$2,$3,$4)',[people[a],people[b],venue,night]);
  for(const [a,b] of [[0,1],[1,0],[0,2],[2,0],[0,3],[3,0],[1,2]]) await like(a,b);
  const matches=(await db.query('select id,profile_a,profile_b from matches order by profile_b')).rows;
  assert.equal(matches.length,3);
  await db.query("update matches set created_at=now()-interval '80 minutes'");
  // The collector captures insertion time, so explicitly give the synthetic clock
  // known first-match delays to test the database percentile calculation.
  for(const [index,seconds] of [60,120,240,600].entries()) await db.query("update private.night_people set first_match_at=entered_at+make_interval(secs=>$1) where venue_night_id=$2 and person_id=$3",[seconds,night,people[index]]);
  await db.query("insert into messages(match_id,sender_id,body) values($1,$2,'first'),($1,$2,'again')",[matches[0].id,people[0]]);
  await db.query("insert into messages(match_id,sender_id,body) values($1,$2,'reply')",[matches[0].id,people[1]]);
  await db.query("insert into messages(match_id,sender_id,body) values($1,$2,'one way')",[matches[1].id,people[0]]);
  // Losing operational interactions before terminal end must not erase outcomes.
  await db.query('delete from matches where id=$1',[matches[0].id]);
  await db.query('delete from likes where liker_id=$1 and liked_id=$2',[people[0],people[1]]);
  await as(people[0]); await db.query('select record_room_arrival($1,0)',[night]); await db.query('select record_room_arrival($1,42)',[night]);
  await as(people[1]); await db.query('select record_room_arrival($1,3)',[night]);
  await as(people[2]); await db.query('select record_room_arrival($1,6)',[night]);
  await as(founder);
  const live=await report(night);
  assert.equal(live.partial,false); assert.equal(live.scanners,4); assert.equal(live.preexisting_profiles,1); assert.equal(live.completed_profiles,1); assert.equal(live.incomplete_scanners,3); assert.equal(live.dropoffs,2);
  assert.equal(live.participants,5); assert.equal(live.scan_entrants,4);
  assert.equal(live.likes,7); assert.equal(live.like_senders,4); assert.deepEqual(live.likes_distribution,[1,2,1,1]);
  assert.equal(live.matches,3); assert.equal(live.matched_participants,4); assert.deepEqual(live.matches_distribution,[1,3,0,1]);
  assert.equal(live.conversations,2); assert.equal(live.replies,1);
  assert.deepEqual(live.arrival_distribution,[1,1,1]); assert.equal(live.arrival_observations,3);
  assert.equal(live.first_match_sample,4); assert.equal(live.first_match_median_seconds,180);
  assert.equal(live.peak,5); assert.deepEqual(live.gender_mix,{woman:3,man:2,nonbinary:0});
  const women=live.likes_by_gender.find(g=>g.gender==='woman');
  assert.deepEqual(women,{gender:'woman',participants:3,sent:6,received:6,senders:3,receivers:3});
  const men=live.likes_by_gender.find(g=>g.gender==='man');
  assert.deepEqual(men,{gender:'man',participants:2,sent:1,received:1,senders:1,receivers:1});
  const emptyGender=live.likes_by_gender.find(g=>g.gender==='nonbinary'); assert.equal(emptyGender.participants,0);
  for(const g of live.likes_by_gender) assert.ok(g.participants>=g.senders && g.participants>=g.receivers);
  assert.ok(live.attendance.every(b=>new Date(b.at).getUTCMinutes()%30===0));
  // Authorization and invalid-input refusals leave the observation unchanged.
  await as(people[3]);
  await assert.rejects(()=>report(night),/not authorized/);
  const before = await one('select to_jsonb(p) p from private.night_people p where venue_night_id=$1 and person_id=$2',[night,people[3]]);
  for(const args of [[night,-1],[night,null],[null,1],[night,'1.5'],[night,2147483648]]) await assert.rejects(()=>db.query('select record_room_arrival($1,$2)',args));
  assert.deepEqual(await one('select to_jsonb(p) p from private.night_people p where venue_night_id=$1 and person_id=$2',[night,people[3]]),before);
  await db.query('update presence set is_visible=false where profile_id=$1',[people[3]]);
  await assert.rejects(()=>db.query('select record_room_arrival($1,1)',[night]),/active live entry required/);
  await db.query('update presence set is_visible=true where profile_id=$1',[people[3]]);
  await db.query('select record_room_arrival($1,2147483647)',[night]);
  assert.equal((await one('select arrival_count from private.night_people where venue_night_id=$1 and person_id=$2',[night,people[3]])).arrival_count,2147483647);
  await db.exec('set role authenticated');
  await assert.rejects(()=>db.query('select * from private.night_people'),/permission denied/);
  await assert.rejects(()=>db.query('select * from venue_night_reports'),/permission denied/);
  await assert.rejects(()=>db.query('select private.finalize_night_report($1)',[night]),/permission denied/);
  await assert.rejects(()=>report(night),/not authorized/);
  await as(founder); assert.equal((await report(night)).likes,7);
  await db.exec('reset role'); await as(founder);
  await db.query("select private.transition_venue_night($1,'closed')",[night]);
  assert.equal((await report(night)).finalized_at,null); assert.equal((await report(night)).likes,7);
  assert.equal((await one('select count(*)::int n from matches')).n,2);
  await db.query("select private.transition_venue_night($1,'reopened')",[night]);
  await db.query("insert into presence(profile_id,venue_id,venue_night_id) values($1,$2,$3)",[people[0],venue,night]);
  assert.equal((await report(night)).participants,5);
  // A separate night remains untouched by cleanup.
  const otherVenue=(await one('insert into venues default values returning id')).id;
  const otherNight=(await one("insert into venue_nights(venue_id,waiting_opens_at,closes_at,stats_started_at) values($1,now(),now()+interval '1 hour',now()-interval '1 hour') returning id",[otherVenue])).id;
  await db.query("insert into presence(profile_id,venue_id,venue_night_id,checked_in_at) values($1,$2,$3,now()-interval '10 minutes')",[people[5],otherVenue,otherNight]);
  const otherBefore=await report(otherNight);
  const otherIntervals = await one('select jsonb_agg(to_jsonb(i) order by presence_id) intervals from private.night_intervals i where venue_night_id=$1',[otherNight]);
  await db.query("select private.transition_venue_night($1,'cancelled')",[night]);
  const final=await report(night); assert.ok(final.finalized_at); assert.equal(final.likes,7); assert.equal(final.matches,3);
  const retainedBooking=(await one("select get_launch_reservation($1,repeat('a',64)) result",[booking])).result;
  assert.equal(retainedBooking.state,'cancelled'); assert.equal(retainedBooking.refund_state,'queued');
  assert.equal((await one('select count(*)::int n from private.launch_payments where reservation_id=$1',[booking])).n,1);
  assert.equal((await one('select count(*)::int n from private.launch_refunds where reservation_id=$1',[booking])).n,1);

  for(const table of ['likes','matches','venue_scan_events','venue_match_events','venue_chat_start_events','venue_conversation_events','analytics_events','private.night_people','private.night_intervals','private.night_conversations']) assert.equal((await one(`select count(*)::int n from ${table} where venue_night_id=$1`,[night])).n,0,table);
  assert.equal((await one('select count(*)::int n from messages')).n,0);
  await db.query("select private.transition_venue_night($1,'cancelled')",[night]);
  await db.query('select private.finalize_night_report($1)',[night]);
  assert.deepEqual(await report(night),final);
  await assert.rejects(()=>like(4,0),/venue night ended/);
  await as(people[0]); await assert.rejects(()=>db.query('select record_room_arrival($1,1)',[night]),/active live entry required/);
  await db.query('select record_venue_scan($1)',[venue]);
  await as(founder); assert.deepEqual(await report(night),final);
  // A live curve can extend as the wall clock crosses a half-hour boundary.
  // Compare its retained interval sources and all time-independent measures.
  const { attendance: beforeCurve, ...otherMeasuresBefore } = otherBefore;
  const { attendance: afterCurve, ...otherMeasuresAfter } = await report(otherNight);
  assert.ok(beforeCurve.length > 0 && afterCurve.length > 0);
  assert.equal(otherMeasuresAfter.peak,1);
  assert.deepEqual(otherMeasuresAfter,otherMeasuresBefore);
  assert.deepEqual(await one('select jsonb_agg(to_jsonb(i) order by presence_id) intervals from private.night_intervals i where venue_night_id=$1',[otherNight]),otherIntervals);
  assert.equal((await one('select likes from admin_venue_night_outcomes() where venue_night_id=$1',[night])).likes,7);
  assert.equal((await one('select likes from admin_night_stats() where venue_id=$1 order by night desc',[venue])).likes,7);
  assert.equal((await one('select conversations_started from admin_founder_analytics() where venue_id=$1 order by night desc',[venue])).conversations_started,2);
  // A later statement failing in terminal cleanup rolls the whole transition back.
  await db.exec("create function private.fail_transition() returns trigger language plpgsql as $$begin raise exception 'synthetic transition failure'; end$$; create trigger fail_transition before insert on venue_night_transitions for each row execute function private.fail_transition()");
  await assert.rejects(()=>db.query("select private.transition_venue_night($1,'cancelled')",[otherNight]),/synthetic transition failure/);
  assert.equal((await one('select terminal_at from venue_nights where id=$1',[otherNight])).terminal_at,null);
  assert.equal((await one('select count(*)::int n from venue_night_reports where venue_night_id=$1',[otherNight])).n,0);
  assert.equal((await one('select count(*)::int n from private.night_people where venue_night_id=$1',[otherNight])).n,1);
  await db.exec('drop trigger fail_transition on venue_night_transitions');
  // Distinct nights on the same local date never share scan deduplication.
  await as(people[0]); await db.query('select record_venue_scan($1)',[otherVenue]);
  const second=(await one("insert into venue_nights(venue_id,waiting_opens_at,closes_at,stats_started_at) values($1,now(),now()+interval '2 hours',now()-interval '1 hour') returning id",[venue])).id;
  await db.query('select record_venue_scan($1)',[venue]);
  await as(founder); assert.equal((await report(second)).scanners,1);
  // Test schedule clamping and half-open time boundaries.
  const scheduleStart='2026-03-29T00:00:00Z'; // Europe/Paris DST jump at 01:00 UTC
  const scheduleEnd='2026-03-29T02:00:00Z';
  for(const id of people.slice(0,10)) await db.query('insert into presence(profile_id,venue_id,venue_night_id) values($1,$2,$3)',[id,venue,second]);
  await db.query("update private.night_intervals set entered_at=$1,left_at=$2 where venue_night_id=$3",[scheduleStart,'2026-03-29T00:30:00Z',second]);
  // Five return exactly as the first group leaves: there are never 15 present.
  for(const id of people.slice(0,5)) await db.query('insert into private.night_intervals values(gen_random_uuid(),$1,$2,$3,$4)',[second,id,'2026-03-29T00:30:00Z','2026-03-29T05:00:00Z']);
  await db.query("update venue_nights set waiting_opens_at=$1,stats_started_at=$1::timestamptz-interval '1 hour',closes_at=$2 where id=$3",[scheduleStart,scheduleEnd,second]);
  await db.query("select private.transition_venue_night($1,'ended')",[second]);
  const timed=await report(second);
  assert.deepEqual(timed.attendance.map(b=>b.count),[10,5,5,5]); assert.equal(timed.peak,10);
  assert.equal(Object.values(timed.gender_mix).reduce((a,b)=>a+b,0),10);
  assert.equal(timed.participants,10); assert.equal(timed.like_senders,0);
  assert.deepEqual(timed.likes_distribution,[10,0,0,0]);
  assert.equal(new Intl.DateTimeFormat('en-GB',{timeZone:timed.timezone,hour:'2-digit',minute:'2-digit'}).format(new Date(timed.attendance[2].at)),'03:00');
  // The report has no source identities or free-form participant properties.
  for(const id of [...people,...matches.map(m=>m.id)]) assert.ok(!JSON.stringify(final).includes(id));
  // An account deletion during a night preserves already counted presence.
  await db.query('delete from auth.users where id=$1',[people[5]]);
  assert.equal((await report(otherNight)).participants,1);
  // Old event retries cannot re-create identifying analytics after finalization.
  await db.query("insert into analytics_events(event_name,user_id,session_id,venue_id,venue_night_id) values('landing_viewed',$1,'late-session',$2,$3)",[people[0],venue,night]);
  assert.equal((await one('select count(*)::int n from analytics_events where venue_night_id=$1',[night])).n,0);
  await assert.rejects(()=>report(null),/venue night required/);
  await assert.rejects(()=>report('00000000-0000-0000-0000-999999999999'),/venue night not found/);
  await as(null); await assert.rejects(()=>db.query('select record_room_arrival($1,0)',[otherNight]),/not authenticated/);
  // Financial history blocks deletion, while unconfigured venues still cascade.
  await assert.rejects(()=>db.query('delete from venues where id=$1',[venue]),/foreign key/);
  assert.equal((await one('select count(*)::int n from private.launch_payments where reservation_id=$1',[booking])).n,1);
  assert.ok((await one('select count(*)::int n from venue_scan_events where venue_id=$1',[otherVenue])).n>0);
  await db.query('delete from venues where id=$1',[otherVenue]);
  assert.equal((await one('select count(*)::int n from venue_scan_events where venue_id=$1',[otherVenue])).n,0);
  console.log('Night reports: funnel, distributions, fixed gender, messages/replies, presence, access, cleanup and repeat finalization passed.');
} catch(error) { console.error(error.message,error.where??'',error.position??''); process.exitCode=1; }
finally { await db.close(); }
