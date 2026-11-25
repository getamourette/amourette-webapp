import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BACKED_UP_SCHEMAS, SKIPPED_SCHEMAS, SKIPPED_TABLES, backupMigration, dumpArguments, dumpedTables, ledgerLine, parseRecipients,
  restorePreamble, restoreTargetRefusal, uncoveredSchemas,
} from './database-backup.mjs';
import { DEVELOPMENT_PROJECT_REF } from './development-target.mjs';
import { PRODUCTION_PROJECT_REF } from './migration-ledger.mjs';

// #523: the daily production backup. The dump and the restore themselves run on
// a real stack in the backup workflow's rehearsal (scripts/rehearse-backup-restore.mjs).

// Every schema the migrations write to is backed up or skipped with a reason:
// a table in a new schema cannot silently stay out of the backup.
const migrations = fileURLToPath(new URL('../supabase/migrations', import.meta.url));
assert.deepEqual(uncoveredSchemas(migrations), []);
const directory = mkdtempSync(join(tmpdir(), 'backup-schemas-'));
try {
  for (const file of readdirSync(migrations)) copyFileSync(join(migrations, file), join(directory, file));
  writeFileSync(join(directory, '99990101000001_new_schema.sql'), 'create schema if not exists analytics;\ncreate table analytics.visits (id bigint primary key);\n');
  assert.deepEqual(uncoveredSchemas(directory), ['analytics'], 'a table in a new schema is reported');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
assert.ok(BACKED_UP_SCHEMAS.every(schema => !(schema in SKIPPED_SCHEMAS)));

// Data only, the three schemas, the Auth service's own tables left out.
const args = dumpArguments('postgresql://postgres@127.0.0.1:54322/postgres');
assert.ok(args.includes('--data-only') && args.includes('--no-owner') && args.includes('--no-privileges'));
assert.deepEqual(args.filter(arg => arg.startsWith('--schema=')), ['--schema=auth', '--schema=public', '--schema=private']);
assert.deepEqual(args.filter(arg => arg.startsWith('--exclude-table=')), SKIPPED_TABLES.map(table => `--exclude-table=${table}`));

// Public keys only. A private key pasted by mistake is refused without being
// repeated in the public run log.
const key = 'age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p';
assert.deepEqual(parseRecipients(`# founder\n${key}\n\n`), [key]);
assert.throws(() => parseRecipients(''), /No age public key: set the BACKUP_AGE_RECIPIENTS secret/);
assert.throws(() => parseRecipients('# nothing yet\n'), /No age public key/);
assert.throws(() => parseRecipients(`${key}\nage1short`), /1 line\(s\) of BACKUP_AGE_RECIPIENTS are not age public keys/);
const secret = 'AGE-SECRET-KEY-1QYQSZQGPQYQSZQGPQYQSZQGPQYQSZQGPQYQSZQGPQYQSZQGPQYQSHTZJ5K';
assert.throws(() => parseRecipients(`${key}\n${secret}`), error => /holds a private key/.test(error.message) && !error.message.includes(secret.slice(15)));

// The restore reads the table list from the dump's COPY lines.
assert.deepEqual(dumpedTables('SET x = 1;\nCOPY auth.users (id) FROM stdin;\n\\.\nCOPY public."Odd ""name""" (id) FROM stdin;\n\\.\n-- COPY public.not_a_line (id)\n'),
  ['auth.users', 'public."Odd ""name"""']);
// The backup names the schema its rows fit; the restore refuses another one.
const header = ledgerLine('20261126000489_launch_mail_founder_resend.sql');
assert.equal(backupMigration(`${header}--\n-- PostgreSQL database dump\n`), '20261126000489_launch_mail_founder_resend.sql');
assert.equal(backupMigration('--\n-- PostgreSQL database dump\n'), null, 'a dump without the line is not a backup of this tool');
const preamble = restorePreamble(['auth.users', 'public.venues', 'private.launch_reservations'], '20261126000489_launch_mail_founder_resend.sql');
assert.match(preamble, /if \(select max\(filename\) from migration_ledger\.applied\) is distinct from '20261126000489_launch_mail_founder_resend\.sql' then/);
// Every restored table but the seeded ones must be empty, accounts or not.
assert.match(preamble, /foreach name in array array\['auth\.users', 'private\.launch_reservations'\]::text\[\] loop/);
assert.ok(preamble.lastIndexOf('raise exception') < preamble.indexOf('delete from'), 'the refusals come before any row is deleted');
assert.match(preamble, /set session_replication_role = replica;\ndelete from auth\.users;\ndelete from public\.venues;\ndelete from private\.launch_reservations;/);
assert.throws(() => restorePreamble(['auth.users'], "x'; drop table t; --"), /needs the migration file/);

// A restore goes to a loopback stack or to the production project, never to
// development (production rows stay in the EU) or anywhere else.
assert.equal(restoreTargetRefusal('local', 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'), null);
assert.match(restoreTargetRefusal('local', `postgresql://postgres.${PRODUCTION_PROJECT_REF}:x@aws-1-eu-west-3.pooler.supabase.com:5432/postgres`), /loopback database only/);
assert.equal(restoreTargetRefusal('production', `postgresql://postgres.${PRODUCTION_PROJECT_REF}:x@aws-1-eu-west-3.pooler.supabase.com:5432/postgres`), null);
assert.equal(restoreTargetRefusal('production', `postgresql://postgres:x@db.${PRODUCTION_PROJECT_REF}.supabase.co:5432/postgres`), null);
assert.match(restoreTargetRefusal('production', `postgresql://postgres.${DEVELOPMENT_PROJECT_REF}:x@aws-1-us-east-1.pooler.supabase.com:5432/postgres`), /does not designate the production project/);
assert.match(restoreTargetRefusal('development', `postgresql://postgres.${DEVELOPMENT_PROJECT_REF}:x@aws-1-us-east-1.pooler.supabase.com:5432/postgres`), /must be local or production/);
assert.match(restoreTargetRefusal('production', 'postgresql://postgres:p@ss@db.x.supabase.co/postgres'), /not a valid URL|does not designate/);

// The backup never runs in this public repository, whose artifacts any GitHub
// account can download: only the private repository calls it, on the code of main.
const workflow = readFileSync(new URL('../.github/workflows/backup.yml', import.meta.url), 'utf8');
const backupJob = workflow.slice(workflow.indexOf('\n  backup:\n'), workflow.indexOf('\n  rehearsal:\n'));
assert.match(workflow, /\non:\n  workflow_call:\n/);
assert.doesNotMatch(workflow, /\n  schedule:/, 'no schedule here: the private repository owns it');
assert.match(backupJob, /\n    if: github\.repository == 'getamourette\/amourette-backups'\n/);
assert.match(backupJob, /repository: getamourette\/amourette-webapp\n\s+ref: main\n/);
assert.match(backupJob, /upload-artifact/);
assert.doesNotMatch(workflow.replace(backupJob, ''), /upload-artifact[\s\S]*production-backup/, 'only the backup job uploads a backup');
assert.match(workflow, /BACKUP_AGE_RECIPIENTS: \$\{\{ secrets\.BACKUP_AGE_RECIPIENTS \}\}/);
assert.doesNotMatch(workflow, /vars\.BACKUP_AGE_RECIPIENTS/);
assert.match(workflow, /retention-days: 30/);
assert.doesNotMatch(workflow, /BACKUP_IDENTITY_FILE|AGE-SECRET-KEY/, 'the private key never reaches GitHub');

console.log('database backup: schemas covered, public keys only, restore refusals and targets checked');
