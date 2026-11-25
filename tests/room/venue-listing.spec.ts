import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/database.types';
import { test, expect, type TestIdentity } from '../helpers/fixtures';

// SEC-001 (#364) on the real database: a participant session cannot list
// venues and reaches one only by presenting its slug; founder admin tooling
// keeps its listing. The SQL rules are covered in scripts/test-venue-access-sql.mjs;
// this proves the deployed policies and grants, and that the room still opens.
test('a participant cannot list venues, finds one by its slug and still enters the room', async ({ data, contextFor }) => {
  const [visited, other] = [await data.venue(), await data.venue()];
  const outsider = await data.identity('Outsider', 'man');
  const attendee = await data.identity('Attendee', 'woman');
  const founder = await data.identity('Founder');
  await data.founder(founder);
  await data.checkIn(visited, [attendee]);

  const as = (identity: TestIdentity) => createClient<Database>(data.env.url, data.env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${identity.session.access_token}` } },
  });
  const ownSlugs = [visited.slug, other.slug].sort();
  // The shared database holds other venues; an unfiltered read is the
  // enumeration itself, the filtered one keeps the assertions to this run.
  const read = async (identity: TestIdentity) => {
    const all = await as(identity).from('venues').select('id, slug');
    expect(all.error).toBeNull();
    const slugs = (all.data ?? []).map(venue => venue.slug);
    return { total: slugs.length, own: slugs.filter(slug => ownSlugs.includes(slug)).sort() };
  };

  // No enumeration, and no direct read by id, exact slug or pattern.
  expect(await read(outsider)).toEqual({ total: 0, own: [] });
  const stranger = as(outsider);
  for (const query of [
    stranger.from('venues').select('id').eq('id', visited.id),
    stranger.from('venues').select('id').eq('slug', visited.slug),
    stranger.from('venues').select('id').like('slug', 'e2e-%'),
  ]) expect(await query).toMatchObject({ error: null, data: [] });

  // Presenting the slug returns that venue only, and its night stays readable.
  const found = await stranger.rpc('venue_by_slug', { p_slug: visited.slug });
  expect(found.error).toBeNull();
  expect(found.data).toEqual([expect.objectContaining({ id: visited.id, slug: visited.slug })]);
  expect((await stranger.rpc('venue_by_slug', { p_slug: `${visited.slug.slice(0, -1)}%` })).data).toEqual([]);
  const night = await stranger.rpc('venue_night_state', { p_venue_id: visited.id });
  expect(night.error).toBeNull();
  expect(night.data).toEqual([expect.objectContaining({ venue_night_id: visited.nightId })]);

  // Without a session: neither the table nor the lookup.
  const anonymous = createClient<Database>(data.env.url, data.env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect((await anonymous.from('venues').select('id').limit(1)).error?.code).toBe('42501');
  expect((await anonymous.rpc('venue_by_slug', { p_slug: visited.slug })).error?.code).toBe('42501');

  // A participant keeps the venue they attended, and only that one.
  expect(await read(attendee)).toEqual({ total: 1, own: [visited.slug] });

  // Founder admin tooling still lists venues.
  expect((await read(founder)).own).toEqual(ownSlugs);

  // The room still opens from the slug alone.
  const context = await contextFor(attendee);
  await context.addInitScript(() => localStorage.setItem('amourette-room-hint-dismissed', '1'));
  const room = await context.newPage();
  await room.goto(`/v/${visited.slug}`);
  await expect(room.getByRole('button', { name: 'Night options', exact: true })).toBeVisible();
  await expect(room.getByText('This link doesn’t match any bar')).toHaveCount(0);
});
