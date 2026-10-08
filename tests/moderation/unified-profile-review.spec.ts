import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { test, expect } from '../helpers/fixtures';
import type { Database } from '../../lib/database.types';
import { parseOwnerReview } from '../../lib/profile-review-data';
import { inspectedProfile, selectReviewProfile } from '../helpers/profile-review';

// Shared-schema gate only after explicit founder application. Missing RPCs fail
// before fixture creation. No test installs or resets a shared migration.
test('complete profile approval, bio-only discovery hold, explicit resubmission and independent report handling', async ({ data, contextFor }, testInfo) => {
  test.setTimeout(120_000);
  const preflight = await data.service.rpc('my_profile_review');
  expect(preflight.error?.code, 'Requires the founder-approved #294 migration').not.toBe('PGRST202');
  const alice = await data.identity('UnifiedAlice', 'woman'), bob = await data.identity('UnifiedBob', 'man');
  const founder = await data.identity('UnifiedReviewer');
  expect((await data.service.from('admins').insert({ user_id: founder.id })).error).toBeNull();
  const client = (token: string) => createClient<Database>(data.env.url, data.env.publishableKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const owner = client(alice.session.access_token), peer = client(bob.session.access_token), admin = client(founder.session.access_token);
  const venue = await data.venue(); await data.checkIn(venue, [alice, bob]);
  const match = await data.match(venue, alice, bob);
  const adminPage = await (await contextFor(founder)).newPage();
  await adminPage.goto('/admin'); await adminPage.getByRole('button', { name: /Moderation/ }).click();
  let review = await selectReviewProfile(adminPage, venue.id, alice.name);
  if (process.env.E2E_SCREENSHOTS_DIR) await adminPage.screenshot({ path: testInfo.outputPath('unified-admin-approval.png'), fullPage: true });
  await review.getByRole('button', { name: 'Approve & next' }).click();
  await expect.poll(async () => (await inspectedProfile(admin, venue.id, alice.id)).status).toBe('approved');
  expect((await inspectedProfile(admin, venue.id, alice.id)).approvedFields).toEqual(['first_name', 'bio', 'photo']);

  const ownPage = await (await contextFor(alice)).newPage(); await ownPage.goto(`/profile?edit=1&venue=${venue.slug}`);
  const chat = await (await contextFor(alice)).newPage(); await chat.goto(`/chat/${match}`);
  await expect(chat.getByTestId('chat-input')).toBeEnabled();
  const report = await peer.rpc('submit_report', { p_reported_id: alice.id, p_venue_night_id: venue.nightId, p_reason: 'fake_profile', p_note: 'Independent report through unified review' });
  expect(report.error).toBeNull();
  review = await selectReviewProfile(adminPage, venue.id, alice.name);
  await review.getByRole('button', { name: 'Request changes', exact: true }).click();
  await review.getByRole('checkbox', { name: 'Bio', exact: true }).check();
  await review.getByRole('combobox', { name: 'Bio reason' }).selectOption('harassment');
  if (process.env.E2E_SCREENSHOTS_DIR) await adminPage.screenshot({ path: testInfo.outputPath('unified-admin-correction.png'), fullPage: true });
  await review.getByRole('button', { name: 'Request changes & next' }).click();
  const prompt = ownPage.getByTestId('focused-corrections');
  await expect(prompt).toContainText('Your profile stays hidden until approval');
  await expect(ownPage.getByRole('dialog')).toContainText('Remove content that targets or harasses someone.');
  await ownPage.getByRole('dialog').getByRole('button', { name: 'Edit my profile', exact: true }).click();
  await expect(prompt.getByRole('heading', { name: 'Edit my profile', exact: true })).toBeVisible();
  expect((await peer.rpc('room_candidates', { p_venue_id: venue.id })).data?.some(row => row.id === alice.id)).toBe(false);
  expect((await peer.rpc('admin_profile_reviews', { p_venue: venue.id })).error?.code).toBe('42501');
  await chat.keyboard.press('Escape');
  await expect(chat.getByTestId('chat-input')).toBeEnabled();
  await chat.getByTestId('chat-input').fill('Existing chats still work');
  await chat.getByTestId('chat-send').click();
  await expect(chat.getByText('Existing chats still work', { exact: true })).toBeVisible();
  await expect.poll(async () => parseOwnerReview((await owner.rpc('my_profile_review')).data, alice.id)?.notification).toBe(false);
  await ownPage.reload();
  const bio = prompt.getByRole('textbox', { name: 'Bio', exact: true });
  await expect(prompt.getByRole('heading', { name: 'Edit my profile', exact: true })).toBeFocused();
  await bio.fill('My reviewed new bio');
  expect((await inspectedProfile(admin, venue.id, alice.id)).status).toBe('awaiting_changes');
  await prompt.getByRole('button', { name: 'Send for review', exact: true }).click();
  await expect(prompt).toContainText('Awaiting approval');
  await ownPage.reload();
  await expect(prompt).toContainText('Awaiting approval');
  await expect(ownPage.getByRole('dialog')).toHaveCount(0);
  const resubmitted = await inspectedProfile(admin, venue.id, alice.id);
  expect(resubmitted.resubmission).toBe(true); expect(resubmitted.changedFields).toContain('bio');
  expect(resubmitted.approvedFields).toEqual(['first_name', 'photo']);
  expect((await peer.rpc('room_candidates', { p_venue_id: venue.id })).data?.some(row => row.id === alice.id)).toBe(false);
  await review.getByRole('button', { name: /^Needs review / }).click();
  await expect(review.getByText(alice.name, { exact: true }).first()).toBeVisible();
  await expect(review.getByText('Original correction request')).toBeVisible();
  await expect(review.getByText('My reviewed new bio', { exact: true })).toBeVisible();
  if (process.env.E2E_SCREENSHOTS_DIR) {
    await adminPage.screenshot({ path: testInfo.outputPath('unified-admin-resubmission.png'), fullPage: true });
    await ownPage.screenshot({ path: testInfo.outputPath('unified-owner-pending.png'), fullPage: true });
    await chat.screenshot({ path: testInfo.outputPath('unified-existing-chat.png'), fullPage: true });
  }
  await review.getByRole('button', { name: 'Approve & next' }).click();
  await expect(ownPage).toHaveURL(`/v/${venue.slug}?reviewNight=${venue.nightId}`);
  await expect(ownPage.getByRole('heading', { name: 'Edit my profile', exact: true })).toHaveCount(0);
  expect(parseOwnerReview((await owner.rpc('my_profile_review')).data, alice.id)).toBeNull();
  expect((await peer.rpc('room_candidates', { p_venue_id: venue.id })).data?.some(row => row.id === alice.id)).toBe(true);
  const unchanged = await admin.from('reports').select('reviewed_at').eq('id', report.data!).single();
  expect(unchanged.error).toBeNull(); expect(unchanged.data?.reviewed_at).toBeNull();
  await adminPage.getByRole('button', { name: 'Refresh', exact: true }).click();
  await adminPage.locator('tr[role=button]').filter({ hasText: 'UnifiedAlice' }).filter({ hasText: 'Fake profile' }).click();
  const detail = adminPage.getByRole('dialog', { name: 'Report details' });
  await expect(detail).toContainText('Independent report through unified review');
  await detail.getByRole('button', { name: 'Mark reviewed' }).click();
  await expect(detail.getByRole('button', { name: 'Reviewed', exact: true })).toBeDisabled();
});

test('combined corrections deliver the actual photo and text to the founder, then handle a new rejection', async ({ data, contextFor }) => {
  test.setTimeout(120_000);
  const alice = await data.identity('CompactAlice', 'woman');
  const founder = await data.identity('CompactReviewer');
  expect((await data.service.from('admins').insert({ user_id: founder.id })).error).toBeNull();
  const client = (token: string) => createClient<Database>(data.env.url, data.env.publishableKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const owner = client(alice.session.access_token), admin = client(founder.session.access_token);
  const venue = await data.venue(); await data.checkIn(venue, [alice]);
  const original = await inspectedProfile(admin, venue.id, alice.id);
  expect((await admin.rpc('approve_profile_review', { p_profile: alice.id, p_venue: venue.id, p_revision: original.revision })).error).toBeNull();
  const approved = await inspectedProfile(admin, venue.id, alice.id);
  expect((await admin.rpc('request_profile_corrections', { p_profile: alice.id, p_venue: venue.id, p_revision: approved.revision,
    p_fields: [{ field: 'first_name', reason: 'misleading_identity' }, { field: 'bio', reason: 'harassment' }, { field: 'photo', reason: 'face_unclear' }] })).error).toBeNull();
  const page = await (await contextFor(alice)).newPage();
  await page.goto(`/profile?edit=1&correction=1&venue=${venue.slug}`);
  await expect(page.getByRole('dialog')).toContainText('Remove content that targets or harasses someone.');
  await page.getByRole('dialog').getByRole('button', { name: 'Edit my profile', exact: true }).click();
  const flow = page.getByTestId('focused-corrections');
  await flow.getByRole('textbox', { name: 'First name', exact: true }).fill('CompactAlix');
  await flow.getByRole('textbox', { name: 'Bio', exact: true }).fill('A safe new bio for the reviewer');
  const photo = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#805347' } }).jpeg().toBuffer();
  await flow.locator('input[type=file]').setInputFiles({ name: 'compact.jpg', mimeType: 'image/jpeg', buffer: photo });
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm crop', exact: true }).click();
  await flow.getByRole('button', { name: 'Send for review', exact: true }).click();
  await expect(flow).toContainText('Awaiting approval');
  const submitted = await inspectedProfile(admin, venue.id, alice.id);
  expect(submitted.firstName).toBe('CompactAlix'); expect(submitted.bio).toBe('A safe new bio for the reviewer');
  expect(submitted.changedFields).toEqual(['first_name', 'bio', 'photo']);
  expect(submitted.status).toBe('needs_review');
  const photoState = await owner.from('photo_state').select('pending_id').eq('profile_id', alice.id).single();
  expect(photoState.error).toBeNull(); expect(photoState.data?.pending_id).toBeTruthy();
  const actualPhoto = await owner.from('photo_versions').select('path').eq('id', photoState.data!.pending_id!).single();
  expect(actualPhoto.error).toBeNull(); expect(submitted.photoPath).toBe(actualPhoto.data!.path);
  const reviewer = await (await contextFor(founder)).newPage();
  await reviewer.goto('/admin'); await reviewer.getByRole('button', { name: /Moderation/ }).click();
  const review = await selectReviewProfile(reviewer, venue.id, 'CompactAlix');
  await expect(review.getByText('A safe new bio for the reviewer', { exact: true })).toBeVisible();
  await review.getByRole('button', { name: 'Enlarge profile picture' }).click();
  const picture = reviewer.getByRole('dialog', { name: 'Submitted profile picture' }).locator('img');
  await expect(picture).toBeVisible();
  await expect.poll(() => picture.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await reviewer.keyboard.press('Escape');
  await review.getByRole('button', { name: 'Approve & next' }).click();
  await expect(page).toHaveURL(`/v/${venue.slug}?reviewNight=${venue.nightId}`);
  const next = await inspectedProfile(admin, venue.id, alice.id);
  expect((await admin.rpc('request_profile_corrections', { p_profile: alice.id, p_venue: venue.id, p_revision: next.revision,
    p_fields: [{ field: 'photo', reason: 'multiple_people' }] })).error).toBeNull();
  await page.goto(`/profile?edit=1&correction=1&venue=${venue.slug}`);
  await expect(page.getByRole('dialog')).toContainText('Choose a photo showing only you.');
  await page.getByRole('dialog').getByRole('button', { name: 'Edit my profile', exact: true }).click();
  await expect(flow.getByRole('textbox')).toHaveCount(0);
  expect((await owner.rpc('get_my_profile').single()).data?.first_name).toBe('CompactAlix');
  expect((await owner.rpc('get_my_profile').single()).data?.bio).toBe('A safe new bio for the reviewer');
});

test('a room rejection popup opens all requested editors after one mobile tap', async ({ data, contextFor }) => {
  test.setTimeout(120_000);
  const photo = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#805347' } }).jpeg().toBuffer();
  const alice = await data.identity('RoomAlix', 'woman', undefined, photo);
  const founder = await data.identity('RoomReviewer');
  expect((await data.service.from('admins').insert({ user_id: founder.id })).error).toBeNull();
  const admin = createClient<Database>(data.env.url, data.env.publishableKey, {
    global: { headers: { Authorization: `Bearer ${founder.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const venue = await data.venue(); await data.checkIn(venue, [alice]);
  const original = await inspectedProfile(admin, venue.id, alice.id);
  expect((await admin.rpc('approve_profile_review', { p_profile: alice.id, p_venue: venue.id, p_revision: original.revision })).error).toBeNull();
  const context = await contextFor(alice);
  await context.addInitScript(() => localStorage.setItem('amourette-locale', 'fr'));
  const page = await context.newPage();
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(`/v/${venue.slug}`);
  await expect(page.getByRole('button', { name: 'Quitter la soirée', exact: true })).toBeVisible();
  const approved = await inspectedProfile(admin, venue.id, alice.id);
  expect((await admin.rpc('request_profile_corrections', { p_profile: alice.id, p_venue: venue.id, p_revision: approved.revision,
    p_fields: [{ field: 'first_name', reason: 'misleading_identity' }, { field: 'bio', reason: 'harassment' }, { field: 'photo', reason: 'face_unclear' }] })).error).toBeNull();
  const notice = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Modifier mon profil', exact: true }) });
  await expect(notice).toBeVisible();
  await notice.getByRole('button', { name: 'Modifier mon profil', exact: true }).tap();
  await expect(page).toHaveURL(new RegExp(`/profile\\?edit=1&venue=${venue.slug}&correction=1$`));
  const flow = page.getByTestId('focused-corrections');
  await expect(flow.getByRole('textbox', { name: 'Prénom', exact: true })).toBeVisible();
  await expect(flow.getByRole('textbox', { name: 'Bio', exact: true })).toBeVisible();
  await expect(flow.getByRole('button', { name: 'Choisir une photo', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('room-to-corrections-fr.png'), fullPage: true });
});

test('a newly created profile opens its rejected fields from the room without restarting onboarding', async ({ data, contextFor }) => {
  test.setTimeout(120_000);
  const alice = await data.identity('NewRoomAlix');
  const founder = await data.identity('NewRoomReviewer');
  expect((await data.service.from('admins').insert({ user_id: founder.id })).error).toBeNull();
  const admin = createClient<Database>(data.env.url, data.env.publishableKey, {
    global: { headers: { Authorization: `Bearer ${founder.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const venue = await data.venue();
  const page = await (await contextFor(alice)).newPage();
  await page.goto(`/v/${venue.slug}`);
  await expect(page).toHaveURL(new RegExp(`/profile\\?venue=${venue.slug}$`));
  const next = page.getByRole('button', { name: 'Continue', exact: true });
  await page.getByPlaceholder('First name', { exact: true }).fill('NewRoomAlix');
  await next.click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'new-profile.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII=', 'base64'),
  });
  await page.getByRole('dialog', { name: 'Crop your photo' }).getByRole('button', { name: 'Confirm crop' }).click();
  await page.getByRole('group', { name: 'I am', exact: true }).getByRole('button', { name: 'Woman', exact: true }).click();
  await next.click();
  await page.getByRole('group', { name: 'I’d like to meet', exact: true }).getByRole('button', { name: 'Man', exact: true }).click();
  await next.click();
  await page.getByPlaceholder('Bio (optional)').fill('Here for a real conversation.');
  await next.click();
  await page.getByRole('checkbox', { name: 'I confirm that I am 18 or older.' }).check();
  await page.getByRole('checkbox', { name: /^I agree that Amourette/ }).check();
  const creation = page.waitForResponse(response => new URL(response.url()).pathname === '/api/profile-photo' && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Join tonight', exact: true }).click();
  const created = await creation;
  expect(created.ok()).toBe(true);
  await created.finished();
  await expect(page).toHaveURL(new RegExp(`/v/${venue.slug}$`));
  await expect(page.getByRole('button', { name: 'Leave', exact: true })).toBeVisible();
  const original = await inspectedProfile(admin, venue.id, alice.id);
  expect((await admin.rpc('request_profile_corrections', { p_profile: alice.id, p_venue: venue.id, p_revision: original.revision,
    p_fields: [{ field: 'first_name', reason: 'misleading_identity' }, { field: 'bio', reason: 'harassment' }, { field: 'photo', reason: 'face_unclear' }] })).error).toBeNull();
  const notice = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: 'Edit my profile', exact: true }) });
  await expect(notice).toBeVisible();
  await notice.getByRole('button', { name: 'Edit my profile', exact: true }).tap();
  await expect(page).toHaveURL(new RegExp(`/profile\\?edit=1&venue=${venue.slug}&correction=1$`));
  const flow = page.getByTestId('focused-corrections');
  await expect(flow.getByRole('textbox', { name: 'First name', exact: true })).toBeVisible();
  await expect(flow.getByRole('textbox', { name: 'Bio', exact: true })).toBeVisible();
  await expect(flow.getByRole('button', { name: 'Choose a photo', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('new-profile-corrections.png'), fullPage: true });
});
