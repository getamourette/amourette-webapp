#!/usr/bin/env node

// Catalog comparison for the production runbook (#280, SEC-018).
//
//   node scripts/schema-fingerprint.mjs dump <project-ref> <out.json>
//   node scripts/schema-fingerprint.mjs dump-database <out.json>
//   node scripts/schema-fingerprint.mjs diff <a.json> <b.json> [category…]
//   node scripts/schema-fingerprint.mjs check <a.json> <b.json> <allowed.json>
//
// `dump` reads catalogs only, through the Supabase Management API in read-only
// mode, with the personal access token in SUPABASE_ACCESS_TOKEN. It reads no
// application row and no secret value (Vault names only). `dump-database` (#434)
// reads the same catalogs over a Postgres connection, in a read-only
// transaction, from the database that MIGRATION_TARGET and
// MIGRATION_DATABASE_URL designate; it skips the row counts, so its output
// holds nothing that is not derived from the public migrations. `diff` and
// `check` are offline; `check` fails on a difference the allowed file does not
// record, as { "<category>": { "<key or *>": "<reason>" } }.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const APP = "n.nspname in ('public','private')";
const ROLE = "case when g.grantee = 0 then 'PUBLIC' else g.grantee::regrole::text end";
export const QUERIES = {
  extensions: 'select extname k, extversion v from pg_extension',
  tables: `select n.nspname||'.'||c.relname k, 'rls='||c.relrowsecurity v from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and ${APP}`,
  columns: `select table_schema||'.'||table_name||'.'||column_name k, data_type||'|'||is_nullable||'|'||coalesce(column_default,'') v from information_schema.columns c join pg_namespace n on n.nspname=c.table_schema where ${APP}`,
  // Not-null constraints are catalog rows from Postgres 18 on; columns cover them.
  constraints: `select n.nspname||'.'||c.relname||'.'||con.conname k, pg_get_constraintdef(con.oid) v from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where ${APP} and con.contype <> 'n'`,
  indexes: `select schemaname||'.'||indexname k, indexdef v from pg_indexes i join pg_namespace n on n.nspname=i.schemaname where ${APP}`,
  functions: `select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' k, p.prosecdef||'|'||coalesce(array_to_string(p.proconfig,','),'')||'|'||pg_get_functiondef(p.oid) v from pg_proc p join pg_namespace n on n.oid=p.pronamespace where ${APP} and p.prokind in ('f','p') and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')`,
  function_grants: `select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' k, string_agg(${ROLE}, ',' order by ${ROLE}) v from pg_proc p join pg_namespace n on n.oid=p.pronamespace, aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) g where ${APP} and (g.grantee = 0 or g.grantee::regrole::text in ('anon','authenticated','service_role')) group by 1`,
  policies: `select schemaname||'.'||tablename||'.'||policyname k, cmd||'|'||array_to_string(roles,',')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'') v from pg_policies where schemaname in ('public','private','storage','realtime')`,
  triggers: `select n.nspname||'.'||c.relname||'.'||t.tgname k, pg_get_triggerdef(t.oid) v from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in ('public','private','auth')`,
  // Every privilege, not only the data ones: the platform default also grants
  // TRUNCATE, REFERENCES, TRIGGER and MAINTAIN, and RLS cannot guard TRUNCATE.
  table_grants: `select n.nspname||'.'||c.relname||'>'||${ROLE} k, string_agg(g.privilege_type, ',' order by g.privilege_type) v from pg_class c join pg_namespace n on n.oid=c.relnamespace, aclexplode(c.relacl) g where ${APP} and c.relkind in ('r','p','v','m','S') and (g.grantee = 0 or g.grantee::regrole::text in ('anon','authenticated','service_role')) group by 1`,
  column_grants: `select n.nspname||'.'||c.relname||'.'||a.attname||'>'||g.grantee::regrole::text||'>'||g.privilege_type k, '' v from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace, aclexplode(a.attacl) g where ${APP} and a.attacl is not null`,
  default_privileges: "select defaclrole::regrole::text||'>'||coalesce(nullif(defaclnamespace,0)::regnamespace::text,'*')||'>'||defaclobjtype::text k, defaclacl::text v from pg_default_acl where defaclrole::regrole::text = 'postgres' and (defaclnamespace = 0 or defaclnamespace::regnamespace::text in ('public','private'))",
  realtime_publication: "select schemaname||'.'||tablename k, '' v from pg_publication_tables where pubname = 'supabase_realtime'",
  buckets: "select id k, 'public='||public||'|'||coalesce(file_size_limit::text,'')||'|'||coalesce(array_to_string(allowed_mime_types,','),'') v from storage.buckets",
  cron_jobs: "select jobname k, schedule||'|'||active||'|'||command v from cron.job",
  vault_secret_names: "select name k, '' v from vault.secrets",
  seed_rows: "select 'venues' k, count(*)::text v from public.venues union all select 'test venues', count(*)::text from public.venues where is_test_venue union all select 'admins', count(*)::text from public.admins union all select 'profiles', count(*)::text from public.profiles union all select 'auth users', count(*)::text from auth.users",
};

// Whitespace, redundant casts and schema qualification depend on the server
// version and search path, not on the schema.
const normal = value => String(value).replace(/\s+/g, ' ').replace(/::text|::character varying|extensions\./g, '').replace(/[()]/g, '').toLowerCase();

// `query(sql)` resolves to rows of { k, v }.
export async function fingerprint(query, categories = Object.keys(QUERIES)) {
  const result = {};
  for (const name of categories) {
    const rows = await query(QUERIES[name], name);
    result[name] = Object.fromEntries(rows.map(row => [row.k, row.v]).sort(([a], [b]) => a.localeCompare(b)));
  }
  return result;
}

// Categories present in both fingerprints are compared; `side` says where a
// key exists, or that its definition differs.
export function differences(a, b) {
  const found = [];
  for (const category of Object.keys(QUERIES)) {
    if (!(category in a) || !(category in b)) continue;
    const A = a[category], B = b[category];
    for (const key of Object.keys(A)) {
      if (!(key in B)) found.push({ category, key, side: 'first only' });
      else if (normal(A[key]) !== normal(B[key])) found.push({ category, key, side: 'different' });
    }
    for (const key of Object.keys(B)) if (!(key in A)) found.push({ category, key, side: 'second only' });
  }
  return found;
}

export const unexpected = (found, allowed) => found.filter(({ category, key }) => !(allowed[category]?.[key] ?? allowed[category]?.['*']));

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'dump' && args.length === 2) await dump(...args);
  else if (command === 'dump-database' && args.length === 1) await dumpDatabase(...args);
  else if (command === 'diff' && args.length >= 2) diff(...args);
  else if (command === 'check' && args.length === 3) check(...args);
  else {
    process.stderr.write('Usage: schema-fingerprint.mjs dump <project-ref> <out.json> | dump-database <out.json> | diff <a.json> <b.json> [category…] | check <a.json> <b.json> <allowed.json>\n');
    process.exit(1);
  }
}

const summary = result => Object.entries(result).map(([name, rows]) => `${name} ${Object.keys(rows).length}`).join(', ');

async function dump(ref, out) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('Set SUPABASE_ACCESS_TOKEN to a Supabase personal access token.');
  if (!/^[a-z]{20}$/.test(ref)) throw new Error('The project ref is 20 lowercase letters.');
  const result = await fingerprint(async (query, name) => {
    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, read_only: true }),
    });
    const rows = await response.json();
    if (!response.ok || !Array.isArray(rows)) throw new Error(`${name}: ${rows?.message ?? response.status}`);
    return rows;
  });
  writeFileSync(out, `${JSON.stringify(result, null, 1)}\n`);
  process.stdout.write(`${ref}: ${summary(result)}\n`);
}

async function dumpDatabase(out) {
  const { default: pg } = await import('pg');
  const { targetRefusal } = await import('./migration-ledger.mjs');
  const target = process.env.MIGRATION_TARGET;
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error('Set MIGRATION_DATABASE_URL.');
  const refusal = targetRefusal(target, connectionString, process.env);
  if (refusal) throw new Error(refusal);
  const ca = process.env.MIGRATION_DATABASE_CA_FILE;
  const client = new pg.Client({ connectionString, ssl: target === 'local' ? false : { ca: ca ? readFileSync(ca, 'utf8') : undefined } });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(`${target}: could not connect (${error.code ?? 'unknown error'}).`);
  }
  try {
    await client.query('begin transaction read only');
    // No row count: the output is derived from the public migrations alone.
    const result = await fingerprint(async (query, name) => {
      try {
        return (await client.query(query)).rows;
      } catch (error) {
        throw new Error(`${target}: ${name} could not be read (${error.code ?? 'unknown error'}).`);
      }
    }, Object.keys(QUERIES).filter(name => name !== 'seed_rows'));
    writeFileSync(out, `${JSON.stringify(result, null, 1)}\n`);
    process.stdout.write(`${target}: ${summary(result)}\n`);
  } finally {
    await client.end().catch(() => {});
  }
}

function check(left, right, allowedFile) {
  const found = differences(JSON.parse(readFileSync(left, 'utf8')), JSON.parse(readFileSync(right, 'utf8')));
  const refused = unexpected(found, JSON.parse(readFileSync(allowedFile, 'utf8')));
  process.stdout.write(`${found.length} difference(s), ${found.length - refused.length} recorded, ${refused.length} unexpected\n`);
  for (const { category, key, side } of refused) process.stdout.write(`  ${category}: ${key} (${side})\n`);
  if (refused.length) process.exitCode = 1;
}

function diff(left, right, ...only) {
  const a = JSON.parse(readFileSync(left, 'utf8'));
  const b = JSON.parse(readFileSync(right, 'utf8'));
  let differences = 0;
  for (const name of Object.keys(QUERIES)) {
    if (only.length && !only.includes(name)) continue;
    const A = a[name] ?? {}, B = b[name] ?? {};
    const onlyA = Object.keys(A).filter(key => !(key in B));
    const onlyB = Object.keys(B).filter(key => !(key in A));
    const changed = Object.keys(A).filter(key => key in B && normal(A[key]) !== normal(B[key]));
    differences += onlyA.length + onlyB.length + changed.length;
    process.stdout.write(`\n${name}: ${Object.keys(A).length} / ${Object.keys(B).length}, only first ${onlyA.length}, only second ${onlyB.length}, different ${changed.length}\n`);
    for (const key of onlyA) process.stdout.write(`  - ${key}\n`);
    for (const key of onlyB) process.stdout.write(`  + ${key}\n`);
    for (const key of changed) {
      const detail = only.length ? `\n      first:  ${A[key]}\n      second: ${B[key]}` : '';
      process.stdout.write(`  ~ ${key}${detail}\n`);
    }
  }
  process.stdout.write(`\n${differences} difference(s)\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
