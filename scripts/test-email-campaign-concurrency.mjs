import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout } from 'node:timers/promises';
import pg from 'pg';
import { installCampaignSchema } from './campaign-test-database.mjs';

// The existing hosted logic gate already provisions PostgreSQL 17.
if (process.argv.includes('--ci-only') && process.env.GITHUB_ACTIONS !== 'true') {
  console.log('Multi-session campaign checks deferred to hosted PostgreSQL; run test:email-campaign-concurrency explicitly for local PostgreSQL.');
  process.exit(0);
}
// Never connect to the shared Supabase database. Each run owns a new local database.
const url = new URL(process.env.CAMPAIGN_TEST_DATABASE_URL ?? `postgres://postgres:test@127.0.0.1:${process.env.GITHUB_ACTIONS === 'true' ? 5432 : 55431}/postgres`);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Only disposable loopback PostgreSQL is allowed');
const admin = new pg.Client({ connectionString: url.href });
const database = `campaign_test_${randomUUID().replaceAll('-', '')}`;
const clients = [];
let created = false;
const rpc = async (client, name, args) => (await client.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) result`, args)).rows[0].result;
try {
  await admin.connect();
  assert.equal(Math.floor(Number((await admin.query('show server_version_num')).rows[0].server_version_num) / 10000), 17);
  await admin.query(`create database ${database}`); created = true;
  url.pathname = `/${database}`;
  for (let i = 0; i < 3; i++) {
    const client = new pg.Client({ connectionString: url.href });
    clients.push(client); await client.connect();
    await client.query("set statement_timeout='10s'");
  }
  const [observer, one, two] = clients;
  await installCampaignSchema(observer);
  const blocked = async client => {
    const deadline = performance.now() + 8000;
    while (!(await observer.query('select cardinality(pg_blocking_pids($1)) > 0 blocked', [client.processID])).rows[0].blocked) {
      assert.ok(performance.now() < deadline, 'Expected the second transaction to wait on a database lock');
      await setTimeout(10);
    }
  };
  const founder = randomUUID(), subscriber = randomUUID(), venue = randomUUID(), night = randomUUID();
  await observer.query('insert into auth.users select unnest($1::uuid[])', [[founder, subscriber]]);
  await observer.query('insert into admins values($1)', [founder]);
  await observer.query("insert into venues values($1,'Concurrency Bar','Paris','Europe/Paris',false)", [venue]);
  await observer.query("insert into venue_nights values($1,$2,'closed',null,now()+interval '20 days',now()+interval '20 days 1 hour',now()+interval '20 days 5 hours')", [night, venue]);
  await observer.query("insert into email_subscriptions(user_id,email,locale,source,consent_version) values($1,'concurrency@example.invalid','en','landing','2026-07-24')", [subscriber]);
  const context = () => rpc(observer, 'admin_email_campaign_context', [founder, [night]]);
  const message = { subject: 'Test', html: '<a href="https://getamourette.com/unsubscribe?token=CAMPAIGN_PREVIEW">Preferences</a>', text: 'https://getamourette.com/unsubscribe?token=CAMPAIGN_PREVIEW' };
  const prepare = async () => {
    const ctx = await context();
    return rpc(observer, 'admin_prepare_email_campaign', [founder, [night], JSON.stringify(ctx.nights), JSON.stringify({ en: message, fr: message, es: message })]);
  };
  const confirm = (client, draft) => rpc(client, 'admin_confirm_email_campaign', [founder, draft.campaign.id, JSON.stringify(draft.audience)]);
  const count = async () => Number((await observer.query('select count(*) n from email_deliveries')).rows[0].n);
  const draft = await prepare(), competing = await prepare();

  // Hold the first confirmation before commit; prove a replay actually waits.
  await one.query('begin'); const first = await confirm(one, draft);
  const replay = confirm(two, draft); await blocked(two); await one.query('commit');
  assert.equal((await replay).id, first.id);
  assert.equal(await count(), 1, 'A concurrent replay creates only one delivery');

  // Roll back the isolated fixture's receipt/outbox, then race distinct drafts.
  await observer.query('delete from email_deliveries');
  await observer.query('update email_campaigns set confirmed_at=null where id=$1', [draft.campaign.id]);
  await one.query('begin'); await confirm(one, draft);
  const competitor = confirm(two, competing).then(value => ({ value }), error => ({ error }));
  await blocked(two); await one.query('commit');
  assert.match((await competitor).error?.message ?? '', /audience_changed/);
  assert.equal(await count(), 1, 'Competing campaigns cannot reserve the same address');
  assert.equal((await observer.query('select confirmed_at from email_campaigns where id=$1', [competing.campaign.id])).rows[0].confirmed_at, null);

  // Consent committed while confirmation waits must invalidate its reviewed audience.
  await observer.query('delete from email_deliveries');
  const consentDraft = await prepare();
  await one.query('begin');
  await one.query("update email_subscriptions set status='unsubscribed',unsubscribed_at=now() where user_id=$1", [subscriber]);
  const consentRace = confirm(two, consentDraft).then(value => ({ value }), error => ({ error }));
  await blocked(two); await one.query('commit');
  assert.match((await consentRace).error?.message ?? '', /audience_changed/);
  assert.equal(await count(), 0, 'Concurrent revocation queues nothing');
  console.log('Campaign PostgreSQL 17 concurrency: replay, competing campaigns and consent revocation passed; no network transport.');
} finally {
  await Promise.allSettled(clients.map(async client => { await client.query('rollback'); await client.end(); }));
  if (created) await admin.query(`drop database ${database} with (force)`);
  await admin.end();
}
