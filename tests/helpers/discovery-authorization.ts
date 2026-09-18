import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { test, expect, type TestData, type TestIdentity } from './fixtures';
import type { APIRequestContext, BrowserContext } from '@playwright/test';
import type { Database } from '../../lib/database.types';

function client(data: TestData, user: TestIdentity) {
  return createClient<Database>(data.env.url, data.env.publishableKey, {
    global: { headers: { Authorization: `Bearer ${user.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
const columns = 'id, first_name, bio, photo_url';

// Real participant HTTP and WebSocket sessions, never service-role assertions
// standing in for participant authorization. Service access only sets fixtures.
export async function verifyDiscoveryAuthorization({ data, contextFor, request, alice, bob, founder }: {
  data: TestData; contextFor: (user: TestIdentity) => Promise<BrowserContext>; request: APIRequestContext;
  alice: TestIdentity; bob: TestIdentity; founder: TestIdentity;
}) {
  const venue = await data.venue();
  const a = client(data, alice);
  const b = client(data, bob);
  const f = client(data, founder);
  const path = `${bob.id}/${randomUUID()}.jpg`;
  const bytes = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#805347' } }).jpeg().toBuffer();
  expect((await data.service.storage.from('profile-photos').upload(path, bytes, { contentType: 'image/jpeg' })).error).toBeNull();
  const initial = await data.service.from('photo_state').select('revision').eq('profile_id', bob.id).single();
  expect(initial.error).toBeNull();
  expect((await data.service.rpc('submit_profile_photo', {
    p_owner: bob.id, p_path: path, p_expected_revision: initial.data!.revision,
  })).error).toBeNull();
  const submitted = await data.service.from('photo_state').select('revision,pending_id').eq('profile_id', bob.id).single();
  expect(submitted.error).toBeNull();
  expect((await f.rpc('decide_profile_photo', { p_owner: bob.id, p_version: submitted.data!.pending_id!, p_expected_revision: submitted.data!.revision, p_action: 'approved' })).error).toBeNull();
  expect((await a.from('profiles').update({ gender: 'woman' }).eq('id', alice.id)).error).toBeNull();
  expect((await b.from('profiles').update({ gender: 'man', interested_in: ['woman'] }).eq('id', bob.id)).error).toBeNull();
  for (const [participant, user] of [[a, alice], [b, bob]] as const) {
    expect((await participant.rpc('check_in', { p_venue_id: venue.id })).error).toBeNull();
    expect((await participant.from('presence').update({ is_visible: true }).eq('profile_id', user.id).is('left_at', null)).error).toBeNull();
  }

  async function edit(interested_in: string[]) {
    const result = await a.from('profiles').update({ interested_in }).eq('id', alice.id);
    expect(result.error).toBeNull();
    const own = await a.rpc('get_my_profile').single();
    expect(own.error).toBeNull();
    expect(own.data?.id).toBe(alice.id);
    expect(own.data?.interested_in).toEqual(interested_in);
  }
  async function discovery(allowed: boolean) {
    const direct = await a.from('profiles').select(columns).eq('id', bob.id);
    expect(direct.error).toBeNull();
    expect(direct.data).toHaveLength(Number(allowed));
    const joined = await a.from('presence').select(`id, profiles!inner(${columns})`).eq('venue_id', venue.id).eq('profile_id', bob.id);
    expect(joined.error).toBeNull();
    expect(joined.data).toHaveLength(Number(allowed));
    const source = await a.rpc('profile_photo_source', { p_profile: bob.id });
    expect(source.error).toBeNull();
    expect(source.data).toBe(allowed ? path : null);
    const download = await a.storage.from('profile-photos').download(path);
    expect(download.error === null).toBe(allowed);
  }
  await edit(['woman']);
  await discovery(false);
  const count = await a.from('venue_night_public_state').select('participant_count').eq('venue_night_id', venue.nightId).single();
  expect(count.error).toBeNull();
  expect(count.data?.participant_count).toBe(2);
  // Owner access does not require attendance; the RPC accepts no target ID.
  expect((await b.rpc('get_my_profile').single()).data?.gender).toBe('man');
  expect((await f.rpc('get_my_profile')).data).toEqual([]);
  const raw = (rpc: string, body: object, token = alice.session.access_token) => request.post(`${data.env.url}/rest/v1/rpc/${rpc}`, {
    headers: { apikey: data.env.publishableKey, Authorization: `Bearer ${token}` }, data: body,
  });
  expect((await raw('get_my_profile', { p_profile: bob.id })).status()).toBe(404);
  expect((await raw('preview_room_profiles', { p_venue_id: venue.id })).status()).toBe(404);
  expect((await raw('set_venue_profile_preview', { p_venue_id: venue.id, p_enabled: true }, founder.session.access_token)).status()).toBe(404);
  const anonymous = createClient<Database>(data.env.url, data.env.publishableKey, { auth: { persistSession: false } });
  expect((await anonymous.rpc('get_my_profile')).error).not.toBeNull();
  for (const rpc of ['admin_photo_queue', 'admin_night_stats', 'admin_founder_analytics', 'admin_venue_night_gender_counts'] as const) {
    expect((await a.rpc(rpc)).error).not.toBeNull();
  }
  expect((await f.rpc('admin_photo_queue', { p_night: venue.nightId })).error).toBeNull();
  expect((await f.storage.from('profile-photos').download(path)).error).toBeNull();

  const context = await contextFor(alice);
  const page = await context.newPage();
  const responses: string[] = [];
  const frames: string[] = [];
  const pending: Promise<void>[] = [];
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin === data.env.url && url.pathname.startsWith('/rest/v1/') && !url.pathname.endsWith('/get_my_profile')) {
      pending.push(response.text().then(body => { responses.push(body); }).catch(() => {}));
    }
  });
  page.on('websocket', socket => socket.on('framereceived', frame => frames.push(String(frame.payload))));
  await page.goto(`/v/${venue.slug}`);
  await page.locator('[aria-labelledby="room-hint-title"]').getByRole('button').click();
  await expect(page.getByTestId('profile-feed').getByText(bob.name, { exact: true })).toHaveCount(0);
  await edit(['man', 'nonbinary']);
  await discovery(true);
  for (const query of [
    a.from('profiles').select('gender').eq('id', bob.id),
    a.from('profiles').select('interested_in').eq('id', bob.id),
    a.from('profiles').select('id').eq('gender', 'man'),
    a.from('profiles').select('id').contains('interested_in', ['woman']),
    a.from('profiles').select('id').order('gender'),
    a.from('profiles').select('*'),
    a.from('presence').select('profiles!inner(gender)').eq('venue_id', venue.id),
  ]) expect((await query).error?.code).toBe('42501');
  await page.reload();
  await expect(page.getByTestId('profile-feed').getByText(bob.name, { exact: true })).toBeVisible();
  await Promise.all(pending);
  expect(responses.length).toBeGreaterThan(0);
  expect(responses.join('\n')).not.toMatch(/"(?:gender|interested_in)"\s*:/);
  expect(frames.join('\n')).not.toMatch(/"(?:gender|interested_in)"\s*:/);
  await page.close();

  // Preferences changing after an established match cannot reintroduce discovery.
  await data.match(venue, alice, bob);
  await edit(['woman']);
  expect((await a.from('profiles').select(columns).eq('id', bob.id)).data).toHaveLength(1);
  expect((await a.from('presence').select(`profiles!inner(${columns})`).eq('profile_id', bob.id)).data).toEqual([]);
  expect((await a.storage.from('profile-photos').download(path)).error).toBeNull();
  expect((await b.from('presence').update({ left_at: new Date().toISOString() }).eq('profile_id', bob.id).select('id,left_at')).error).toBeNull();
  expect((await a.from('profiles').select(columns).eq('id', bob.id)).data).toHaveLength(1);
  expect((await data.service.from('venue_nights').update({ closes_at: new Date(Date.now() - 1_000).toISOString() }).eq('id', venue.nightId)).error).toBeNull();
  await discovery(false);
  await test.step('Realtime protects current and old profile values and deleted presence', () => verifyDiscoveryRealtime(data, alice, bob));
}

async function verifyDiscoveryRealtime(data: TestData, alice: TestIdentity, bob: TestIdentity) {
  const venue = await data.venue();
  for (const user of [alice,bob]) expect((await client(data,user).rpc('check_in', { p_venue_id: venue.id })).error).toBeNull();
  const a = client(data, alice);
  expect((await a.from('profiles').update({ interested_in: ['woman'] }).eq('id', alice.id)).error).toBeNull();
  await a.realtime.setAuth(alice.session.access_token);
  const received: { table: string; eventType: string; new: object; old: object }[] = [];
  const channels = ['presence', 'profiles'].map(table => a.channel(`discovery-${table}-${randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, payload => received.push(payload)));
  try {
    await Promise.all(channels.map((channel, index) => new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Realtime subscription timed out')), 15_000);
      channel.subscribe(status => {
        // A refused profiles subscription is also a valid privacy boundary.
        if (status === 'SUBSCRIBED' || (index === 1 && status === 'CHANNEL_ERROR')) { clearTimeout(timeout); resolve(); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(timeout); reject(new Error(status)); }
      });
    })));
    expect((await data.service.from('profiles').update({ interested_in: ['man'], bio: 'Private update' }).eq('id', bob.id)).error).toBeNull();
    expect((await data.service.from('presence').update({ is_visible: false }).eq('profile_id', bob.id)).error).toBeNull();
    expect((await data.service.from('presence').update({ is_visible: true }).eq('profile_id', bob.id)).error).toBeNull();
    // Positive control proves this socket is actually consuming changes.
    expect((await a.from('presence').update({ is_visible: false }).eq('profile_id', alice.id)).error).toBeNull();
    await expect.poll(() => received.filter(p => 'profile_id' in p.new && p.new.profile_id === alice.id).length).toBeGreaterThan(0);
    expect((await data.service.from('presence').delete().eq('profile_id', bob.id).eq('venue_night_id', venue.nightId)).error).toBeNull();
    expect((await a.from('presence').update({ is_visible: true }).eq('profile_id', alice.id)).error).toBeNull();
    await expect.poll(() => received.filter(p => 'is_visible' in p.new && p.new.is_visible === true).length).toBeGreaterThan(0);
    expect(received.some(p => p.table === 'profiles')).toBe(false);
    expect(JSON.stringify(received)).not.toMatch(/"(?:gender|interested_in)"\s*:/);
    expect(JSON.stringify(received)).not.toContain(bob.id);
    for (const payload of received.filter(p => p.eventType === 'DELETE')) {
      // Supabase cannot check RLS for deleted rows; only the opaque presence PK
      // may survive, never profile_id, venue, old preferences, or photo paths.
      expect(Object.keys(payload.old)).toEqual(['id']);
    }
  } finally {
    await Promise.all(channels.map(channel => a.removeChannel(channel)));
  }
}
