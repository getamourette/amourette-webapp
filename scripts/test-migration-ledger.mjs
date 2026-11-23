import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { DEVELOPMENT_PROJECT_REF } from './development-target.mjs';
import {
  LAST_LEGACY_MIGRATION, LedgerError, PRODUCTION_PROJECT_REF, applyMigrations, baselineMigrations, migrationStatus,
  ownsTransaction, readMigrations, targetRefusal,
} from './migration-ledger.mjs';

// #434: the ledger decides what reaches production, so its refusals are tested
// as much as its happy path. No shared database is used.
const directory = mkdtempSync(join(tmpdir(), 'ledger-'));
const write = (name, sql) => writeFileSync(join(directory, name), sql);
const remove = name => rmSync(join(directory, name));
const files = () => readMigrations(directory);
const adapter = pglite => ({ run: sql => pglite.exec(sql), query: (sql, params) => pglite.query(sql, params) });
const database = () => adapter(new PGlite());
const column = async (db, sql) => (await db.query(sql)).rows.map(row => Object.values(row)[0]);
const ledger = db => column(db, "select filename || ':' || git_ref || ':' || executed from migration_ledger.applied order by filename");
const main = { target: 'local', gitRef: 'main', commitSha: 'abc', runUrl: 'https://example.test/run/1' };
const branch = { ...main, gitRef: 'feature/x' };
const refuses = (promise, pattern) => assert.rejects(promise, error => error instanceof LedgerError && pattern.test(error.message));

try {
  // Applies in filename order, one transaction per file, and records each one.
  write('20270101000001_a.sql', 'create table a (id int);');
  write('20270101000002_b.sql', 'create table b (id int); insert into b values (1);');
  let db = database();
  assert.deepEqual((await migrationStatus(db, files(), 'local')).pending.map(file => file.filename), ['20270101000001_a.sql', '20270101000002_b.sql']);
  const log = [];
  await applyMigrations(db, files(), { ...main, log: line => log.push(line) });
  assert.deepEqual(log, ['applied 20270101000001_a.sql', 'applied 20270101000002_b.sql']);
  assert.deepEqual(await ledger(db), ['20270101000001_a.sql:main:true', '20270101000002_b.sql:main:true']);
  assert.deepEqual(await column(db, 'select commit_sha || run_url from migration_ledger.applied limit 1'), ['abchttps://example.test/run/1']);

  // A second run applies nothing and changes nothing.
  assert.equal((await applyMigrations(db, files(), main)).pending.length, 0);
  assert.deepEqual(await column(db, 'select count(*)::int from b'), [1]);

  // No API role can read the ledger.
  assert.deepEqual(await column(db, "select has_schema_privilege('public', 'migration_ledger', 'usage')"), [false]);

  // A failing file is rolled back whole, is not recorded, and stops the run.
  write('20270101000003_c.sql', 'create table c (id int); select 1/0;');
  write('20270101000004_d.sql', 'create table d (id int);');
  await refuses(applyMigrations(db, files(), main), /20270101000003_c\.sql failed and was rolled back: 22012/);
  assert.deepEqual(await column(db, "select to_regclass('c')::text is null and to_regclass('d')::text is null"), [true]);
  assert.equal((await ledger(db)).length, 2);
  // The connection is usable again and the corrected file then applies.
  write('20270101000003_c.sql', 'create table c (id int);');
  await applyMigrations(db, files(), main);
  assert.equal((await ledger(db)).length, 4);

  // A file edited after it was applied is refused before anything runs.
  write('20270101000001_a.sql', 'create table a (id bigint);');
  write('20270101000005_e.sql', 'create table e (id int);');
  await refuses(applyMigrations(db, files(), main), /20270101000001_a\.sql was edited after it was applied/);
  assert.deepEqual(await column(db, "select to_regclass('e')::text is null"), [true]);
  write('20270101000001_a.sql', 'create table a (id int);');
  remove('20270101000005_e.sql');

  // A new file that sorts before an applied one would replay in another order
  // on an empty database: refused.
  write('20270101000000_early.sql', 'create table early (id int);');
  await refuses(applyMigrations(db, files(), main), /20270101000000_early\.sql sorts before 20270101000004_d\.sql/);
  remove('20270101000000_early.sql');

  // A checkout that lacks a file applied from main is behind: refused.
  remove('20270101000004_d.sql');
  await refuses(migrationStatus(db, files(), 'local').then(plan => { if (plan.errors.length) throw new LedgerError(plan.errors.join('\n')); }), /20270101000004_d\.sql is applied from main but missing/);
  write('20270101000004_d.sql', 'create table d (id int);');

  // New migrations leave the transaction to the ledger.
  write('20270101000006_tx.sql', 'begin;\ncreate table tx (id int);\ncommit;');
  await refuses(applyMigrations(db, files(), main), /20270101000006_tx\.sql contains BEGIN, COMMIT or ROLLBACK/);
  remove('20270101000006_tx.sql');

  // Preview exception: a branch applies its file to development; the ledger
  // names it while main does not have it, then adopts it once merged.
  write('20270101000007_preview.sql', 'create table preview (id int);');
  await applyMigrations(db, files(), branch);
  assert.equal((await ledger(db)).at(-1), '20270101000007_preview.sql:feature/x:true');
  remove('20270101000007_preview.sql');
  const fromMain = await migrationStatus(db, files(), 'development');
  assert.deepEqual([fromMain.errors, fromMain.branchOnly.map(row => row.filename)], [[], ['20270101000007_preview.sql']]);
  // The same state in production is a defect: production holds main only.
  assert.match((await migrationStatus(db, files(), 'production')).errors[0], /recorded in production but is not in main/);
  // A later file merged first does not trip the order rule on the branch row.
  write('20270101000006_f.sql', 'create table f (id int);');
  await applyMigrations(db, files(), main);
  write('20270101000007_preview.sql', 'create table preview (id int);');
  assert.equal((await applyMigrations(db, files(), main)).pending.length, 0);
  assert.equal((await ledger(db)).at(-1), '20270101000007_preview.sql:main:true');

  // A hosted database never receives a removal, and a branch previewing on
  // development applies additive files only. A local stack takes everything.
  {
    const hosted = database();
    const dir = mkdtempSync(join(tmpdir(), 'ledger-kinds-'));
    writeFileSync(join(dir, '20270201000001_table.sql'), 'create table public.t (id int, label text);');
    await applyMigrations(hosted, readMigrations(dir), { ...main, target: 'development' });
    writeFileSync(join(dir, '20270201000002_change.sql'), 'alter table public.t alter column label set not null;');
    await refuses(applyMigrations(hosted, readMigrations(dir), { ...branch, target: 'development' }), /20270201000002_change\.sql is not purely additive: a branch applies additive migrations only/);
    await applyMigrations(hosted, readMigrations(dir), { ...main, target: 'development' });
    writeFileSync(join(dir, '20270201000003_drop.sql'), 'alter table public.t drop column label;');
    for (const target of ['development', 'production']) {
      await refuses(applyMigrations(hosted, readMigrations(dir), { ...main, target }), /20270201000003_drop\.sql removes, renames or is not recognised: it is not applied automatically/);
    }
    assert.deepEqual(await column(hosted, "select count(*)::int from information_schema.columns where table_name = 't' and column_name = 'label'"), [1]);
    assert.equal((await applyMigrations(hosted, readMigrations(dir), main)).pending.length, 1, 'a local stack applies a removal');
    rmSync(dir, { recursive: true });
  }

  // Legacy files that manage their own transaction still apply and are recorded.
  const legacy = mkdtempSync(join(tmpdir(), 'ledger-legacy-'));
  writeFileSync(join(legacy, '20260101000001_legacy.sql'), 'begin;\ncreate table legacy (id int);\ncommit;');
  db = database();
  await applyMigrations(db, readMigrations(legacy), main);
  assert.deepEqual(await ledger(db), ['20260101000001_legacy.sql:main:true']);
  rmSync(legacy, { recursive: true });

  // Baseline adopts an existing database: records without executing, once.
  db = database();
  await refuses(baselineMigrations(db, files(), { ...main, through: 'missing.sql' }), /--through must name an existing migration file/);
  assert.equal((await baselineMigrations(db, files(), { ...main, through: '20270101000002_b.sql' })).length, 2);
  assert.deepEqual(await ledger(db), ['20270101000001_a.sql:main:false', '20270101000002_b.sql:main:false']);
  assert.deepEqual(await column(db, "select to_regclass('a')::text is null"), [true]);
  await refuses(baselineMigrations(db, files(), { ...main, through: '20270101000002_b.sql' }), /The ledger is not empty/);
  // What follows the baseline is applied normally.
  assert.deepEqual((await applyMigrations(db, files(), main)).pending.map(file => file.filename),
    ['20270101000003_c.sql', '20270101000004_d.sql', '20270101000006_f.sql', '20270101000007_preview.sql']);

  // The connection string must designate the named target.
  const pooled = ref => `postgresql://postgres.${ref}:secret@aws-0-eu-west-3.pooler.supabase.com:5432/postgres`;
  const direct = ref => `postgresql://postgres:secret@db.${ref}.supabase.co:5432/postgres`;
  const actions = { GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/main' };
  assert.equal(targetRefusal('local', 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'), null);
  assert.match(targetRefusal('local', pooled(DEVELOPMENT_PROJECT_REF)), /loopback database only/);
  assert.equal(targetRefusal('development', pooled(DEVELOPMENT_PROJECT_REF)), null);
  assert.equal(targetRefusal('development', direct(DEVELOPMENT_PROJECT_REF)), null);
  assert.match(targetRefusal('development', pooled(PRODUCTION_PROJECT_REF)), /does not designate the development project/);
  assert.match(targetRefusal('development', 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'), /does not designate/);
  assert.match(targetRefusal('development', `postgresql://postgres.${DEVELOPMENT_PROJECT_REF}:secret@pooler.supabase.com.attacker.test/postgres`), /does not designate/);
  assert.equal(targetRefusal('production', pooled(PRODUCTION_PROJECT_REF), actions), null);
  assert.match(targetRefusal('production', pooled(DEVELOPMENT_PROJECT_REF), actions), /does not designate the production project/);
  assert.match(targetRefusal('production', pooled(PRODUCTION_PROJECT_REF), {}), /only by GitHub Actions on main/);
  assert.match(targetRefusal('production', pooled(PRODUCTION_PROJECT_REF), { ...actions, GITHUB_REF: 'refs/heads/feature/x' }), /only by GitHub Actions on main/);
  assert.match(targetRefusal('staging', pooled(PRODUCTION_PROJECT_REF), actions), /must be local, development or production/);
  assert.match(targetRefusal('local', 'not a url'), /not a valid URL/);
  assert.match(targetRefusal('local', 'https://127.0.0.1/'), /not a Postgres URL/);
  for (const refusal of [targetRefusal('development', pooled(PRODUCTION_PROJECT_REF)), targetRefusal('local', pooled(DEVELOPMENT_PROJECT_REF))]) {
    assert.doesNotMatch(refusal, /secret|pooler/, 'a refusal never quotes the connection string');
  }

  // The real directory: the legacy boundary exists and no later file manages
  // its own transaction.
  const real = readMigrations(fileURLToPath(new URL('../supabase/migrations', import.meta.url)));
  assert.ok(real.some(file => file.filename === LAST_LEGACY_MIGRATION));
  assert.deepEqual(real.filter(file => file.filename > LAST_LEGACY_MIGRATION && ownsTransaction(file.sql)).map(file => file.filename), []);

  // The command itself, on a real PostgreSQL server when one is offered (CI).
  const url = process.env.MIGRATION_LEDGER_TEST_DATABASE_URL;
  if (url) {
    const cli = (...args) => spawnSync(process.execPath, [fileURLToPath(new URL('./apply-migrations.mjs', import.meta.url)), ...args], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, MIGRATION_TARGET: 'local', MIGRATION_DATABASE_URL: url, MIGRATION_DIRECTORY: directory },
    });
    const reset = cli('status');
    assert.equal(reset.status, 0, reset.stderr);
    assert.match(reset.stdout, /local: 6 file\(s\) pending, 6 in the checkout/);
    const applied = cli('apply');
    assert.equal(applied.status, 0, applied.stderr);
    assert.match(applied.stdout, /local: applied 20270101000001_a\.sql\n[\s\S]*local: 6 file\(s\) applied/);
    assert.match(cli('apply').stdout, /local: 0 file\(s\) applied/);
    write('20270101000008_bad.sql', 'create table bad (id int); select 1/0;');
    const failed = cli('apply');
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /local: 20270101000008_bad\.sql failed and was rolled back: 22012/);
    assert.doesNotMatch(failed.stdout + failed.stderr, new RegExp(new URL(url).password || 'no-password-set'));
    assert.equal(cli('baseline', '--through', '20270101000001_a.sql').status, 1);
    assert.equal(cli('unknown').status, 1);
    // Only one run at a time holds a database.
    const { default: pg } = await import('pg');
    const holder = new pg.Client({ connectionString: url });
    await holder.connect();
    await holder.query('select pg_advisory_lock(434434)');
    assert.match(cli('status').stderr, /Another run is applying migrations/);
    await holder.end();
    assert.match(cli('status').stdout, /local: pending 20270101000008_bad\.sql/);
    process.stdout.write('migration ledger: command verified on PostgreSQL\n');
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
