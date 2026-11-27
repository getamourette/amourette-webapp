// #559: the next-day survey email, on every real migration replayed into an
// isolated database. Off by default per night; only guests who arrived; one
// email and one answer per reservation; answers never tied to a person; the
// next-night opt-in feeds the existing subscription list. No provider send.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { moddatetime } from '@electric-sql/pglite/contrib/moddatetime';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';
import { asRole, attempt, pay, cancel } from './launch-test-database.mjs';
import { sealCredential } from '../lib/server/launch-secrets.ts';
import { parseLaunchMailContext } from '../lib/launch-mail.ts';
process.env.LAUNCH_SECRET_KEY = randomBytes(32).toString('hex');

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const pg = new PGlite({ extensions: { btree_gist, moddatetime, pgcrypto, uuid_ossp } });
await pg.exec(read('tests/helpers/supabase-platform.sql'));
for (const file of readdirSync(new URL('../supabase/migrations', import.meta.url)).filter(f => f.endsWith('.sql')).sort())
  await pg.exec(read(`supabase/migrations/${file}`).replace(/create extension if not exists (pg_cron|pg_net)[^;]*;/gi, ''));
const db = { query: (sql, args) => args ? pg.query(sql, args) : pg.exec(sql).then(r => r.at(-1)) };
const scalar = async (sql, args = []) => Object.values((await db.query(sql, args)).rows[0])[0];
const service = (sql, args = []) => asRole(db, 'service_role', sql, args);
const founder = randomUUID(), guestUser = randomUUID(), stranger = randomUUID();
for (const id of [founder, guestUser, stranger]) await db.query('insert into auth.users(id) values($1)', [id]);
await db.query('insert into public.admins(user_id) values($1)', [founder]);
const admin = (sql, args = []) => asRole(db, 'authenticated', sql, args, founder);
const origin = 'https://survey.example.com';
const rpc = async (name, args) => {
  const entries = Object.entries(args);
  return (await service(`select public.${name}(${entries.map(([k], i) => `${k}=>$${i + 1}`).join(',')}) result`, entries.map(([, v]) => v)))[0].result;
};
const check = async (name, fn) => { await fn(); console.log('PASS ' + name); };
const plus = (time, minutes) => new Date(new Date(time).getTime() + minutes * 60000).toISOString();
const queue = now => db.query('select private.queue_launch_surveys($1::timestamptz)', [now]);
const surveys = a => db.query("select state from private.launch_access_mail where reservation_id=$1 and kind='next_day_survey'", [a.id]).then(r => r.rows.map(x => x.state));
const sendAt = night => scalar('select private.launch_survey_at(n.waiting_opens_at,v.timezone) from venue_nights n join venues v on v.id=n.venue_id where n.id=$1', [night]);
const enable = (night, on = true) => admin('select admin_set_launch_survey($1,$2) result', [night, on]);

// A night that started `hoursAgo` hours ago and lasted four hours, bookable for the test.
async function night({ hoursAgo = 20, timezone = 'Europe/Paris' } = {}) {
  const venue = randomUUID(), id = randomUUID();
  await db.query("insert into venues(id,slug,name,city,timezone) values($1,$2,'Le Comptoir','Paris',$3)", [venue, 'v' + venue.slice(0, 8), timezone]);
  await db.query(`insert into venue_nights(id,venue_id,waiting_opens_at,guaranteed_launch_at,closes_at,status)
    values($1,$2,clock_timestamp()+interval '4 days',clock_timestamp()+interval '4 days 1 hour',clock_timestamp()+interval '4 days 4 hours','closed')`, [id, venue]);
  await db.query("insert into private.launch_events(night_id,registration_opens_at,capacity,deposit_minor,currency,policy_version) values($1,clock_timestamp()-interval '1 hour',20,1000,'eur','launch-v1')", [id]);
  return { id, hoursAgo };
}
// A paid reservation; the night is then moved into the past, as if it had happened.
async function booking(n, locale = 'fr') {
  const a = attempt(n.id); const c = { id: a.id, management: a.management, arrival: a.arrival, issued: Date.now() };
  await rpc('prepare_launch_checkout', { p_id: a.id, p_night: n.id, p_email: a.email, p_name: a.name, p_locale: locale, p_policy: a.policy, p_late_ack: a.late,
    p_management_secret: a.management, p_arrival_secret: a.arrival, p_envelope: sealCredential(c, 'delivery'), p_account: 'acct_survey', p_origin: origin });
  await pay(db, a);
  await db.query("delete from private.launch_access_mail where reservation_id=$1", [a.id]);
  return a;
}
const arrive = (a, outcome = 'verified') => db.query(
  `insert into private.launch_arrivals(reservation_id,outcome,verified_at,method) values($1,$2,case when $2='verified' then clock_timestamp() end,case when $2='verified' then 'qr' end)`, [a.id, outcome]);
// The booking-schedule guard forbids moving a night once registration opened; the
// fixture bypasses triggers to make the night one that already took place.
const happened = async n => { await db.query("set session_replication_role = replica"); try { await happenedUpdate(n); } finally { await db.query("set session_replication_role = origin"); } };
const happenedUpdate = n => db.query(`update venue_nights set waiting_opens_at=clock_timestamp()-make_interval(hours=>$2),
  guaranteed_launch_at=clock_timestamp()-make_interval(hours=>$2)+interval '1 hour',closes_at=clock_timestamp()-make_interval(hours=>$2)+interval '4 hours',
  status='closed' where id=$1`, [n.id, n.hoursAgo]);

await check('the survey goes out at 11:00 venue time the day after the night starts, summer time included', async () => {
  const at = s => scalar("select private.launch_survey_at($1::timestamptz,'Europe/Paris')", [s]).then(v => new Date(v).toISOString());
  assert.equal(await at('2026-12-10T20:00:00+01:00'), '2026-12-11T10:00:00.000Z');
  assert.equal(await at('2026-12-10T23:30:00+01:00'), '2026-12-11T10:00:00.000Z');
  assert.equal(await at('2027-06-10T20:00:00+02:00'), '2027-06-11T09:00:00.000Z');
});

await check('off by default: nothing is queued until a founder turns it on, then once however often the job runs', async () => {
  const n = await night(), a = await booking(n); await arrive(a); await happened(n);
  const at = await sendAt(n.id);
  await queue(plus(at, 1)); assert.deepEqual(await surveys(a), [], 'no founder setting, no email');
  assert.equal((await admin('select admin_launch_survey($1) result', [n.id]))[0].result.enabled, false);
  await enable(n.id);
  await queue(plus(at, -1)); assert.deepEqual(await surveys(a), [], 'nothing before 11:00');
  await queue(plus(at, 1)); await queue(plus(at, 1)); await queue(plus(at, 90));
  assert.deepEqual(await surveys(a), ['queued']);
  // The receipt outlives the 30-day mail retention: never a second survey.
  await db.query("delete from private.launch_access_mail where reservation_id=$1", [a.id]);
  await queue(plus(at, 120)); assert.deepEqual(await surveys(a), []);
});

await check('only guests who arrived: never absent, no-show, removed, cancelled or cancelled-night guests', async () => {
  const n = await night();
  const arrived = await booking(n); await arrive(arrived);
  const absent = await booking(n);
  const noShow = await booking(n); await arrive(noShow, 'no_show');
  const removed = await booking(n); await arrive(removed);
  await db.query('update private.launch_credentials set arrival_revoked_at=clock_timestamp() where reservation_id=$1', [removed.id]);
  const cancelled = await booking(n); await cancel(db, cancelled);
  await happened(n); await enable(n.id);
  const sendTime = plus(await sendAt(n.id), 5);
  await queue(sendTime);
  for (const [label, a] of [['absent', absent], ['no-show', noShow], ['removed', removed], ['cancelled', cancelled]])
    assert.deepEqual(await surveys(a), [], `no survey for a ${label} guest`);
  assert.deepEqual(await surveys(arrived), ['queued']);
  const off = await night(), guest = await booking(off); await arrive(guest); await happened(off); await enable(off.id);
  await db.query("set session_replication_role = replica");
  await db.query("update private.launch_events set cancelled_at=clock_timestamp(),cancellation_reason='cancelled' where night_id=$1", [off.id]);
  await db.query("set session_replication_role = origin");
  await queue(plus(await sendAt(off.id), 5)); assert.deepEqual(await surveys(guest), [], 'no survey for a cancelled night');
});

await check('never early, never late: not before the night ends, not more than three days after 11:00', async () => {
  const n = await night({ hoursAgo: 1 }), a = await booking(n); await arrive(a); await happened(n); await enable(n.id);
  // The night is still running (it closes three hours from now): nothing yet.
  await queue(new Date().toISOString()); assert.deepEqual(await surveys(a), []);
  const late = await night({ hoursAgo: 120 }), b = await booking(late); await arrive(b); await happened(late); await enable(late.id);
  await queue(plus(await sendAt(late.id), 3 * 24 * 60 + 1)); assert.deepEqual(await surveys(b), [], 'window closed');
});

// A night that started 30 hours ago: its survey time (11:00 the next day) has
// passed within the last three days, so the worker path runs at the real clock.
const n = await night({ hoursAgo: 30 }), guest = await booking(n, 'fr'); await arrive(guest); await happened(n); await enable(n.id);
await db.query("select private.queue_launch_surveys(private.launch_survey_at(n.waiting_opens_at,v.timezone)+interval '1 minute') from venue_nights n join venues v on v.id=n.venue_id where n.id=$1", [n.id]);
assert.deepEqual(await surveys(guest), ['queued']);

await check('turning the survey off before the worker claims it suppresses the queued email', async () => {
  const m = await night({ hoursAgo: 30 }), a = await booking(m); await arrive(a); await happened(m); await enable(m.id);
  await db.query("select private.queue_launch_surveys(private.launch_survey_at(n.waiting_opens_at,v.timezone)+interval '1 minute') from venue_nights n join venues v on v.id=n.venue_id where n.id=$1", [m.id]);
  await enable(m.id, false);
  assert.equal((await admin('select admin_launch_survey($1) result', [m.id]))[0].result.enabled, false);
  const job = await rpc('claim_launch_access_mail', { p_origin: origin, p_recipients: [a.email] });
  assert.equal(job, null); assert.deepEqual(await surveys(a), ['suppressed']);
});

let link = '', token = '';
await check('the worker binds a private survey link to a due survey email; the link reads back open', async () => {
  // Real clock: the night's survey time is within the last three days.
  const at = new Date(await sendAt(n.id)); assert.ok(at <= new Date() && new Date() < new Date(at.getTime() + 3 * 864e5), 'fixture survey is due now');
  const job = await rpc('claim_launch_access_mail', { p_origin: origin, p_recipients: [guest.email] });
  assert.equal(job.kind, 'next_day_survey');
  const context = parseLaunchMailContext(await rpc('read_launch_mail_context', { p_id: job.id, p_claim: job.claim }));
  assert.equal(context.kind, 'next_day_survey'); assert.equal(context.locale, 'fr');
  token = randomBytes(32).toString('hex'); link = job.id;
  const bound = await rpc('bind_launch_survey_mail', { p_id: job.id, p_claim: job.claim, p_token: token });
  assert.ok(Date.parse(bound.expires_at) > Date.now() + 13 * 864e5);
  await assert.rejects(rpc('bind_launch_survey_mail', { p_id: job.id, p_claim: randomUUID(), p_token: token }), /mail claim unavailable/);
  const page = await rpc('read_launch_survey', { p_link: link, p_token: token });
  assert.deepEqual([page.status, page.locale, page.venue_name], ['open', 'fr', 'Le Comptoir']);
  assert.equal((await rpc('read_launch_survey', { p_link: link, p_token: 'f'.repeat(64) })).status, 'invalid');
  assert.equal((await rpc('read_launch_survey', { p_link: randomUUID(), p_token: token })).status, 'invalid');
  await rpc('finish_launch_access_mail', { p_id: job.id, p_claim: job.claim, p_state: 'sent', p_provider: 'mail_survey' });
});

const submit = (over = {}) => rpc('submit_launch_survey', { p_link: link, p_token: token, p_matched: 'yes', p_talked: 'yes', p_at_ease: 'somewhat', p_heard: 'instagram', p_next_night: false, p_user: null, ...over });

await check('invalid answers are refused before any effect', async () => {
  for (const over of [{ p_matched: 'maybe' }, { p_at_ease: 'YES' }, { p_heard: 'tiktok' }, { p_next_night: null },
    { p_next_night: true, p_user: null }, { p_matched: null, p_talked: null, p_at_ease: null, p_heard: null }])
    await assert.rejects(submit(over), /invalid survey answer/, JSON.stringify(over));
  await assert.rejects(submit({ p_token: 'not-a-token' }), /invalid reservation credential/);
  assert.equal(await scalar('select count(*)::int from private.launch_survey_answers'), 0);
  assert.equal(await scalar('select answered_at is null from private.launch_survey_links where mail_id=$1', [link]), true);
  assert.equal((await submit({ p_token: 'e'.repeat(64) })).status, 'invalid', 'a wrong token records nothing');
});

await check('one answer per link, stored with the night only; the next-night box subscribes the reservation email', async () => {
  const result = await submit({ p_next_night: true, p_user: guestUser });
  assert.equal(result.status, 'recorded'); assert.ok(result.delivery_id, 'the existing welcome email is queued');
  assert.equal((await submit()).status, 'answered', 'a second answer is refused');
  assert.equal((await rpc('read_launch_survey', { p_link: link, p_token: token })).status, 'answered');
  assert.deepEqual((await db.query('select night_id,matched,talked,at_ease,heard_from from private.launch_survey_answers')).rows,
    [{ night_id: n.id, matched: 'yes', talked: 'yes', at_ease: 'somewhat', heard_from: 'instagram' }]);
  // No column could tie an answer to a reservation, an email or an account.
  assert.deepEqual((await db.query("select column_name from information_schema.columns where table_schema='private' and table_name='launch_survey_answers' order by 1")).rows.map(r => r.column_name),
    ['at_ease', 'heard_from', 'id', 'matched', 'night_id', 'submitted_at', 'talked']);
  const sub = (await db.query('select email,locale,source,consent_version,status from public.email_subscriptions where user_id=$1', [guestUser])).rows[0];
  assert.deepEqual(sub, { email: guest.email, locale: 'fr', source: 'next_day_survey', consent_version: 'next-day-survey-v1', status: 'subscribed' });
  // The existing unsubscribe path works on it.
  assert.equal(await asRole(db, 'authenticated', 'select unsubscribe_my_email_subscription() r', [], guestUser).then(r => r[0].r), 'unsubscribed');
});

await check('without the box ticked, nobody is subscribed; an expired link records nothing', async () => {
  const m = await night({ hoursAgo: 30 }), a = await booking(m, 'en'), b = await booking(m); await arrive(a); await arrive(b); await happened(m); await enable(m.id);
  await db.query("select private.queue_launch_surveys(private.launch_survey_at(n.waiting_opens_at,v.timezone)+interval '1 minute') from venue_nights n join venues v on v.id=n.venue_id where n.id=$1", [m.id]);
  const job = await rpc('claim_launch_access_mail', { p_origin: origin, p_recipients: [a.email] });
  const t = randomBytes(32).toString('hex'); await rpc('bind_launch_survey_mail', { p_id: job.id, p_claim: job.claim, p_token: t });
  const before = await scalar('select count(*)::int from public.email_subscriptions');
  assert.equal((await rpc('submit_launch_survey', { p_link: job.id, p_token: t, p_matched: 'no', p_talked: null, p_at_ease: 'yes', p_heard: null, p_next_night: false, p_user: stranger })).status, 'recorded');
  assert.equal(await scalar('select count(*)::int from public.email_subscriptions'), before, 'no opt-in, no subscription');
  await db.query("select private.queue_launch_surveys(private.launch_survey_at(n.waiting_opens_at,v.timezone)+interval '1 minute') from venue_nights n join venues v on v.id=n.venue_id where n.id=$1", [m.id]);
  const job2 = await rpc('claim_launch_access_mail', { p_origin: origin, p_recipients: [b.email] });
  const t2 = randomBytes(32).toString('hex'); await rpc('bind_launch_survey_mail', { p_id: job2.id, p_claim: job2.claim, p_token: t2 });
  await db.query("update private.launch_survey_links set expires_at=clock_timestamp()-interval '1 second' where mail_id=$1", [job2.id]);
  assert.equal((await rpc('read_launch_survey', { p_link: job2.id, p_token: t2 })).status, 'expired');
  assert.equal((await rpc('submit_launch_survey', { p_link: job2.id, p_token: t2, p_matched: 'yes', p_talked: null, p_at_ease: null, p_heard: null, p_next_night: false, p_user: null })).status, 'expired');
  const totals = (await admin('select admin_launch_survey($1) result', [m.id]))[0].result;
  assert.deepEqual([totals.answers, totals.matched_no, totals.at_ease_yes, totals.matched_yes, totals.queued], [1, 1, 1, 0, 2]);
});

await check('API roles: founders only for the setting and totals; the guest functions are server-only', async () => {
  await assert.rejects(asRole(db, 'authenticated', 'select admin_set_launch_survey($1,true)', [n.id], stranger), /not authorized/);
  await assert.rejects(asRole(db, 'authenticated', 'select admin_launch_survey($1)', [n.id], stranger), /not authorized/);
  for (const role of ['anon', 'authenticated']) for (const sql of [
    `select read_launch_survey('${link}','${token}')`, `select submit_launch_survey('${link}','${token}','yes',null,null,null,false,null)`,
    `select bind_launch_survey_mail('${link}','${randomUUID()}','${token}')`, 'select private.queue_launch_surveys()'])
    await assert.rejects(asRole(db, role, sql, [], role === 'anon' ? null : stranger), /permission denied/, `${role}: ${sql}`);
  for (const table of ['launch_survey_settings', 'launch_survey_links', 'launch_survey_answers'])
    await assert.rejects(service(`select * from private.${table}`), /permission denied/, `service_role cannot read ${table}`);
});
console.log('PASS next-day survey: off by default, arrived guests only, one email and one answer, anonymous answers, opt-in to the existing list');
