import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
try {
await db.exec(readFileSync('tests/validation/schema.sql','utf8'));
for(const name of ['20260909000002_reject_invalid_moderation_commands','20260909000003_input_validation_contract','20260909000004_validate_rpc_inputs','20260909000005_validate_unsubscribe_tokens','20260909000006_bound_dormant_inputs','20260909000007_validate_analytics_rpc','20260909000008_bound_photo_storage','20260909000009_validate_email_event_inputs']) await db.exec(readFileSync(`supabase/migrations/${name}.sql`,'utf8'));
const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
const uuid='00000000-0000-0000-0000-000000000001';
const other='00000000-0000-0000-0000-000000000002';
const admin='00000000-0000-0000-0000-000000000003';
const ws='\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';
assert.equal((await one('select private.trim_input($1) value',[ws+'é 中 😀'+ws])).value,'é 中 😀');
for(const max of [30,120,500,2000]) {
 for(const size of [1,max-1,max,max+1]) for(const char of ['a','é','中','😀']) assert.equal((await one('select private.valid_input_text($1,$2,true) valid',[ws+char.repeat(size)+ws,max])).valid,size<=max);
 assert.equal((await one('select private.valid_input_text($1,$2,true) valid',[ws,max])).valid,false);
}
const emails=['a+tag@example.com',"o'neil@foo-bar.example",'a'.repeat(64)+'@example.com','a..b@example.com','abc@gmailabc','a@x.123','a@-x.com','élise@example.com','Kate@example.com','a'.repeat(65)+'@x.com'];
for(const [i,email] of emails.entries()) assert.equal((await one('select private.valid_marketing_email($1) valid',[email])).valid,i<3,email);
// Participant writes execute real CHECKs/triggers. RLS authorization has separate E2E coverage.
await db.query("insert into profiles(id,first_name) values($1,'Initial')",[uuid]);
await db.exec('set role authenticated');
await assert.rejects(()=>db.exec("insert into profiles(first_name) values('Forbidden')"),/permission denied/);
await assert.rejects(()=>db.query("update profiles set photo_url='forged' where id=$1",[uuid]),/permission denied/);
const profile=await one('update profiles set first_name=$1,bio=$2,interested_in=$3 where id=$4 returning *',[ws+'😀'.repeat(30)+ws,ws,['woman','man'],uuid]);
assert.equal(profile.first_name,'😀'.repeat(30)); assert.equal(profile.bio,null);
for(const name of [ws,'x'.repeat(31),' '.repeat(16384)+'a']) await assert.rejects(()=>db.query('update profiles set first_name=$1 where id=$2',[name,uuid]),/invalid profile input/);
for(const interests of [[],['woman','woman'],['woman',null],['unknown']]) await assert.rejects(()=>db.query('update profiles set interested_in=$1 where id=$2',[interests,uuid]));
await assert.rejects(()=>db.query("update profiles set interested_in=array[['woman','man']] where id=$1",[uuid]));
for(const body of [ws,'😀'.repeat(2001),' '.repeat(16384)+'a']) await assert.rejects(()=>db.query('insert into messages(body) values($1)',[body]),/invalid message body/);
assert.equal((await one('insert into messages(body) values($1) returning body',[ws+'😀'.repeat(2000)+ws])).body,'😀'.repeat(2000));
assert.equal((await one("insert into blocks(reason,note) values('other',$1) returning note",[ws])).note,null);
await assert.rejects(()=>db.query("insert into reports(reason,note) values('other',$1)",[ws]),/reports_other_note_required/);
await assert.rejects(()=>db.query("insert into blocks(reason,note) values('other',$1)",['😀'.repeat(501)]),/invalid safety note/);
assert.equal((await one("insert into reports(reason,note) values('other',$1) returning note",['😀'.repeat(500)])).note,'😀'.repeat(500));
await assert.rejects(()=>db.exec("insert into email_subscriptions(user_id,email,locale,source,consent_version) values(gen_random_uuid(),'a@x.com','en','landing','2026-07-24')"),/permission denied/);
await assert.rejects(()=>db.exec("select subscribe_to_marketing_email(null,'a@x.com','en','landing','2026-07-24')"),/permission denied/);
await assert.rejects(()=>db.exec("insert into profile_private(id,phone) values(gen_random_uuid(),'unowned')"),/permission denied/);
await db.exec("insert into profile_private(id,adult_confirmed_at) values(gen_random_uuid(),now())");
await db.query("insert into profile_private(id,adult_confirmed_at) values($1,now()) on conflict(id) do update set id=excluded.id,adult_confirmed_at=excluded.adult_confirmed_at",[uuid]);
await db.query("insert into profile_private(id,adult_confirmed_at) values($1,now()) on conflict(id) do update set id=excluded.id,adult_confirmed_at=excluded.adult_confirmed_at",[uuid]);
await assert.rejects(()=>db.exec('truncate analytics_events'),/permission denied/);
for(const properties of ['[]','null','{"visibleCount":-1}','{"visibleCount":"1"}','{"visibleCount":2147483648}','{"unexpected":1}']) await assert.rejects(()=>db.query("insert into analytics_events(event_name,properties) values('discovery_opened',$1)",[properties]),/analytics_properties_contract/);
await db.query("insert into analytics_events(event_name,properties) values('discovery_opened',$1)",['{"visibleCount":1}']);
await db.exec('reset role');
const venue=(await one("insert into venues(name,slug,city,timezone) values('Test','test','Paris','Europe/Paris') returning id")).id;
const night=(await one("insert into venue_nights(venue_id,waiting_opens_at,guaranteed_launch_at,closes_at,launch_threshold) values($1,now(),now()+interval '1 hour',now()+interval '4 hours',1) returning id",[venue])).id;
await db.query('insert into admins values($1)',[admin]);
await db.query('insert into presence values($1,$2,null)',[other,night]);
const caseId=(await one('insert into moderation_cases(reported_id,venue_night_id) values($1,$2) returning id',[other,night])).id;
const snapshot=async()=> (await db.query("select jsonb_build_object('cases',(select jsonb_agg(to_jsonb(c)) from moderation_cases c),'ejections',(select jsonb_agg(to_jsonb(e)) from venue_ejections e),'presence',(select jsonb_agg(to_jsonb(p)) from presence p),'reports',(select jsonb_agg(to_jsonb(r)) from reports r)) state")).rows[0].state;
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
const before=await snapshot();
for(const action of [null,'','suspend','REMOVE_FOR_NIGHT']) {
 await db.exec('set role authenticated');
 await assert.rejects(()=>db.query('select moderate_case($1,$2)',[caseId,action]),/invalid moderation action/);
 await db.exec('reset role'); assert.deepEqual(await snapshot(),before);
}
await assert.rejects(()=>db.query("select moderate_case(null,'remove_for_night')"),/moderation case is required/);
assert.deepEqual(await snapshot(),before);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uuid]);
await assert.rejects(()=>db.query("select moderate_case($1,'remove_for_night')",[caseId]),/not authorized/);
assert.deepEqual(await snapshot(),before);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
await db.query("select moderate_case($1,'review')",[caseId]);
assert.equal((await one('select status from moderation_cases where id=$1',[caseId])).status,'reviewed');
assert.equal((await one('select count(*)::integer n from venue_ejections')).n,0);
for(const note of [ws,'x'.repeat(501),' '.repeat(16384)+'x']) {
 const before=await snapshot();
 await assert.rejects(()=>db.query("select submit_report($1,$2,'other',$3)",[other,night,note]),/note/);
 assert.deepEqual(await snapshot(),before);
}
for(const [city,zone] of [[null,'Europe/Paris'],['Paris',null],['Paris','America/New_York']]) await assert.rejects(()=>db.query("select save_venue_details(null,'Test','another',$1,$2)",[city,zone]),/rollout location/);
for(const fn of ['set_venue_live','set_venue_profile_preview']) await assert.rejects(()=>db.query(`select ${fn}($1,null)`,[venue]),/required/);
for(const token of [null,'','x'.repeat(44),'A'.repeat(42)+'B']) {
 assert.equal((await one('select validate_email_unsubscribe_token($1) valid',[token])).valid,false);
 assert.equal((await one('select unsubscribe_email_by_token($1) result',[token])).result,'invalid_token');
}

const beforeLegacy=await snapshot();
for(const [target,reason,note] of [[null,'other',null],[other,null,null],[other,'other','x'.repeat(501)]]) await assert.rejects(()=>db.query('select eject_from_venue($1,$2,$3,$4)',[target,venue,reason,note]),/required|invalid/);
assert.deepEqual(await snapshot(),beforeLegacy);
for(const name of ['a'.repeat(121),' '.repeat(16384)+'x']) await assert.rejects(()=>db.query("insert into venues(name,slug,city,timezone) values($1,gen_random_uuid()::text,'Paris','Europe/Paris')",[name]),/invalid venue name/);
await assert.rejects(()=>db.query("insert into venues(name,slug,city,timezone) values('Name',$1,'Paris','Europe/Paris')",['a'.repeat(81)]),/venues_slug_contract/);
const longVenue=await one("insert into venues(name,slug,city,timezone) values($1,$2,'Paris','Europe/Paris') returning name",['😀'.repeat(120),'a'.repeat(80)]);
assert.equal(longVenue.name,'😀'.repeat(120));
for(const threshold of [0,-1,1.5,2147483648,null]) await assert.rejects(()=>db.query("insert into venue_nights(venue_id,waiting_opens_at,guaranteed_launch_at,closes_at,launch_threshold) values($1,now(),now()+interval '1 hour',now()+interval '4 hours',$2)",[venue,threshold]));
await assert.rejects(()=>db.query("insert into venue_nights(venue_id,waiting_opens_at,guaranteed_launch_at,closes_at,launch_threshold) values($1,now(),now()+interval '1 hour','infinity',1)",[venue]),/venue_nights_finite_schedule/);
// Valid commands still work, including a full removal and restoration cycle.
await db.query("select moderate_case($1,'remove_for_night')",[caseId]);
assert.equal((await one('select count(*)::integer n from venue_ejections')).n,1);
assert.ok((await one('select left_at from presence where profile_id=$1',[other])).left_at);
await db.query("select moderate_case($1,'restore')",[caseId]);
assert.equal((await one('select count(*)::integer n from venue_ejections')).n,0);
assert.equal((await one('select status from moderation_cases where id=$1',[caseId])).status,'pending_review');
// The bucket stays private; #77 only adds the approved byte/MIME ceilings.
const bucket=await one("select * from storage.buckets where id='profile-photos'");
assert.equal(bucket.public,false); assert.equal(Number(bucket.file_size_limit),5242880);
assert.deepEqual(bucket.allowed_mime_types,['image/jpeg','image/png','image/webp']);
// Invalid service calls fail before idempotency/outbox/event-log writes.
const emailSnapshot=async()=> (await one("select jsonb_build_object('subscriptions',(select jsonb_agg(to_jsonb(s)) from email_subscriptions s),'deliveries',(select jsonb_agg(to_jsonb(d)) from email_deliveries d),'events',(select jsonb_agg(to_jsonb(e)) from private.email_webhook_events e)) state")).state;
const emailBefore=await emailSnapshot();
for(const email of [null,'a@domain','x'.repeat(65)+'@example.com',' '.repeat(16384)+'a@x.com']) await assert.rejects(()=>db.query("select subscribe_to_marketing_email($1,$2,'en','landing','2026-07-24')",[uuid,email]),/Invalid email/);
for(const [locale,source,version] of [[null,'landing','2026-07-24'],['en',null,'2026-07-24'],['en','landing','unapproved']]) await assert.rejects(()=>db.query("select subscribe_to_marketing_email($1,'a@example.com',$2,$3,$4)",[uuid,locale,source,version]),/Invalid subscription input/);
for(const [id,type,time,provider] of [[null,'email.sent','2026-09-11T12:00:00Z','id'],['id',null,'2026-09-11T12:00:00Z','id'],['id','email.sent','infinity','id'],['id','email.sent',null,'id'],['id','email.sent','2026-09-11T12:00:00Z','x'.repeat(201)]]) await assert.rejects(()=>db.query('select record_resend_email_event($1,$2,$3,$4)',[id,type,time,provider]),/invalid email event/);
assert.deepEqual(await emailSnapshot(),emailBefore);
// Unknown provider events remain accepted and idempotent.
assert.equal((await one("select record_resend_email_event('evt','email.future','2026-09-11T12:00:00Z','provider') accepted")).accepted,true);
assert.equal((await one("select record_resend_email_event('evt','email.future','2026-09-11T12:00:00Z','provider') accepted")).accepted,false);
const result=(await one("select subscribe_to_marketing_email($1,$2,'en','landing','2026-07-24') result",[uuid,ws+'A+alias@EXAMPLE.COM'+ws])).result;
assert.equal(result.email,'a+alias@example.com');
assert.equal((await one("select subscribe_to_marketing_email($1,'a+alias@example.com','en','landing','2026-07-24') result",[uuid])).result.already_subscribed,true);
assert.equal((await one('select count(*)::integer n from email_deliveries')).n,1);
// An overlarge or wrongly typed analytics object is refused by the RPC before INSERT.
for(const properties of [{visibleCount:'1'},[],{unexpected:1}]) await assert.rejects(()=>db.query("select track_analytics_event('discovery_opened','session-id',p_properties:=$1)",[JSON.stringify(properties)]),/invalid analytics input/);
await assert.rejects(()=>db.query("select track_analytics_event('landing_viewed','session-id',p_source:=$1)",[' '.repeat(16384)+'x']),/invalid analytics input/);
console.log('Isolated PostgreSQL constraints, authenticated rejection, moderation no-side-effects and RPC guards passed.');
} catch (error) { console.error(error.message, error.position ?? "", error.where ?? ""); process.exitCode=1; } finally { await db.close(); }

// Historical incompatibility aborts the entire constraint migration. In particular,
// a half-validated CHECK must not strand a profile on unrelated safety updates.
if (!process.exitCode) {
  const historical = new PGlite();
  try {
    await historical.exec(readFileSync('tests/validation/schema.sql','utf8'));
    await historical.query('insert into profiles(first_name) values($1)',['a'.repeat(31)]);
    await assert.rejects(()=>historical.transaction((tx)=>tx.exec(readFileSync('supabase/migrations/20260909000003_input_validation_contract.sql','utf8'))),/profiles_first_name_check/);
    assert.equal((await historical.query('select first_name from profiles')).rows[0].first_name,'a'.repeat(31));
    assert.equal((await historical.query("select to_regprocedure('private.trim_input(text)') helper")).rows[0].helper,null);
    console.log('Historical-data refusal rolls back without modifying existing content or constraints.');
  } finally { await historical.close(); }
}
