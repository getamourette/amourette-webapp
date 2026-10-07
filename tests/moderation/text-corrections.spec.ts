import { createClient } from '@supabase/supabase-js';
import { test, expect } from '../helpers/fixtures';
import type { Database } from '../../lib/database.types';
import { approveProfile, submitProfile } from '../helpers/profile-review';

// Run only after founder-authorized application; absence fails before creating
// fixtures. Never install the shared migration from a test.
test('moderated text is private through real RPCs and disappears from an open matched chat', async ({ data, contextFor }) => {
  test.setTimeout(90_000);
  const preflight = await data.service.rpc('my_profile_review');
  expect(preflight.error?.code, 'Requires the founder-approved #294 migration').not.toBe('PGRST202');
  const alice = await data.identity('Alice', 'woman'), bob = await data.identity('Bob', 'man');
  const founder = await data.identity('TextReviewer');
  const client = (token: string) => createClient<Database>(data.env.url, data.env.publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const owner = client(alice.session.access_token), peer = client(bob.session.access_token), admin = client(founder.session.access_token);
  expect((await data.service.from('admins').insert({ user_id: founder.id })).error).toBeNull();
  const venue = await data.venue(); await data.checkIn(venue, [alice, bob]);
  const match = await data.match(venue, alice, bob);
  expect((await owner.from('profiles').update({ bio: 'Text to review' }).eq('id', alice.id)).error).toBeNull();
  const chat = await (await contextFor(bob)).newPage(); await chat.goto(`/chat/${match}`);
  await expect(chat.getByTestId('chat-profile-name')).toHaveText('Alice');
  expect((await peer.rpc('admin_text_reviews', { p_night: venue.nightId })).error?.code).toBe('42501');
  expect((await admin.rpc('admin_text_reviews', { p_profile: bob.id })).data).toEqual([]);
  const inspect = async () => {
    const result = await admin.rpc('admin_text_reviews', { p_profile: alice.id, p_night: venue.nightId });
    expect(result.error).toBeNull(); return result.data!;
  };
  for (const field of ['bio', 'first_name'] as const) {
    const row = (await inspect()).find(row => row.field === field)!;
    const rejected = await admin.rpc('require_profile_text_correction', {
      p_profile: alice.id, p_field: field, p_revision: row.revision, p_reason: 'inappropriate', p_night: venue.nightId,
    });
    expect(rejected.error).toBeNull();
    expect((await peer.from('profiles').select('first_name,bio').eq('id', alice.id).single()).data?.[field]).toBeNull();
    expect((await owner.rpc('my_text_corrections')).data?.find(row => row.field === field)?.required).toBe(true);
  }
  // Let the real private invalidation deliver the change; no manual refresh.
  await expect(chat.getByTestId('chat-profile-name')).toHaveText('Participant', { timeout: 15_000 });
  await expect(chat.getByTestId('chat-input')).toBeEnabled();
  expect((await owner.from('profiles').update({ bio: 'Bypass review' }).eq('id', alice.id)).error?.code).toBe('42501');
  expect((await peer.rpc('room_candidates', { p_venue_id: venue.id })).data?.some(row => row.id === alice.id)).toBe(false);
  const state = (await owner.rpc('my_text_corrections')).data!;
  const bio = crypto.randomUUID();
  expect((await owner.rpc('submit_bio_correction', { p_request_id: bio, p_proposed_text: 'Corrected bio', p_revision: state.find(row => row.field === 'bio')!.revision })).error).toBeNull();
  expect((await peer.rpc('chat_partner_state', { p_match_id: match }).single()).data?.bio).toBeNull();
  expect((await admin.rpc('decide_bio_correction', { p_request_id: bio, p_action: 'approved' })).data?.[0].applied).toBe(true);
  expect((await peer.rpc('room_candidates', { p_venue_id: venue.id })).data?.some(row => row.id === alice.id)).toBe(false);
  const name = crypto.randomUUID();
  expect((await owner.rpc('submit_name_correction', { p_request_id: name, p_proposed_name: 'Alix' })).error).toBeNull();
  expect((await admin.rpc('decide_name_correction', { p_request_id: name, p_action: 'approved' })).data?.[0].applied).toBe(true);
  // Field approvals in report handling do not lift the unified discovery hold.
  expect((await peer.rpc('room_candidates', { p_venue_id: venue.id })).data?.some(row => row.id === alice.id)).toBe(false);
  await submitProfile(owner, alice.id);
  await approveProfile(admin, venue.id, alice.id);
  await expect(chat.getByTestId('chat-profile-name')).toHaveText('Alix', { timeout: 15_000 });
  await expect(chat.getByTestId('chat-name-notice')).toBeVisible();
  await chat.reload(); await expect(chat.getByTestId('chat-input')).toBeVisible();
  await expect(chat.getByTestId('chat-name-notice')).toHaveCount(0);
  const audit = await admin.rpc('admin_text_history', { p_profile: alice.id, p_night: venue.nightId });
  expect(audit.error).toBeNull(); expect(audit.data?.filter(event => event.action === 'approved')).toHaveLength(2);
});
