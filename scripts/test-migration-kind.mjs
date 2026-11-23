import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { assessMigrations, report } from './check-migrations.mjs';
import { ADDITIVE, BEHAVIOUR, REMOVAL, classifyMigration, splitStatements } from './migration-kind.mjs';

// #434: what a migration may do to the code already live decides how it ships.
// A wrong "additive" verdict is the dangerous direction, so refusals and the
// conservative default are tested as much as the recognised forms.
const earlier = `
  create table public.venues (id uuid primary key, name text);
  create function public.check_in(p_venue uuid, p_code text default null) returns void language sql as $$ select $$;
  create function private.helper() returns int language sql as $$ select 1 $$;
`;
const kind = sql => classifyMigration(sql, earlier).kind;
const removed = sql => classifyMigration(sql, earlier).removed;

// The splitter keeps quoted text and bodies whole and drops comments.
assert.deepEqual(splitStatements("select ';'; -- a; b\n/* c; d */ create function f() returns text as $fn$ begin return ';'; end $fn$; select $$;$$"),
  ["select ';'", "create function f() returns text as $fn$ begin return ';'; end $fn$", 'select $$;$$']);

// Kind 1: only new objects, and anything done to them in the same file.
assert.equal(kind(`
  create table public.tickets (id uuid primary key, venue_id uuid references public.venues(id));
  alter table public.tickets enable row level security;
  create policy tickets_read on public.tickets for select to authenticated using (true);
  grant select on public.tickets to authenticated;
  create unique index tickets_venue on public.tickets (venue_id);
  create trigger tickets_touch before update on public.tickets for each row execute function private.helper();
  create function public.count_tickets(p_venue uuid) returns int language sql as $$ select 1 $$;
  revoke all on function public.count_tickets(uuid) from public;
  grant execute on function public.count_tickets(uuid) to authenticated;
  alter table public.venues add column capacity int;
  alter table public.venues add column if not exists label text not null default '';
  create index venues_name on public.venues (name);
  comment on table public.tickets is 'x';
  notify pgrst, 'reload schema';
`), ADDITIVE);

// Kind 2: an existing object behaves differently, nothing is removed.
for (const sql of [
  'create or replace function public.check_in(p_venue uuid, p_code text default null) returns void language sql as $$ select $$;',
  // Dropped and recreated with the same arguments, for a new return type.
  'drop function if exists public.check_in(uuid, text); create function public.check_in(p_venue uuid, p_code text) returns jsonb language sql as $$ select $$;',
  'drop function public.check_in; create function public.check_in(p_venue uuid, p_code text default null) returns jsonb language sql as $$ select $$;',
  'grant select on public.venues to authenticated;',
  'revoke execute on function private.helper() from public;',
  'create policy venues_read on public.venues for select to authenticated using (true);',
  'drop policy if exists venues_read on public.venues;',
  'alter table public.venues enable row level security;',
  'alter table public.venues add constraint venues_name_length check (char_length(name) < 80);',
  'alter table public.venues drop constraint venues_name_length, add constraint venues_name_length check (char_length(name) < 90);',
  // Unnamed table constraints are constraints, not columns named "unique" or "check".
  'alter table public.venues add unique (name);',
  "alter table public.venues add check (name <> '');",
  'alter table public.venues add foreign key (id) references public.venues (id);',
  'alter table public.venues add primary key (id);',
  'alter table public.venues add column owner uuid not null;',
  'alter table public.venues alter column name set not null;',
  'create unique index venues_unique_name on public.venues (name);',
  'create trigger venues_touch before update on public.venues for each row execute function private.helper();',
  "update public.venues set name = 'x' where name is null;",
  "select cron.schedule('job', '* * * * *', $$select 1$$);",
  'do $$ begin update public.venues set name = name; end $$;',
]) assert.equal(kind(sql), BEHAVIOUR, sql);

// Kind 3: removed, renamed, retyped, re-signed, or not recognised.
assert.deepEqual(removed('alter table public.venues drop column name, add column title text;'), ['name']);
assert.deepEqual(removed('alter table public.venues rename column name to title;'), ['name']);
assert.deepEqual(removed('alter table public.venues rename to places;'), ['venues']);
assert.deepEqual(removed('alter table public.venues alter column name type varchar(80);'), ['name']);
assert.deepEqual(removed('drop table public.venues;'), ['venues']);
assert.deepEqual(removed('drop function public.check_in(uuid, text);'), ['check_in']);
assert.deepEqual(removed('alter function private.helper() rename to helper_v2;'), ['private.helper']);
assert.deepEqual(removed('alter table public.venues drop constraint venues_name_length;'), ['venues_name_length']);
// `create table if not exists` on a table an earlier migration created makes
// nothing new: what follows alters the existing table.
assert.deepEqual(removed('create table if not exists public.venues (id uuid); alter table public.venues drop column name;'), ['name']);
assert.equal(kind('create table if not exists public.venues (id uuid); alter table public.venues enable row level security;'), BEHAVIOUR);
assert.equal(kind('create table if not exists public.venues (id uuid);'), ADDITIVE);
assert.equal(kind('create table if not exists public.fresh (id uuid, label text); alter table public.fresh drop column label;'), ADDITIVE);
// New arguments under an existing name break the calls the live code makes.
assert.deepEqual(removed('create or replace function public.check_in(p_venue uuid, p_code text, p_seat int) returns void language sql as $$ select $$;'), ['check_in']);
assert.deepEqual(removed('drop function public.check_in(uuid, text); create function public.check_in(p_venue uuid) returns void language sql as $$ select $$;'), ['check_in']);
assert.deepEqual(removed('create or replace function public.check_in(p_place uuid, p_code text default null) returns void language sql as $$ select $$;'), ['check_in'], 'a renamed argument is another RPC contract');
for (const sql of [
  "do $$ begin execute 'drop table public.venues'; end $$;",
  'alter extension btree_gist set schema extensions;',
  'vacuum public.venues;',
  'alter type public.mood add value $$calm$$;',
]) assert.equal(kind(sql), REMOVAL, sql);

// The classification of the whole history is stable and never throws.
const directory = new URL('../supabase/migrations/', import.meta.url);
let history = '';
const counts = { [ADDITIVE]: 0, [BEHAVIOUR]: 0, [REMOVAL]: 0 };
for (const file of readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) {
  const sql = readFileSync(new URL(file, directory), 'utf8');
  counts[classifyMigration(sql, history).kind] += 1;
  history += `\n${sql}`;
}
assert.ok(counts[ADDITIVE] && counts[BEHAVIOUR] && counts[REMOVAL]);
// 20261123000001 replaces three functions with the same arguments.
assert.equal(classifyMigration(readFileSync(new URL('20261123000001_launch_arrival_early_window.sql', directory), 'utf8'),
  history.slice(0, history.lastIndexOf('\n'))).kind <= BEHAVIOUR, true);

// The pull request decision.
const existing = ['20270101000001_base.sql'];
const sources = { 'supabase/migrations/20270101000001_base.sql': earlier };
const assess = (files, extra = {}) => assessMigrations({
  changes: Object.keys(files).map(path => ({ status: 'A', path })).concat(extra.changes ?? []),
  existing,
  read: path => ({ ...sources, ...files })[path],
  uses: extra.uses ?? (() => []),
  lastUseChange: extra.lastUseChange ?? (() => null),
  removalsAccepted: extra.removalsAccepted ?? true,
  now: Date.parse('2027-01-10T00:00:00Z'),
});
const next = 'supabase/migrations/20270102000001_next.sql';
const code = { status: 'M', path: 'lib/venues.ts' };

assert.deepEqual(assess({}), { kind: 0, files: [], removals: [], errors: [], liveCode: false });
assert.equal(report(assess({})), 'No new migration.\n');

// Additive: ships with its code, nothing asked.
let result = assess({ [next]: 'alter table public.venues add column capacity int;' }, { changes: [code] });
assert.deepEqual([result.kind, result.errors, result.liveCode], [ADDITIVE, [], false]);

// Behaviour with code: the live code gets its own browser run.
const replace = 'create or replace function public.check_in(p_venue uuid, p_code text default null) returns void language sql as $$ select $$;';
result = assess({ [next]: replace }, { changes: [code] });
assert.deepEqual([result.kind, result.errors, result.liveCode], [BEHAVIOUR, [], true]);
assert.match(report(result), /\*\*behaviour\*\*[\s\S]*replaces an existing function with the same arguments[\s\S]*Live code on the new schema/);
// Behaviour alone, with docs and generated types: the normal suite is that run.
result = assess({ [next]: replace }, { changes: [{ status: 'M', path: 'docs/roadmap.md' }, { status: 'M', path: 'lib/database.types.ts' }] });
assert.deepEqual([result.errors, result.liveCode], [[], false]);

// Removal: alone, unused, and unused for 24 hours.
const drop = 'alter table public.venues drop column name;';
result = assess({ [next]: drop });
assert.deepEqual([result.kind, result.errors], [REMOVAL, []]);
assert.match(report(result), /Search for `name`[\s\S]*0 line\(s\)[\s\S]*Never named in the application code of main/);
assert.match(assess({ [next]: drop }, { changes: [code] }).errors[0], /ships alone[\s\S]*lib\/venues\.ts/);
result = assess({ [next]: drop }, { uses: () => ['lib/venues.ts:4:  .select("id, name")'] });
assert.match(result.errors[0], /name is still named in application code \(1 line/);
assert.match(report(result), /lib\/venues\.ts:4/);
const hoursAgo = hours => () => Date.parse('2027-01-10T00:00:00Z') - hours * 3_600_000;
assert.match(assess({ [next]: drop }, { lastUseChange: hoursAgo(23) }).errors[0], /left the application code 23\.0 h ago: wait 24 h/);
assert.deepEqual(assess({ [next]: drop }, { lastUseChange: hoursAgo(24) }).errors, []);
// An unrecognised statement has no name to search but still ships alone.
assert.match(assess({ [next]: 'vacuum public.venues;' }, { changes: [code] }).errors[0], /ships alone/);
assert.deepEqual(assess({ [next]: 'vacuum public.venues;' }).errors, []);

// Until the pre-removal backup exists, a removal is refused in the pull request.
assert.match(assess({ [next]: drop }, { removalsAccepted: false }).errors[0], /is not accepted yet/);
assert.deepEqual(assess({ [next]: replace }, { changes: [code], removalsAccepted: false }).errors, []);

// Refused whatever the kind.
assert.match(assessMigrations({ changes: [{ status: 'M', path: 'supabase/migrations/20270101000001_base.sql' }], existing, read: path => sources[path], uses: () => [], lastUseChange: () => null }).errors[0], /never edited or deleted/);
assert.match(assess({ 'supabase/migrations/20270101000000_early.sql': 'create table public.early (id int);' }).errors[0], /sorts before 20270101000001_base\.sql/);
assert.match(assess({ [next]: 'begin;\ncreate table public.t (id int);\ncommit;' }).errors[0], /contains BEGIN, COMMIT or ROLLBACK/);
// Two files in one pull request: the second sees what the first created.
result = assess({ [next]: 'create table public.tickets (id int);', 'supabase/migrations/20270102000002_more.sql': 'grant select on public.tickets to authenticated;' });
assert.equal(result.files[1].kind, BEHAVIOUR, 'a grant on a table created by an earlier file is a change to an existing object');

console.log('Migration kinds: additive, behaviour and removal rules, history and pull request decisions passed.');
