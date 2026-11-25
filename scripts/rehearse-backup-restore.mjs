#!/usr/bin/env node

// Rehearses the daily production backup (#523) and its restore on disposable
// local databases, through the real command (scripts/database-backup.mjs).
//
//   prepare <dir>   on a database holding every migration: adds an account, a
//                   profile, a report, a sanction and a do-not-send address,
//                   records a fingerprint of every backed-up table, and makes
//                   an encrypted backup with a throwaway key. A backup without
//                   a valid public key is refused first.
//   verify <dir>    on another database freshly built from the migrations: a
//                   wrong key and a damaged file are refused with nothing
//                   restored, then the backup is restored and every table must
//                   match the fingerprint; a second restore is refused.
//
//   BACKUP_DATABASE_URL=postgresql://…@127.0.0.1:54322/postgres node scripts/rehearse-backup-restore.mjs prepare <dir>
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { BACKED_UP_SCHEMAS, SKIPPED_TABLES } from './database-backup.mjs';
import { targetRefusal } from './migration-ledger.mjs';

const [phase, directory] = process.argv.slice(2);
if (!['prepare', 'verify'].includes(phase) || !directory) {
  process.stderr.write('Usage: node scripts/rehearse-backup-restore.mjs prepare|verify <dir>\n');
  process.exit(2);
}
const url = process.env.BACKUP_DATABASE_URL;
const refusal = url ? targetRefusal('local', url) : 'Set BACKUP_DATABASE_URL.';
if (refusal) {
  process.stderr.write(`${refusal}\n`);
  process.exit(1);
}

mkdirSync(directory, { recursive: true });
const file = name => join(directory, name);
const BACKUP = file('backup.sql.age');
const MARKER = 'backup-rehearsal@example.com';
const say = line => process.stdout.write(`${line}\n`);
const command = (args, env = {}) => spawnSync(process.execPath, [fileURLToPath(new URL('./database-backup.mjs', import.meta.url)), ...args], {
  encoding: 'utf8',
  env: { PATH: process.env.PATH, BACKUP_TARGET: 'local', BACKUP_DATABASE_URL: url, ...env },
});

const client = new pg.Client({ connectionString: url });
await client.connect();
const value = async (sql, params) => Object.values((await client.query(sql, params)).rows[0] ?? {})[0];

// Rows and an md5 of every row of each backed-up table, in a stable order.
async function fingerprint() {
  const tables = (await client.query(
    `select format('%I.%I', n.nspname, c.relname) as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = any($1) and c.relkind in ('r', 'p') and not c.relispartition and format('%s.%s', n.nspname, c.relname) <> all($2)
     order by 1`, [BACKED_UP_SCHEMAS, SKIPPED_TABLES])).rows.map(row => row.name);
  const result = {};
  for (const table of tables) {
    const { rows } = await client.query(`select count(*)::int as rows, coalesce(md5(string_agg(t::text, E'\\n' order by t::text)), '') as md5 from ${table} t`);
    result[table] = rows[0];
  }
  return result;
}
const differences = (expected, actual) => Object.keys({ ...expected, ...actual })
  .filter(table => JSON.stringify(expected[table]) !== JSON.stringify(actual[table]));
const accounts = () => value('select (select count(*) from auth.users) + (select count(*) from public.profiles)').then(Number);

try {
  if (phase === 'prepare') {
    assert.ok(!existsSync(BACKUP), `${BACKUP} already exists`);
    await client.query('begin');
    const [reporter, reported, founder] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    await client.query(`insert into auth.users (id, aud, role, email, is_anonymous) values
      ($1, 'authenticated', 'authenticated', null, true), ($2, 'authenticated', 'authenticated', null, true), ($3, 'authenticated', 'authenticated', $4, false)`,
    [reporter, reported, founder, MARKER]);
    await client.query(`insert into public.profiles (id, first_name, bio) values
      ($1, 'Rehearsal', 'Kept by the daily backup'), ($2, 'Reported', null)`, [reporter, reported]);
    const night = (await client.query('select id, venue_id from public.venue_nights order by id limit 1')).rows[0];
    assert.ok(night, 'the migrations seed at least one venue night');
    await client.query(`insert into public.reports (reporter_id, reported_id, venue_id, venue_night_id, reason)
      values ($1, $2, $3, $4, 'harassment')`, [reporter, reported, night.venue_id, night.id]);
    await client.query(`insert into public.venue_ejections (profile_id, venue_id, night, reason, created_by, venue_night_id)
      values ($1, $2, current_date, 'harassment', $3, $4)`, [reported, night.venue_id, founder, night.id]);
    await client.query("insert into public.email_suppressions (email, reason, suppressed_at) values ('suppressed-rehearsal@example.com', 'complaint', now())");
    await client.query('commit');
    const source = await fingerprint();
    const filled = Object.values(source).filter(entry => entry.rows > 0).length;
    writeFileSync(file('source.json'), `${JSON.stringify(source, null, 2)}\n`);
    say(`1. source: ${Object.keys(source).length} backed-up table(s), ${filled} holding rows (an account, two profiles, a report, a sanction, a do-not-send address, seeded venues)`);

    writeFileSync(file('no-key.txt'), '# no key yet\n');
    const noKey = command(['dump', BACKUP], { BACKUP_RECIPIENTS_FILE: file('no-key.txt') });
    assert.equal(noKey.status, 1, noKey.stdout);
    assert.match(noKey.stderr, /No age public key: set the BACKUP_AGE_RECIPIENTS secret/);
    assert.ok(!existsSync(BACKUP), 'no file is written without a key');
    say(`2. no public key: refused, no file written`);
    say(`   ${noKey.stderr.trim()}`);

    const keygen = spawnSync('age-keygen', ['-o', file('key.txt')], { encoding: 'utf8' });
    assert.equal(keygen.status, 0, keygen.stderr);
    const publicKey = /age1[0-9a-z]+/.exec(readFileSync(file('key.txt'), 'utf8'))[0];
    const secret = readFileSync(file('key.txt'), 'utf8').split('\n').find(line => line.startsWith('AGE-SECRET-KEY-'));
    writeFileSync(file('private-as-public.txt'), `${secret}\n`);
    const pasted = command(['dump', BACKUP], { BACKUP_RECIPIENTS_FILE: file('private-as-public.txt') });
    assert.equal(pasted.status, 1);
    assert.match(pasted.stderr, /holds a private key/);
    assert.ok(!pasted.stderr.includes(secret.slice(15)), 'the private key is not repeated');
    assert.ok(!existsSync(BACKUP));
    say('3. a private key pasted in place of the public key: refused without repeating it, no file written');

    writeFileSync(file('recipients.txt'), `# throwaway rehearsal key\n${publicKey}\n`);
    const unreachable = command(['dump', BACKUP], { BACKUP_RECIPIENTS_FILE: file('recipients.txt'), BACKUP_DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:1/postgres' });
    assert.equal(unreachable.status, 1);
    assert.match(unreachable.stderr, /pg_dump failed \(1\)/);
    assert.ok(!existsSync(BACKUP), 'a failed dump leaves no file behind');
    say('4. database unreachable: pg_dump fails, the partial file is removed');
    say(`   ${unreachable.stderr.trim()}`);

    const made = command(['dump', BACKUP], { BACKUP_RECIPIENTS_FILE: file('recipients.txt') });
    assert.equal(made.status, 0, made.stderr);
    const tables = Number(/backed up (\d+) table\(s\)/.exec(made.stdout)?.[1]);
    assert.equal(tables, Object.keys(source).length, 'every backed-up table is in the dump');
    const encrypted = readFileSync(BACKUP);
    assert.ok(encrypted.subarray(0, 21).toString() === 'age-encryption.org/v1');
    for (const plain of [MARKER, 'Kept by the daily backup', 'suppressed-rehearsal@example.com', 'COPY ']) {
      assert.ok(!encrypted.includes(plain), `the backup file does not contain "${plain}" in clear`);
    }
    say(`5. backup: ${made.stdout.trim()}; no row is readable in the file without the key`);
  } else {
    const source = JSON.parse(readFileSync(file('source.json'), 'utf8'));
    assert.equal(await accounts(), 0, 'the target is freshly built from the migrations');
    const empty = await fingerprint();

    rmSync(file('other-key.txt'), { force: true });
    const other = spawnSync('age-keygen', ['-o', file('other-key.txt')], { encoding: 'utf8' });
    assert.equal(other.status, 0, other.stderr);
    const wrongKey = command(['restore', BACKUP], { BACKUP_IDENTITY_FILE: file('other-key.txt') });
    assert.equal(wrongKey.status, 1);
    assert.match(wrongKey.stderr, /age could not decrypt the backup .*Nothing was restored\./);
    assert.deepEqual(differences(empty, await fingerprint()), []);
    say('6. wrong private key: refused, the target untouched');
    say(`   ${wrongKey.stderr.trim()}`);

    const bytes = readFileSync(BACKUP);
    writeFileSync(file('damaged.sql.age'), bytes.subarray(0, bytes.length - 64));
    const damaged = command(['restore', file('damaged.sql.age')], { BACKUP_IDENTITY_FILE: file('key.txt') });
    assert.equal(damaged.status, 1);
    assert.match(damaged.stderr, /Nothing was restored\.|rolled back/);
    assert.deepEqual(differences(empty, await fingerprint()), []);
    say('7. damaged file (last 64 bytes cut): refused, the target untouched');
    say(`   ${damaged.stderr.trim()}`);

    const restored = command(['restore', BACKUP], { BACKUP_IDENTITY_FILE: file('key.txt') });
    assert.equal(restored.status, 0, restored.stderr);
    const after = await fingerprint();
    assert.deepEqual(differences(source, after), [], 'every backed-up table holds exactly the source rows');
    assert.equal(await value('select count(*)::int from public.reports'), 1);
    assert.equal(await value('select count(*)::int from public.venue_ejections'), 1);
    assert.equal(await value("select count(*)::int from public.email_suppressions where email = 'suppressed-rehearsal@example.com'"), 1);
    assert.equal(await value('select count(*)::int from auth.users where email = $1', [MARKER]), 1);
    say(`8. restore: ${restored.stdout.trim()}; all ${Object.keys(after).length} table(s) match the source row for row (account, profiles, report, sanction, do-not-send address)`);

    const again = command(['restore', BACKUP], { BACKUP_IDENTITY_FILE: file('key.txt') });
    assert.equal(again.status, 1);
    assert.match(again.stderr, /already holds accounts or profiles/);
    assert.deepEqual(differences(source, await fingerprint()), []);
    say('9. restore into a database that holds accounts: refused, rolled back, rows unchanged');

    // The comparison itself catches a lost or changed row.
    await client.query('begin');
    await client.query('delete from public.email_suppressions');
    const broken = differences(source, await fingerprint());
    await client.query('rollback');
    assert.deepEqual(broken, ['public.email_suppressions']);
    say('10. check of the check: with the do-not-send row deleted, the comparison reports public.email_suppressions');
    say('backup rehearsal: refused without a key, encrypted, refused with a wrong key or a damaged file, restored row for row');
  }
} finally {
  await client.end();
}
