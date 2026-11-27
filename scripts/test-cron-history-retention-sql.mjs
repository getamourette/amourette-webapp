import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { moddatetime } from '@electric-sql/pglite/contrib/moddatetime';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';

// #335: cron.job_run_details stays bounded (free-tier Disk IO), including runs
// that never started (no start_time, no end_time). Replays every migration so
// the job checked is the one the last migration scheduled.
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const db = new PGlite({ extensions: { btree_gist, moddatetime, pgcrypto, uuid_ossp } });
try {
  await db.exec(read('tests/helpers/supabase-platform.sql'));
  const files = readdirSync(new URL('../supabase/migrations', import.meta.url)).filter(file => file.endsWith('.sql')).sort();
  for (const file of files) {
    await db.exec(read(`supabase/migrations/${file}`).replace(/create extension if not exists (pg_cron|pg_net)[^;]*;/gi, ''));
  }

  const [job] = (await db.query(`select schedule, command from cron.job where jobname = 'amourette-cron-history-retention'`)).rows;
  assert.equal(job.schedule, '41 3 * * *');

  // With no run older than a week, nothing proves a never-started run is old.
  await db.exec(`insert into cron.job_run_details(runid, status, start_time, end_time) values
    (1, 'connecting', null, null),
    (2, 'succeeded', now() - interval '6 days', now() - interval '6 days')`);
  await db.exec(job.command);
  assert.deepEqual((await db.query('select runid from cron.job_run_details order by runid')).rows.map(row => row.runid), [1, 2],
    'a never-started run of unknown age is kept');

  // runid order is insertion order.
  await db.exec(`truncate cron.job_run_details;
    insert into cron.job_run_details(runid, status, start_time, end_time) values
    (1, 'connecting', null, null),
    (2, 'succeeded', now() - interval '8 days', now() - interval '8 days'),
    (3, 'running', now() - interval '8 days', null),
    (4, 'succeeded', now() - interval '6 days', now() - interval '6 days'),
    (5, 'running', now() - interval '1 minute', null),
    (6, 'starting', null, null)`);
  await db.exec(job.command);
  const kept = (await db.query('select runid from cron.job_run_details order by runid')).rows.map(row => row.runid);
  assert.ok(!kept.includes(1), 'an old run that never started is purged');
  assert.deepEqual(kept, [4, 5, 6], 'old runs go; a recent run, a run in progress and a run not started yet stay');
  console.log('cron history retention: old never-started runs purged, recent, running and starting runs kept');
} finally {
  await db.close();
}
