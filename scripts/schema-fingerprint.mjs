#!/usr/bin/env node

// Catalog comparison for the production runbook (#280, SEC-018).
//
//   node scripts/schema-fingerprint.mjs dump <project-ref> <out.json>
//   node scripts/schema-fingerprint.mjs diff <a.json> <b.json> [category…]
//
// `dump` reads catalogs only, through the Supabase Management API in read-only
// mode, with the personal access token in SUPABASE_ACCESS_TOKEN. It reads no
// application row and no secret value (Vault names only). `diff` is offline.
import { readFileSync, writeFileSync } from 'node:fs';

const APP = "n.nspname in ('public','private')";
const ROLE = "case when g.grantee = 0 then 'PUBLIC' else g.grantee::regrole::text end";
const QUERIES = {
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
  // Data privileges only: MAINTAIN, TRUNCATE, REFERENCES and TRIGGER left by old
  // default grants are unreachable through the Data API.
  table_grants: `select n.nspname||'.'||c.relname||'>'||${ROLE} k, string_agg(g.privilege_type, ',' order by g.privilege_type) v from pg_class c join pg_namespace n on n.oid=c.relnamespace, aclexplode(c.relacl) g where ${APP} and c.relkind in ('r','p','v','m','S') and g.privilege_type in ('SELECT','INSERT','UPDATE','DELETE','USAGE') and (g.grantee = 0 or g.grantee::regrole::text in ('anon','authenticated','service_role')) group by 1`,
  column_grants: `select n.nspname||'.'||c.relname||'.'||a.attname||'>'||g.grantee::regrole::text||'>'||g.privilege_type k, '' v from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace, aclexplode(a.attacl) g where ${APP} and a.attacl is not null`,
  realtime_publication: "select schemaname||'.'||tablename k, '' v from pg_publication_tables where pubname = 'supabase_realtime'",
  buckets: "select id k, 'public='||public||'|'||coalesce(file_size_limit::text,'')||'|'||coalesce(array_to_string(allowed_mime_types,','),'') v from storage.buckets",
  cron_jobs: "select jobname k, schedule||'|'||active||'|'||command v from cron.job",
  vault_secret_names: "select name k, '' v from vault.secrets",
  seed_rows: "select 'venues' k, count(*)::text v from public.venues union all select 'test venues', count(*)::text from public.venues where is_test_venue union all select 'admins', count(*)::text from public.admins union all select 'profiles', count(*)::text from public.profiles union all select 'auth users', count(*)::text from auth.users",
};

const [command, ...args] = process.argv.slice(2);
if (command === 'dump' && args.length === 2) await dump(...args);
else if (command === 'diff' && args.length >= 2) diff(...args);
else {
  process.stderr.write('Usage: schema-fingerprint.mjs dump <project-ref> <out.json> | diff <a.json> <b.json> [category…]\n');
  process.exit(1);
}

async function dump(ref, out) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('Set SUPABASE_ACCESS_TOKEN to a Supabase personal access token.');
  if (!/^[a-z]{20}$/.test(ref)) throw new Error('The project ref is 20 lowercase letters.');
  const result = {};
  for (const [name, query] of Object.entries(QUERIES)) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, read_only: true }),
    });
    const rows = await response.json();
    if (!response.ok || !Array.isArray(rows)) throw new Error(`${name}: ${rows?.message ?? response.status}`);
    result[name] = Object.fromEntries(rows.map(row => [row.k, row.v]).sort(([a], [b]) => a.localeCompare(b)));
  }
  writeFileSync(out, `${JSON.stringify(result, null, 1)}\n`);
  process.stdout.write(`${ref}: ${Object.entries(result).map(([name, rows]) => `${name} ${Object.keys(rows).length}`).join(', ')}\n`);
}

function diff(left, right, ...only) {
  const a = JSON.parse(readFileSync(left, 'utf8'));
  const b = JSON.parse(readFileSync(right, 'utf8'));
  // Whitespace, redundant casts and schema qualification depend on the server
  // version and search path, not on the schema.
  const normal = value => String(value).replace(/\s+/g, ' ').replace(/::text|::character varying|extensions\./g, '').replace(/[()]/g, '').toLowerCase();
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
