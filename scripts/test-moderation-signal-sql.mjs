import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
try {
  // Minimal Realtime transport stand-in; execute actual triggers and RLS locally.
  // Hosted E2E separately proves channel authorization and WebSocket delivery.
  await db.exec(`
    create role anon; create role authenticated;
    create schema private; create schema realtime;
    grant usage on schema private, realtime to authenticated;
    create function private.is_admin() returns boolean language sql as
      $$ select current_setting('test.founder', true) = 'yes' $$;
    create function realtime.topic() returns text language sql as
      $$ select current_setting('realtime.topic', true) $$;
    create table realtime.messages(topic text, extension text, payload jsonb, event text, private boolean);
    alter table realtime.messages enable row level security;
    create function realtime.send(payload jsonb, event text, topic text, private boolean)
    returns void language sql as $$ insert into realtime.messages values(topic, 'broadcast', payload || jsonb_build_object('id', gen_random_uuid()), event, private) $$;
    create schema cron;
    create table cron.job(jobname text, schedule text, command text);
    create table cron.job_run_details(runid int, start_time timestamptz, end_time timestamptz);
    create function cron.schedule(jobname text, schedule text, command text) returns bigint language sql as
      $$ insert into cron.job values(jobname, schedule, command) returning 1 $$;
    create table public.profiles(id int primary key);
    create table public.reports(id int, note text, reporter_id int references public.profiles(id) on delete cascade);
    create table public.moderation_cases(id int, status text, reported_id int references public.profiles(id) on delete cascade);
  `);
  for (const migration of ['20260920000001_live_moderation_queue.sql', '20261021000002_reduce_disk_io.sql']) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'));
  }
  await db.exec(`insert into reports values (1,'private note'),(2,'another note');
    update reports set note='changed'; delete from reports where id=1;
    insert into moderation_cases values(1,'pending_review');
    update moderation_cases set status='removed_for_night';
    update moderation_cases set status='pending_review';
    delete from moderation_cases;`);
  const messages = (await db.query('select * from realtime.messages')).rows;
  assert.equal(messages.length, 7, 'one invalidation per statement, including review/removal/restoration/deletion');
  const count = async () => (await db.query('select count(*)::int n from realtime.messages')).rows[0].n;
  // #330: zero-row statements, including FK cascades from deleted fixtures, stay silent.
  await db.exec(`update reports set note='none' where id=99; delete from reports where id=99;
    update moderation_cases set status='none' where id=99; delete from moderation_cases where id=99;
    insert into reports select id, note, null from reports where false;
    insert into profiles values(1),(2); delete from profiles where id=1;`);
  assert.equal(await count(), 7, 'no invalidation for statements or cascades that change no row');
  await db.exec(`insert into reports values(4,'cascaded',2); delete from profiles where id=2;`);
  assert.equal(await count(), 9, 'a cascade that removes a report still invalidates once');
  for (const message of messages) {
    assert.match(message.payload.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.deepEqual(message, {
      topic: 'founder-moderation', extension: 'broadcast', payload: { version: 1, id: message.payload.id }, event: 'queue_changed', private: true,
    });
  }
  await db.exec(`set role authenticated; set "realtime.topic"='founder-moderation'; set "test.founder"='no';`);
  assert.equal((await db.query('select * from realtime.messages')).rows.length, 0);
  await assert.rejects(db.exec('select private.notify_moderation_queue()'), /permission denied/);
  await db.exec(`set "test.founder"='yes'`);
  assert.equal((await db.query('select * from realtime.messages')).rows.length, 9);
  await db.exec(`set "realtime.topic"='other'`);
  assert.equal((await db.query('select * from realtime.messages')).rows.length, 0);
  // Future broad policies cannot open this reserved topic to participants or senders.
  await db.exec(`reset role; grant insert on realtime.messages to authenticated;
    create policy other_receive on realtime.messages for select to authenticated using(true);
    create policy other_send on realtime.messages for insert to authenticated with check(true);
    set role authenticated; set "test.founder"='no';`);
  assert.equal((await db.query('select * from realtime.messages')).rows.length, 0);
  for (const founder of ['no', 'yes']) {
    await db.exec(`set "test.founder"='${founder}'`);
    await assert.rejects(db.exec(`insert into realtime.messages values('founder-moderation','broadcast','{"version":1}','queue_changed',true)`), /row-level security/);
  }
  await db.exec(`reset role; set role anon;`);
  await assert.rejects(db.exec('select * from realtime.messages'), /permission denied/);
  await db.exec(`reset role;
    create or replace function realtime.send(payload jsonb, event text, topic text, private boolean)
    returns void language plpgsql as $$ begin raise exception 'transport unavailable'; end; $$;
    insert into reports values(3,'must survive notification failure',null);`);
  assert.equal((await db.query('select id from reports where id=3')).rows.length, 1);
  await db.exec(`delete from realtime.messages;
    insert into cron.job_run_details values
      (1, now() - interval '8 days', now() - interval '8 days'),
      (2, now() - interval '8 days', null),
      (3, now() - interval '6 days', now() - interval '6 days');`);
  const [retention] = (await db.query(`select schedule, command from cron.job where jobname='amourette-cron-history-retention'`)).rows;
  assert.equal(retention.schedule, '41 3 * * *');
  await db.exec(retention.command);
  assert.deepEqual((await db.query('select runid from cron.job_run_details')).rows, [{ runid: 3 }], 'cron history keeps about a week, including never-finished runs');
  console.log('moderation SQL: changed-row-only invalidations, bounded cron history, private content-free triggers, founder-only reads and denied client sends passed');
} finally {
  await db.close();
}
