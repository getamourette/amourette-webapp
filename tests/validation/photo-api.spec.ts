import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { test, expect } from '../helpers/fixtures';

test('photo submission rejects invalid metadata and content before persistence', async ({ data, request }) => {
  const identity = await data.identity('Input fixture');
  const headers = { Authorization: `Bearer ${identity.session.access_token}` };
  const buffer = await sharp({ create: { width: 4, height: 4, channels: 3, background: 'red' } }).png().toBuffer();
  const file = { name: 'untrusted-name.svg', mimeType: 'image/png', buffer };
  const profile = { first_name: 'Alice', bio: null, gender: 'woman', interested_in: ['man'], adult_confirmed: true };
  for (const value of [null, [], {}, { ...profile, first_name: 1 }, { ...profile, first_name: '😀'.repeat(31) },
    { ...profile, bio: '😀'.repeat(501) }, { ...profile, interested_in: ['man', 'man'] },
    { ...profile, adult_confirmed: 'true' }, { ...profile, extra: true }]) {
    const response = await request.post('/api/profile-photo', { headers,
      multipart: { photo: file, revision: '0', profile: JSON.stringify(value) } });
    expect(response.status()).toBe(400);
  }
  for (const revision of ['-1', '0.5', '2147483648', 'null', '00', '']) {
    expect((await request.post('/api/profile-photo', { headers,
      multipart: { photo: file, revision, profile: JSON.stringify(profile) } })).status()).toBe(400);
  }
  for (const invalidFile of [{ ...file, buffer: Buffer.alloc(0) }, { ...file, mimeType: 'image/jpeg' },
    { ...file, buffer: buffer.subarray(0, 16) }]) {
    expect((await request.post('/api/profile-photo', { headers,
      multipart: { photo: invalidFile, revision: '0', profile: JSON.stringify(profile) } })).status()).toBe(400);
  }
  expect((await request.post('/api/profile-photo', { headers, data: Buffer.alloc(5 * 1024 * 1024 + 64 * 1024 + 1) })).status()).toBe(413);
  const absent = await data.service.from('profiles').select('id').eq('id', identity.id);
  expect(absent.error).toBeNull();
  expect(absent.data).toEqual([]);
  const objects = await data.service.storage.from('profile-photos').list(identity.id);
  expect(objects.error).toBeNull();
  expect(objects.data).toEqual([]);

  // Exact Unicode boundaries work through the authoritative initial-photo route.
  const accepted = await request.post('/api/profile-photo', { headers, multipart: { photo: file, revision: '0',
    profile: JSON.stringify({ ...profile, first_name: `\u00a0${'😀'.repeat(30)}\ufeff`, bio: '😀'.repeat(500) }) } });
  expect(accepted.status()).toBe(200);
  const saved = await data.service.from('profiles').select('first_name,bio').eq('id', identity.id).single();
  expect(saved.error).toBeNull();
  expect(saved.data).toEqual({ first_name: '😀'.repeat(30), bio: '😀'.repeat(500) });

  // Bypassing the application still encounters the deployed database contract.
  const restHeaders = { ...headers, apikey: data.env.publishableKey };
  const profileUrl = `${data.env.url}/rest/v1/profiles?id=eq.${identity.id}`;
  for (const patch of [{ first_name: '😀'.repeat(31) }, { bio: '😀'.repeat(501) },
    { first_name: ' '.repeat(16384) + 'x' }, { interested_in: ['man', 'man'] }]) {
    const rejected = await request.patch(profileUrl, { headers: restHeaders, data: patch });
    expect(rejected.ok()).toBe(false);
    expect((await rejected.json()).code).toBe('23514');
  }
  const unchanged = await data.service.from('profiles').select('first_name,bio').eq('id', identity.id).single();
  expect(unchanged.error).toBeNull();
  expect(unchanged.data).toEqual(saved.data);
  const normalized = await request.patch(profileUrl, { headers: restHeaders,
    data: { first_name: `\ufeff${'😀'.repeat(30)}\u00a0`, bio: '\ufeff\u00a0' } });
  expect(normalized.ok()).toBe(true);
  const normalizedRow = await data.service.from('profiles').select('first_name,bio').eq('id', identity.id).single();
  expect(normalizedRow.error).toBeNull();
  expect(normalizedRow.data).toEqual({ first_name: '😀'.repeat(30), bio: null });
  const phone = await request.patch(`${data.env.url}/rest/v1/profile_private?id=eq.${identity.id}`, {
    headers: restHeaders, data: { phone: 'unsupported' },
  });
  expect(phone.status()).toBe(403);
  expect((await phone.json()).code).toBe('42501');

  // Service-only RPC metadata is checked before any profile/photo-state effect.
  const stateBefore = await data.service.from('photo_state').select('revision,displayed_id,pending_id').eq('profile_id', identity.id).single();
  expect(stateBefore.error).toBeNull();
  const malformed = await data.service.rpc('submit_profile_photo', {
    p_owner: identity.id, p_path: `${identity.id}/${randomUUID()}.jpg`, p_expected_revision: 0,
    p_profile: { ...profile, adult_confirmed: 'true' },
  });
  expect(malformed.error?.message).toBe('invalid photo profile');
  const stateAfter = await data.service.from('photo_state').select('revision,displayed_id,pending_id').eq('profile_id', identity.id).single();
  expect(stateAfter.error).toBeNull();
  expect(stateAfter.data).toEqual(stateBefore.data);
});
