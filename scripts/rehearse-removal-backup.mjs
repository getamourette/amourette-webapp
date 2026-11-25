#!/usr/bin/env node

// Rehearses the save before a removal (#510) on a disposable local database
// that already holds every migration of the checkout (the workflow's rehearsal
// stack): a column holding rows is dropped through the real command, refused
// first when its save fails, then saved, removed and restored with the
// documented restore migration. Leaves the database as it found it.
//
//   MIGRATION_DATABASE_URL=postgresql://…@127.0.0.1:54322/postgres node scripts/rehearse-removal-backup.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { backupSchema, targetRefusal } from './migration-ledger.mjs';

const url = process.env.MIGRATION_DATABASE_URL;
const refusal = url ? targetRefusal('local', url) : 'Set MIGRATION_DATABASE_URL.';
if (refusal) {
  process.stderr.write(`${refusal}\n`);
  process.exit(1);
}

const source = process.env.MIGRATION_DIRECTORY ?? fileURLToPath(new URL('../supabase/migrations', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'removal-rehearsal-'));
for (const file of readdirSync(source).filter(name => name.endsWith('.sql'))) copyFileSync(join(source, file), join(directory, file));
const TABLE = '99990101000001_removal_rehearsal_table.sql';
const DROP = '99990101000002_removal_rehearsal_drop.sql';
const RESTORE = '99990101000003_removal_rehearsal_restore.sql';
const SAVED = backupSchema(DROP);
const write = (name, sql) => writeFileSync(join(directory, name), sql);
const apply = () => spawnSync(process.execPath, [fileURLToPath(new URL('./apply-migrations.mjs', import.meta.url)), 'apply'], {
  encoding: 'utf8',
  env: { PATH: process.env.PATH, MIGRATION_TARGET: 'local', MIGRATION_DATABASE_URL: url, MIGRATION_DIRECTORY: directory },
});
const say = line => process.stdout.write(`${line}\n`);

const client = new pg.Client({ connectionString: url });
await client.connect();
const value = async sql => Object.values((await client.query(sql)).rows[0] ?? {})[0];
const notes = () => client.query('select id, note from public.removal_rehearsal order by id').then(result => result.rows.map(row => `${row.id}:${row.note}`));
const expected = ['1:first', '2:second', '3:third'];

try {
  const before = apply();
  assert.equal(before.status, 0, before.stderr);
  assert.match(before.stdout, /local: 0 file\(s\) applied/, 'the stack already holds every migration of the checkout');

  write(TABLE, "create table public.removal_rehearsal (id integer primary key, note text not null);\ninsert into public.removal_rehearsal values (1, 'first'), (2, 'second'), (3, 'third');\n");
  assert.equal(apply().status, 0);
  say(`1. ${TABLE}: a table with a column holding ${expected.length} rows`);

  write(DROP, 'alter table public.removal_rehearsal drop column note;\n');
  await client.query(`create schema ${SAVED}`);
  const refused = apply();
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, new RegExp(`${DROP} was not applied: saving the application tables before this removal failed \\(42P06 [^)]*\\)\\. Nothing was removed\\.`));
  assert.deepEqual(await notes(), expected);
  assert.equal(await value(`select count(*)::int from migration_ledger.applied where filename = '${DROP}'`), 0);
  say(`2. save made to fail (a schema already named ${SAVED}): refused, column and rows intact`);
  say(`   ${refused.stderr.trim()}`);
  await client.query(`drop schema ${SAVED}`);

  const removed = apply();
  assert.equal(removed.status, 0, removed.stderr);
  const saved = new RegExp(`local: saved (\\d+) table\\(s\\), (\\d+) row\\(s\\) in ${SAVED} before ${DROP.replaceAll('.', '\\.')}`).exec(removed.stdout);
  assert.ok(saved, removed.stdout);
  assert.equal(await value("select count(*)::int from information_schema.columns where table_name = 'removal_rehearsal' and column_name = 'note'"), 0);
  const tables = await value("select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public', 'private') and c.relkind in ('r', 'p') and not c.relispartition");
  assert.equal(Number(saved[1]), tables, 'every application table is copied');
  assert.deepEqual((await client.query(`select id, note from ${SAVED}.public__removal_rehearsal order by id`)).rows.map(row => `${row.id}:${row.note}`), expected);
  say(`3. save working: ${saved[0].replace('local: ', '')}, then the column was dropped`);

  write(RESTORE, `alter table public.removal_rehearsal add column note text;
do $$ begin
  if to_regclass('${SAVED}.public__removal_rehearsal') is not null then
    update public.removal_rehearsal set note = b.note from ${SAVED}.public__removal_rehearsal b where b.id = removal_rehearsal.id;
  end if;
end $$;
`);
  const restored = apply();
  assert.equal(restored.status, 0, restored.stderr);
  assert.deepEqual(await notes(), expected);
  say(`4. restore migration applied: ${(await notes()).join(', ')}`);
} finally {
  await client.query(`drop table if exists public.removal_rehearsal; drop schema if exists ${SAVED} cascade;`);
  await client.query("delete from migration_ledger.applied where filename like '99990101%'").catch(() => {});
  await client.query("delete from migration_ledger.removal_backups where filename like '99990101%'").catch(() => {});
  await client.end();
  rmSync(directory, { recursive: true, force: true });
}
say('removal rehearsal: refused without its save, saved, removed and restored');
