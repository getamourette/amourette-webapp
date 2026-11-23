// Applied-migrations ledger (#434). Each database records which files of
// supabase/migrations it has received, so "what is missing" is read from the
// database itself and a file edited after it was applied is detected. The CLI
// tracker cannot do this: several files share a version prefix and the hosted
// history does not match the directory.
//
// `db` is a two-method adapter so the same code runs on node-postgres and on
// PGlite: `run(sql)` executes one or more statements without parameters,
// `query(sql, params)` executes one statement and resolves to `{ rows }`.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DEVELOPMENT_PROJECT_REF } from './development-target.mjs';

// Public like the development ref: it is the host of the production API URL.
export const PRODUCTION_PROJECT_REF = 'ywiiiggxvytnmkogsfnq';
export const MAIN = 'main';
// Files up to this one predate the ledger; some manage their own transaction.
// From here on a migration is one implicit transaction owned by the ledger.
export const LAST_LEGACY_MIGRATION = '20261123000001_launch_arrival_early_window.sql';
const TRANSACTION_CONTROL = /^\s*(begin|commit|rollback|start\s+transaction)\s*;/im;
const LOCK_KEY = 434434;

export class LedgerError extends Error {}

export const ownsTransaction = sql => TRANSACTION_CONTROL.test(sql);

// Returns the refusal message, or null when the connection string designates
// the database that `target` names. A secret stored in the wrong GitHub
// environment is refused here instead of reaching the wrong project.
export function targetRefusal(target, connectionString, env = {}) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    return 'Refusing to run: MIGRATION_DATABASE_URL is not a valid URL.';
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) return 'Refusing to run: MIGRATION_DATABASE_URL is not a Postgres URL.';
  if (target === 'local') {
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? null : 'Refusing to run: the local target accepts a loopback database only.';
  }
  const expected = { development: DEVELOPMENT_PROJECT_REF, production: PRODUCTION_PROJECT_REF }[target];
  if (!expected) return 'Refusing to run: MIGRATION_TARGET must be local, development or production.';
  // Session pooler (IPv4, what GitHub runners can reach) or direct connection.
  const pooled = url.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(url.username) === `postgres.${expected}`;
  const direct = url.hostname === `db.${expected}.supabase.co`;
  if (!pooled && !direct) return `Refusing to run: MIGRATION_DATABASE_URL does not designate the ${target} project.`;
  // Production receives only what is in main, and only from the workflow.
  if (target === 'production' && !(env.GITHUB_ACTIONS === 'true' && env.GITHUB_REF === `refs/heads/${MAIN}`)) {
    return 'Refusing to run: production is migrated only by GitHub Actions on main.';
  }
  return null;
}

export function readMigrations(directory) {
  return readdirSync(directory).filter(file => file.endsWith('.sql')).sort().map(filename => {
    const bytes = readFileSync(join(directory, filename));
    return { filename, checksum: createHash('sha256').update(bytes).digest('hex'), sql: bytes.toString('utf8') };
  });
}

// Pure comparison of the checkout with the ledger rows.
export function planMigrations(files, rows, target) {
  const byName = new Map(rows.map(row => [row.filename, row]));
  const present = new Set(files.map(file => file.filename));
  const pending = files.filter(file => !byName.has(file.filename));
  const lastMain = rows.filter(row => row.git_ref === MAIN).map(row => row.filename).sort().at(-1);
  const absent = rows.filter(row => !present.has(row.filename));
  // Applied from a branch for a preview and not merged yet: development only.
  const branchOnly = absent.filter(row => row.git_ref !== MAIN);
  const errors = [
    ...files.filter(file => byName.has(file.filename) && byName.get(file.filename).checksum !== file.checksum)
      .map(file => `${file.filename} was edited after it was applied (${byName.get(file.filename).git_ref}). Add a new migration instead.`),
    ...pending.filter(file => lastMain && file.filename < lastMain)
      .map(file => `${file.filename} sorts before ${lastMain}, which is already applied. Rename it so it sorts last.`),
    ...absent.filter(row => row.git_ref === MAIN)
      .map(row => `${row.filename} is applied from main but missing from this checkout. Update the branch.`),
    ...(target === 'production' ? branchOnly.map(row => `${row.filename} is recorded in production but is not in main.`) : []),
    ...pending.filter(file => file.filename > LAST_LEGACY_MIGRATION && ownsTransaction(file.sql))
      .map(file => `${file.filename} contains BEGIN, COMMIT or ROLLBACK. The ledger owns the transaction.`),
  ];
  return { pending, branchOnly, errors };
}

async function open(db) {
  await db.run(`
    create schema if not exists migration_ledger;
    revoke all on schema migration_ledger from public;
    create table if not exists migration_ledger.applied (
      filename text primary key,
      checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
      applied_at timestamptz not null default now(),
      git_ref text not null,
      commit_sha text,
      run_url text,
      -- false: recorded by the one-time baseline, not executed by the ledger
      executed boolean not null
    );
    revoke all on migration_ledger.applied from public;
  `);
  const { rows } = await db.query('select pg_try_advisory_lock($1) as locked', [LOCK_KEY]);
  if (!rows[0].locked) throw new LedgerError('Another run is applying migrations to this database.');
}

const ledgerRows = async db => (await db.query('select filename, checksum, git_ref, executed from migration_ledger.applied order by filename')).rows;

const record = (db, file, run, executed) => db.query(
  'insert into migration_ledger.applied (filename, checksum, git_ref, commit_sha, run_url, executed) values ($1, $2, $3, $4, $5, $6)',
  [file.filename, file.checksum, run.gitRef, run.commitSha ?? null, run.runUrl ?? null, executed],
);

export async function migrationStatus(db, files, target) {
  await open(db);
  return planMigrations(files, await ledgerRows(db), target);
}

// Applies every pending file in filename order and stops at the first error.
// Nothing is applied when the comparison reports a problem.
export async function applyMigrations(db, files, { target, gitRef, commitSha, runUrl, log = () => {} }) {
  const run = { gitRef, commitSha, runUrl };
  await open(db);
  const plan = planMigrations(files, await ledgerRows(db), target);
  if (plan.errors.length) throw new LedgerError(plan.errors.join('\n'));
  if (gitRef === MAIN) {
    // A file first applied from a branch for a preview is now part of main.
    await db.query(
      'update migration_ledger.applied set git_ref = $1, commit_sha = $2, run_url = $3 where git_ref <> $1 and filename = any($4)',
      [MAIN, commitSha ?? null, runUrl ?? null, files.map(file => file.filename)],
    );
  }
  for (const file of plan.pending) {
    try {
      if (ownsTransaction(file.sql)) {
        await db.run(file.sql);
        await record(db, file, run, true);
      } else {
        await db.run('begin');
        // A migration waiting on a lock queues every query behind it: fail fast.
        await db.run("set local lock_timeout = '10s'");
        await db.run(file.sql);
        await record(db, file, run, true);
        await db.run('commit');
      }
    } catch (error) {
      await db.run('rollback').catch(() => {});
      // Message and code only: `detail` can quote row values.
      throw new LedgerError(`${file.filename} failed and was rolled back: ${error.code ? `${error.code} ` : ''}${error.message}`);
    }
    log(`applied ${file.filename}`);
  }
  return plan;
}

// One-time adoption of a database that already holds the schema: records the
// files up to `through` as applied without executing them. Refused once the
// ledger has any row.
export async function baselineMigrations(db, files, { through, gitRef, commitSha, runUrl }) {
  await open(db);
  if ((await ledgerRows(db)).length) throw new LedgerError('The ledger is not empty: baseline runs once, on adoption.');
  if (!files.some(file => file.filename === through)) throw new LedgerError(`--through must name an existing migration file, got ${through ?? 'nothing'}.`);
  const recorded = files.filter(file => file.filename <= through);
  await db.run('begin');
  try {
    for (const file of recorded) await record(db, file, { gitRef, commitSha, runUrl }, false);
    await db.run('commit');
  } catch (error) {
    await db.run('rollback').catch(() => {});
    throw error;
  }
  return recorded;
}
