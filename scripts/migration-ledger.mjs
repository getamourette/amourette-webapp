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
import { fileURLToPath } from 'node:url';
import { DEVELOPMENT_PROJECT_REF } from './development-target.mjs';
import { ADDITIVE, REMOVAL, classifyMigration } from './migration-kind.mjs';

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

// Says what is wrong with an unparsable connection string without quoting any
// part of it: the repository and its run logs are public. The usual cause is a
// password with a reserved character (`/ ? # @ :`), which must be
// percent-encoded (encodeURIComponent) before it goes into the string.
export function describeInvalid(value) {
  const text = String(value);
  const facts = [];
  if (!/^postgres(?:ql)?:\/\//.test(text.trim())) facts.push('it does not start with postgresql://');
  if (/^\s|\s$/.test(text)) facts.push('it has spaces or line breaks at its start or end');
  if (/[\r\n]/.test(text.trim())) facts.push('it spans several lines');
  if (/\s/.test(text.trim())) facts.push('it contains a space');
  if (/[[\]]/.test(text)) facts.push('it still contains square brackets, as in [YOUR-PASSWORD]');
  if (/["'`]/.test(text)) facts.push('it contains quotes');
  const at = (text.match(/@/g) ?? []).length;
  if (at !== 1) facts.push(`it contains ${at} "@" instead of one`);
  const authority = text.replace(/^[a-z]+:\/\//i, '').split('@')[0] ?? '';
  if (/[/?#]/.test(authority)) facts.push('the part before "@" contains "/", "?" or "#"');
  if ((authority.match(/:/g) ?? []).length > 1) facts.push('the part before "@" contains more than one ":"');
  if (/%(?![0-9a-f]{2})/i.test(text)) facts.push('it contains a "%" not followed by two hexadecimal digits');
  facts.push('a password with / ? # @ : or % must be percent-encoded');
  return facts.join('; ');
}

// Returns the refusal message, or null when the connection string designates
// the database that `target` names. A secret stored in the wrong GitHub
// environment is refused here instead of reaching the wrong project.
export function targetRefusal(target, connectionString, env = {}) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    return `Refusing to run: MIGRATION_DATABASE_URL is not a valid URL (${describeInvalid(connectionString)}).`;
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

// Supabase signs its database certificates with its own root, which no system
// store holds. Pinned in the repository (public certificate; its SHA-256 matches
// the file the Supabase dashboard offers for download). Verified TLS only.
export const SUPABASE_ROOT_CA = fileURLToPath(new URL('../supabase/ca/supabase-root-2021.crt', import.meta.url));

// node-postgres lets TLS parameters of the URL replace the `ssl` option, which
// would drop the pinned root: they are removed and TLS is set here alone.
export function clientConfig(target, connectionString, env = {}) {
  if (target === 'local') return { connectionString, ssl: false };
  const url = new URL(connectionString);
  for (const key of [...url.searchParams.keys()]) if (/^ssl/i.test(key)) url.searchParams.delete(key);
  return { connectionString: url.href, ssl: { ca: readFileSync(env.MIGRATION_DATABASE_CA_FILE || SUPABASE_ROOT_CA, 'utf8'), rejectUnauthorized: true } };
}

export function readMigrations(directory) {
  return readdirSync(directory).filter(file => file.endsWith('.sql')).sort().map(filename => {
    const bytes = readFileSync(join(directory, filename));
    return { filename, checksum: createHash('sha256').update(bytes).digest('hex'), sql: bytes.toString('utf8') };
  });
}

// Pure comparison of the checkout with the ledger rows.
export function planMigrations(files, rows, target, gitRef = MAIN) {
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
    // A hosted database already holds its schema: with no ledger row, every
    // file would run again on top of it. The one-time baseline comes first.
    ...(target !== 'local' && !rows.length ? ['The ledger of this database is empty: run the baseline mode first, it records the files already applied.'] : []),
    ...pending.filter(file => file.filename > LAST_LEGACY_MIGRATION && ownsTransaction(file.sql))
      .map(file => `${file.filename} contains BEGIN, COMMIT or ROLLBACK. The ledger owns the transaction.`),
  ];
  // What each pending file does to the code already live (migration-kind.mjs).
  // A hosted database never receives a removal: it cannot be undone and no
  // backup is taken before it yet. A branch previewing on development applies
  // additive files only, so it cannot change the database under main's code.
  if (target !== 'local') {
    for (const file of pending) {
      const kind = classifyMigration(file.sql, files.filter(other => other.filename < file.filename).map(other => other.sql).join('\n')).kind;
      if (kind === REMOVAL) errors.push(`${file.filename} removes, renames or is not recognised: it is not applied automatically until the pre-removal backup exists (#434).`);
      else if (kind !== ADDITIVE && gitRef !== MAIN) errors.push(`${file.filename} is not purely additive: a branch applies additive migrations only.`);
    }
  }
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

export async function migrationStatus(db, files, target, gitRef = MAIN) {
  await open(db);
  return planMigrations(files, await ledgerRows(db), target, gitRef);
}

// Applies every pending file in filename order and stops at the first error.
// Nothing is applied when the comparison reports a problem.
export async function applyMigrations(db, files, { target, gitRef, commitSha, runUrl, log = () => {} }) {
  const run = { gitRef, commitSha, runUrl };
  await open(db);
  const plan = planMigrations(files, await ledgerRows(db), target, gitRef);
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
