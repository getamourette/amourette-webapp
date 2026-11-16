import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/database.types';
import { test, expect, type TestIdentity } from '../helpers/fixtures';

// SEC-001 (#364), pilot scope: a participant cannot list venues and reaches
// one only by presenting its slug; founder admin tooling keeps its listing.
test('a participant resolves a venue only from its slug', async ({ data }) => {
  const [venue, other] = [await data.venue(), await data.venue()];
  const outsider = await data.identity('Olive', 'woman');
  const attendee = await data.identity('Anna', 'woman');
  const founder = await data.identity('Founder');
  await data.checkIn(venue, [attendee]);
  expect((await data.service.from('admins').insert({ user_id: founder.id })).error).toBeNull();
  const client = (identity: TestIdentity) => createClient<Database>(data.env.url, data.env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${identity.session.access_token}` } },
  });
  const [o, a, f] = [client(outsider), client(attendee), client(founder)];
  try {
    // A complete profile that never visited any venue lists nothing, whatever
    // the filter.
    expect((await o.from('venues').select('id')).data).toEqual([]);
    expect((await o.from('venues').select('id').eq('id', venue.id)).data).toEqual([]);
    expect((await o.from('venues').select('id').eq('slug', venue.slug)).data).toEqual([]);
    expect((await o.from('venues').select('id').like('slug', 'e2e-%')).data).toEqual([]);

    // Presenting the slug returns that venue only, and its night state follows.
    const found = await o.rpc('venue_by_slug', { p_slug: venue.slug });
    expect(found.error).toBeNull();
    expect(found.data?.map(row => row.id)).toEqual([venue.id]);
    expect((await o.rpc('venue_by_slug', { p_slug: `${venue.slug}-x` })).data).toEqual([]);
    expect((await o.rpc('venue_by_slug', { p_slug: 'e2e-%' })).data).toEqual([]);
    const state = await o.rpc('venue_night_state', { p_venue_id: venue.id });
    expect(state.data?.map(row => row.venue_night_id)).toEqual([venue.nightId]);

    // An attendee keeps the venue they are in (chat header, correction return).
    expect((await a.from('venues').select('id')).data).toEqual([{ id: venue.id }]);

    // The founder listing still returns every venue.
    const listed = (await f.from('venues').select('id').in('id', [venue.id, other.id])).data;
    expect(listed?.map(row => row.id).sort()).toEqual([venue.id, other.id].sort());
  } finally {
    await data.service.from('admins').delete().eq('user_id', founder.id);
  }
});
