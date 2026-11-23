#!/usr/bin/env node

// Applies supabase/migrations to one database through the ledger (#434).
//
//   node scripts/apply-migrations.mjs status
//   node scripts/apply-migrations.mjs apply
//   node scripts/apply-migrations.mjs baseline --through <file.sql>
//
// MIGRATION_TARGET is local, development or production; MIGRATION_DATABASE_URL
// is the Postgres connection string of that database and must designate it.
// The repository is public: this prints file names and Postgres error
// messages, never the connection string, a host or a row.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { LedgerError, applyMigrations, baselineMigrations, migrationStatus, readMigrations, targetRefusal } from './migration-ledger.mjs';

const [command, ...args] = process.argv.slice(2);
const through = args[0] === '--through' ? args[1] : undefined;
const usage = !['status', 'apply', 'baseline'].includes(command) || (command === 'baseline' ? args.length !== 2 || !through : args.length > 0);
if (usage) fail('Usage: apply-migrations.mjs status | apply | baseline --through <file.sql>');

const env = process.env;
const target = env.MIGRATION_TARGET;
const connectionString = env.MIGRATION_DATABASE_URL;
if (!connectionString) fail('Set MIGRATION_DATABASE_URL.');
const refusal = targetRefusal(target, connectionString, env);
if (refusal) fail(refusal);

const files = readMigrations(env.MIGRATION_DIRECTORY ?? fileURLToPath(new URL('../supabase/migrations', import.meta.url)));
const run = {
  target,
  gitRef: env.GITHUB_REF_NAME ?? 'local',
  commitSha: env.GITHUB_SHA,
  runUrl: env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : undefined,
  log: line => process.stdout.write(`${target}: ${line}\n`),
};

// Hosted databases are reached over verified TLS only. MIGRATION_DATABASE_CA_FILE
// names the Supabase root certificate when the system store does not hold it.
const ssl = target === 'local' ? false : { ca: env.MIGRATION_DATABASE_CA_FILE ? readFileSync(env.MIGRATION_DATABASE_CA_FILE, 'utf8') : undefined };
const client = new pg.Client({ connectionString, ssl });
try {
  await client.connect();
} catch (error) {
  fail(`${target}: could not connect (${error.code ?? 'unknown error'}).`);
}
const db = { run: sql => client.query(sql), query: (sql, params) => client.query(sql, params) };

try {
  if (command === 'baseline') {
    const recorded = await baselineMigrations(db, files, { ...run, through });
    run.log(`baseline recorded ${recorded.length} file(s) as already applied, through ${through}`);
  } else {
    const plan = command === 'apply' ? await applyMigrations(db, files, run) : await migrationStatus(db, files, target);
    for (const row of plan.branchOnly) run.log(`applied from branch ${row.git_ref}, not in this checkout: ${row.filename}`);
    if (command === 'status') {
      for (const file of plan.pending) run.log(`pending ${file.filename}`);
      if (plan.errors.length) throw new LedgerError(plan.errors.join('\n'));
    }
    run.log(`${plan.pending.length} file(s) ${command === 'apply' ? 'applied' : 'pending'}, ${files.length} in the checkout`);
  }
} catch (error) {
  await client.end().catch(() => {});
  fail(error instanceof LedgerError ? `${target}: ${error.message}` : `${target}: unexpected failure (${error.code ?? error.name}).`);
}
await client.end();

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
