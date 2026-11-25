#!/usr/bin/env node

// Daily backup of the production database (#523), and its restore.
//
//   dump <file.sql.age>       rows of the backed-up schemas, headed by the last
//                             migration the database holds, encrypted with age
//                             to the public keys of BACKUP_RECIPIENTS_FILE. The
//                             plain dump never touches the disk.
//   restore <file.sql.age>    decrypts with the private key of BACKUP_IDENTITY_FILE
//                             and loads the rows, in one transaction, into a
//                             database built from supabase/migrations up to that
//                             same migration and holding no row of its own.
//
// BACKUP_TARGET (local or production) and BACKUP_DATABASE_URL name the
// database. pg_dump, psql and age must be on PATH (PostgreSQL 17 client).
// Nothing read from the database is printed: the run logs are public.
import { spawn } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRODUCTION_PROJECT_REF, SUPABASE_ROOT_CA, describeInvalid, targetRefusal } from './migration-ledger.mjs';

// Rows that would hurt to lose: accounts (auth), profiles, reservations,
// reports, sanctions, the email do-not-send list (public, private).
export const BACKED_UP_SCHEMAS = ['auth', 'public', 'private'];
// Every other schema a migration touches, and why its rows are not needed.
export const SKIPPED_SCHEMAS = {
  cron: 'job definitions come from the migrations; run history is a log',
  extensions: 'extension objects only',
  migration_ledger: 'rebuilt by the migrations of the restored project',
  net: 'pg_net request queue, transient',
  realtime: 'transient broadcast messages',
  storage: 'photo files are not in a database backup; bucket rows come from the migrations',
  vault: 'secrets are encrypted with a key of the project itself; they are entered again',
};
// Inside a backed-up schema: owned by the Auth service or a log.
export const SKIPPED_TABLES = ['auth.schema_migrations', 'auth.audit_log_entries'];
export const AGE_HEADER = 'age-encryption.org/v1';
// pg_dump 17.6 and later write a \unrestrict line after it.
const DUMP_END = '-- PostgreSQL database dump complete';
// First line of every backup: the schema its rows fit. A data-only dump only
// loads into the same schema; later migrations are applied after the restore.
const LEDGER_LINE = /^-- Backup of migrations through: (\d{14}_[a-z0-9_]+\.sql)\n/;
const MIGRATION_FILE = /^\d{14}_[a-z0-9_]+\.sql$/;
const LAST_MIGRATION = 'select max(filename) from migration_ledger.applied';
// Tables a fresh replay of the migrations fills (demo venues, consent wordings):
// the only ones a restore target may hold rows in. Every other table must be
// empty, so a database in use is never overwritten. The rehearsal fails if a
// migration seeds a table missing here.
export const SEEDED_TABLES = [
  'private.matching_consent_wordings', 'private.unassigned_analytics_cleanup', 'public.venue_night_configuration_audits',
  'public.venue_night_public_state', 'public.venue_nights', 'public.venues',
];

// Schemas the migrations of `directory` create tables or rows in, that are
// neither backed up nor skipped with a reason. A new schema must be one or the
// other (scripts/test-database-backup.mjs).
export function uncoveredSchemas(directory) {
  const known = new Set([...BACKED_UP_SCHEMAS, ...Object.keys(SKIPPED_SCHEMAS)]);
  const found = new Set();
  const pattern = /\b(?:(?:create|alter)\s+table\s+(?:if\s+(?:not\s+)?exists\s+)?(?:only\s+)?|insert\s+into\s+)"?([a-z_][a-z0-9_]*)"?\.|\bcreate\s+schema\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)/gi;
  for (const file of readdirSync(directory).filter(name => name.endsWith('.sql'))) {
    for (const match of readFileSync(join(directory, file), 'utf8').matchAll(pattern)) found.add((match[1] ?? match[2]).toLowerCase());
  }
  return [...found].filter(schema => !known.has(schema)).sort();
}

export function dumpArguments(connectionString) {
  return [
    '--dbname', connectionString, '--data-only', '--no-owner', '--no-privileges', '--no-comments',
    ...BACKED_UP_SCHEMAS.map(schema => `--schema=${schema}`),
    ...SKIPPED_TABLES.map(table => `--exclude-table=${table}`),
  ];
}

// One age public key per line; blank lines and # comments are ignored. A
// private key pasted by mistake is refused without being repeated.
export function parseRecipients(text) {
  const lines = String(text ?? '').split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  if (lines.some(line => /^AGE-SECRET-KEY-/i.test(line))) throw new Error('BACKUP_AGE_RECIPIENTS holds a private key (AGE-SECRET-KEY-…). Remove it now and generate a new key pair: only the public key (age1…) goes to GitHub.');
  if (!lines.length) throw new Error('No age public key: set the BACKUP_AGE_RECIPIENTS secret (one age1… key per line).');
  const invalid = lines.filter(line => !/^age1[02-9ac-hj-np-z]{58}$/.test(line)).length;
  if (invalid) throw new Error(`${invalid} line(s) of BACKUP_AGE_RECIPIENTS are not age public keys (age1 followed by 58 characters).`);
  return lines;
}

// The tables a dump holds, in its order, from its COPY lines.
export function dumpedTables(sql) {
  return [...sql.matchAll(/^COPY ("(?:[^"]|"")+"|\w+)\.("(?:[^"]|"")+"|\w+) \(/gm)].map(match => `${match[1]}.${match[2]}`);
}

export const ledgerLine = migration => `-- Backup of migrations through: ${migration}\n`;
export const backupMigration = sql => LEDGER_LINE.exec(sql)?.[1] ?? null;

// Prepended to the dump on restore, inside its transaction. Refuses a database
// at another migration than the backup, or holding a row in any restored
// table but the seeded ones; then empties the restored tables and loads with
// triggers and foreign keys off, so no trigger fires on restored rows.
export function restorePreamble(tables, migration) {
  if (!MIGRATION_FILE.test(migration ?? '')) throw new Error('restorePreamble needs the migration file of the backup.');
  const literal = text => `'${text.replaceAll("'", "''")}'`;
  const checked = tables.filter(table => !SEEDED_TABLES.includes(table.replaceAll('"', '')));
  return [
    'do $restore$',
    'declare',
    '  name text;',
    '  filled boolean;',
    'begin',
    `  if (${LAST_MIGRATION}) is distinct from ${literal(migration)} then`,
    `    raise exception 'Refusing to restore: this backup fits the schema through ${migration}, the database is through %. Build it up to that file first.', coalesce((${LAST_MIGRATION}), 'nothing');`,
    '  end if;',
    `  foreach name in array array[${checked.map(literal).join(', ')}]::text[] loop`,
    "    execute format('select exists (select 1 from %s)', name) into filled;",
    "    if filled then raise exception 'Refusing to restore: % already holds rows. Restore only into a database freshly built from the migrations.', name; end if;",
    '  end loop;',
    'end $restore$;',
    'set session_replication_role = replica;',
    ...tables.map(table => `delete from ${table};`),
    '',
  ].join('\n');
}

export function restoreTargetRefusal(target, connectionString) {
  if (target === 'local') return targetRefusal('local', connectionString);
  if (target !== 'production') return 'Refusing to run: BACKUP_TARGET must be local or production.';
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    return `Refusing to run: BACKUP_DATABASE_URL is not a valid URL (${describeInvalid(connectionString)}).`;
  }
  const pooled = url.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(url.username) === `postgres.${PRODUCTION_PROJECT_REF}`;
  return pooled || url.hostname === `db.${PRODUCTION_PROJECT_REF}.supabase.co` ? null : 'Refusing to run: BACKUP_DATABASE_URL does not designate the production project.';
}

// libpq reads TLS from the environment: verified against the pinned Supabase
// root for a hosted project, off for a loopback stack. TLS parameters in the
// URL are removed so they cannot weaken it.
function connection(target, connectionString) {
  if (target === 'local') return { url: connectionString, env: { PGSSLMODE: 'disable' } };
  const url = new URL(connectionString);
  for (const key of [...url.searchParams.keys()]) if (/^ssl/i.test(key)) url.searchParams.delete(key);
  return { url: url.href, env: { PGSSLMODE: 'verify-full', PGSSLROOTCERT: SUPABASE_ROOT_CA } };
}

function run(command, args, { env = {}, input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    child.stdout.on('data', chunk => out.push(chunk));
    child.stderr.on('data', chunk => err.push(chunk));
    child.on('error', error => reject(new Error(`${command} could not start (${error.code}). Install the PostgreSQL 17 client and age.`)));
    child.on('close', status => resolve({ status, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString('utf8') }));
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

// A message from a tool, with anything that could quote data or a credential cut.
const toolError = text => text.split('\n').map(line => line.trim()).filter(line => line && !/postgres(?:ql)?:\/\/|report unexpected/i.test(line)).slice(0, 3).join(' | ').slice(0, 400);

export async function dump(file, { target, connectionString, recipientsFile }) {
  const refusal = targetRefusal(target, connectionString, process.env);
  if (refusal) throw new Error(refusal.replace('MIGRATION_DATABASE_URL', 'BACKUP_DATABASE_URL').replace('MIGRATION_TARGET', 'BACKUP_TARGET').replace('migrated', 'backed up'));
  if (!recipientsFile || !existsSync(recipientsFile)) throw new Error('Set BACKUP_RECIPIENTS_FILE to a file of age public keys.');
  const recipients = parseRecipients(readFileSync(recipientsFile, 'utf8'));
  const db = connection(target, connectionString);

  const ledger = await run('psql', ['--dbname', db.url, '--no-psqlrc', '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1', '--command', LAST_MIGRATION], { env: db.env });
  if (ledger.status !== 0) throw new Error(`Reading the migration ledger failed (${ledger.status}): ${toolError(ledger.stderr)}`);
  const migration = ledger.stdout.toString('utf8').trim();
  if (!MIGRATION_FILE.test(migration)) throw new Error('The database has no migration ledger row: nothing says which schema the rows fit.');

  const pgDump = spawn('pg_dump', dumpArguments(db.url), { env: { ...process.env, ...db.env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const age = spawn('age', ['--encrypt', ...recipients.flatMap(key => ['--recipient', key]), '--output', file], { stdio: ['pipe', 'ignore', 'pipe'] });
  age.stdin.on('error', () => {});
  age.stdin.write(ledgerLine(migration));
  const errors = { pg_dump: '', age: '' };
  pgDump.stderr.on('data', chunk => { errors.pg_dump += chunk; });
  age.stderr.on('data', chunk => { errors.age += chunk; });
  let tail = '';
  let tables = 0;
  let pending = '';
  pgDump.stdout.on('data', chunk => {
    const text = pending + chunk.toString('utf8');
    const lines = text.split('\n');
    pending = lines.pop();
    tables += lines.filter(line => line.startsWith('COPY ')).length;
    tail = (tail + chunk.toString('utf8')).slice(-200);
  });
  pgDump.stdout.pipe(age.stdin);
  const exited = child => new Promise(resolve => {
    child.on('error', error => resolve({ error }));
    child.on('close', status => resolve({ status }));
  });
  const [dumped, encrypted] = await Promise.all([exited(pgDump), exited(age)]);
  const fail = message => {
    rmSync(file, { force: true });
    throw new Error(message);
  };
  if (dumped.error || encrypted.error) fail('pg_dump or age could not start. Install the PostgreSQL 17 client and age.');
  if (dumped.status !== 0) fail(`pg_dump failed (${dumped.status}): ${toolError(errors.pg_dump)}`);
  if (encrypted.status !== 0) fail(`age failed (${encrypted.status}): ${toolError(errors.age)}`);
  if (!tail.includes(DUMP_END)) fail('The dump is incomplete: it does not end with the pg_dump completion line.');
  if (!tables) fail('The dump holds no table.');
  const header = Buffer.alloc(AGE_HEADER.length);
  const fd = openSync(file, 'r');
  try {
    readSync(fd, header, 0, header.length, 0);
  } finally {
    closeSync(fd);
  }
  if (header.toString('utf8') !== AGE_HEADER) fail('The output is not an age file.');
  return { tables, bytes: statSync(file).size, recipients: recipients.length, migration };
}

export async function restore(file, { target, connectionString, identityFile }) {
  const refusal = restoreTargetRefusal(target, connectionString);
  if (refusal) throw new Error(refusal);
  if (!identityFile || !existsSync(identityFile)) throw new Error('Set BACKUP_IDENTITY_FILE to the file holding the age private key.');
  const decrypted = await run('age', ['--decrypt', '--identity', identityFile, file]);
  if (decrypted.status !== 0) throw new Error(`age could not decrypt the backup (${decrypted.status}): ${toolError(decrypted.stderr)}. Nothing was restored.`);
  const sql = decrypted.stdout.toString('utf8');
  if (!sql.slice(-400).includes(DUMP_END)) throw new Error('The decrypted backup is incomplete. Nothing was restored.');
  const migration = backupMigration(sql);
  if (!migration) throw new Error('The backup does not say which migration its rows fit. Nothing was restored.');
  const tables = dumpedTables(sql);
  if (!tables.length) throw new Error('The backup holds no table. Nothing was restored.');
  const db = connection(target, connectionString);
  const loaded = await run('psql', ['--dbname', db.url, '--no-psqlrc', '--quiet', '--single-transaction', '--set', 'ON_ERROR_STOP=1', '--file', '-'], {
    env: db.env,
    input: restorePreamble(tables, migration) + sql,
  });
  if (loaded.status !== 0) throw new Error(`The restore failed and was rolled back (${loaded.status}): ${toolError(loaded.stderr)}`);
  return { tables: tables.length, migration };
}

async function main() {
  const [command, file, ...rest] = process.argv.slice(2);
  if (!['dump', 'restore'].includes(command) || !file || rest.length) {
    process.stderr.write('Usage: node scripts/database-backup.mjs dump|restore <file.sql.age>\n');
    process.exit(2);
  }
  const target = process.env.BACKUP_TARGET;
  const connectionString = process.env.BACKUP_DATABASE_URL;
  if (!target || !connectionString) {
    process.stderr.write('Set BACKUP_TARGET (local or production) and BACKUP_DATABASE_URL.\n');
    process.exit(2);
  }
  try {
    if (command === 'dump') {
      const result = await dump(file, { target, connectionString, recipientsFile: process.env.BACKUP_RECIPIENTS_FILE });
      process.stdout.write(`${target}: backed up ${result.tables} table(s) through ${result.migration}, ${result.bytes} encrypted byte(s), for ${result.recipients} key(s)\n`);
    } else {
      const result = await restore(file, { target, connectionString, identityFile: process.env.BACKUP_IDENTITY_FILE });
      process.stdout.write(`${target}: restored ${result.tables} table(s) through ${result.migration} in one transaction\n`);
    }
  } catch (error) {
    process.stderr.write(`${target}: ${error.message}\n`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
