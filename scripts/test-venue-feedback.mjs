import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function private.is_admin() returns boolean language sql stable as $$
      select auth.uid() = '00000000-0000-0000-0000-000000000003'::uuid
    $$;
    create function private.trim_input(value text) returns text language sql immutable strict as $$
      select btrim(value, U&'\\0009\\000A\\000B\\000C\\000D\\0020\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF')
    $$;
    create function private.valid_input_text(value text, maximum integer, required boolean)
      returns boolean language sql immutable as $$
      select case when value is null then not required else octet_length(value) <= 16384
        and length(private.trim_input(value)) <= maximum
        and (not required or length(private.trim_input(value)) > 0) end
    $$;
    grant usage on schema auth, private to authenticated;
    create table public.profiles(id uuid primary key);
    create table public.venues(id uuid primary key);
    create table public.venue_nights(id uuid primary key, venue_id uuid not null references public.venues,
      status text not null, terminal_at timestamptz, closes_at timestamptz not null);
    create table public.presence(id uuid primary key, profile_id uuid not null references public.profiles,
      venue_id uuid not null references public.venues, venue_night_id uuid not null references public.venue_nights,
      left_at timestamptz);
  `);
  await db.exec(readFileSync('supabase/migrations/20260918230000_venue_feedback.sql', 'utf8'));
  const me = '00000000-0000-0000-0000-000000000001';
  const other = '00000000-0000-0000-0000-000000000002';
  const venue = '00000000-0000-0000-0000-000000000003';
  const night = '00000000-0000-0000-0000-000000000004';
  const presence = '00000000-0000-0000-0000-000000000005';
  const theirPresence = '00000000-0000-0000-0000-000000000006';
  await db.query('insert into profiles(id) values($1),($2)', [me, other]);
  await db.query('insert into venues(id) values($1)', [venue]);
  await db.query("insert into venue_nights(id,venue_id,status,closes_at) values($1,$2,'live',now()+interval '1 hour')", [night, venue]);
  await db.query('insert into presence(id,profile_id,venue_id,venue_night_id) values($1,$2,$3,$4),($5,$6,$3,$4)',
    [presence, me, venue, night, theirPresence, other]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [me]);
  const count = async () => Number((await db.query('select count(*)::integer n from venue_feedback')).rows[0].n);
  for (const body of [null, '', '  ', 'x'.repeat(501), '\0']) {
    await assert.rejects(() => db.query('select submit_venue_feedback($1,$2)', [presence, body]));
    assert.equal(await count(), 0);
  }
  await assert.rejects(() => db.query('select submit_venue_feedback($1,$2)', [theirPresence, 'hello']));
  assert.equal(await count(), 0);
  await db.query('select submit_venue_feedback($1,$2)', [presence, '\t' + '😀'.repeat(500) + '\u00a0']);
  assert.equal(await count(), 1);
  assert.equal((await db.query('select body from venue_feedback')).rows[0].body, '😀'.repeat(500));
  assert.equal((await db.query('select has_submitted_venue_feedback($1) submitted', [night])).rows[0].submitted, true);
  await assert.rejects(() => db.query('select has_submitted_venue_feedback(null)'));
  await assert.rejects(() => db.query('select submit_venue_feedback($1,$2)', [presence, 'again']));
  assert.equal(await count(), 1);
  await db.exec('set role authenticated');
  assert.equal((await db.query('select count(*)::integer n from venue_feedback')).rows[0].n, 0);
  assert.equal((await db.query('select has_submitted_venue_feedback($1) submitted', [night])).rows[0].submitted, true);
  await assert.rejects(() => db.query('insert into venue_feedback(profile_id,venue_night_id,body) values($1,$2,$3)', [me, night, 'direct']));
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
  assert.equal((await db.query('select has_submitted_venue_feedback($1) submitted', [night])).rows[0].submitted, false);
  await db.exec('set role authenticated');
  assert.equal((await db.query('select count(*)::integer n from venue_feedback')).rows[0].n, 0);
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false)");
  await db.exec('set role authenticated');
  assert.equal((await db.query('select count(*)::integer n from venue_feedback')).rows[0].n, 1);
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
  await db.query('update presence set left_at=now() where id=$1', [theirPresence]);
  await assert.rejects(() => db.query('select submit_venue_feedback($1,$2)', [theirPresence, 'after leaving']));
  assert.equal(await count(), 1);
  await db.query('update presence set left_at=null where id=$1', [theirPresence]);
  await db.query("update venue_nights set closes_at=now()-interval '1 second' where id=$1", [night]);
  await assert.rejects(() => db.query('select submit_venue_feedback($1,$2)', [theirPresence, 'after closing']));
  assert.equal(await count(), 1);
  console.log('venue feedback SQL boundaries passed');
} finally {
  await db.close();
}
