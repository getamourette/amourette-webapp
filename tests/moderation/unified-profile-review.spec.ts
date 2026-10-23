import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { correctionStrings } from '../../lib/correction-strings';
import { t } from '../../lib/strings';
import { test, expect, type TestData, type TestIdentity } from '../helpers/fixtures';
import type { APIRequestContext } from '@playwright/test';
import type { Database } from '../../lib/database.types';
import { parseOwnerReview } from '../../lib/profile-review-data';
import { approveProfile, inspectedProfile, selectReviewProfile } from '../helpers/profile-review';

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
  await adminPage.goto('/admin'); await adminPage.getByRole('navigation', { name: 'Admin', exact: true }).getByRole('link', { name: 'Moderation', exact: true }).click();
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
  await expect(prompt).toContainText(correctionStrings.en.compactCopy);
  await expect(ownPage.getByRole('dialog')).toContainText('Remove content that targets or harasses someone.');
  await ownPage.getByRole('dialog').getByRole('button', { name: correctionStrings.en.modify, exact: true }).click();
  await expect(prompt.getByRole('heading', { name: correctionStrings.en.heading, exact: true })).toBeVisible();
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
  await expect(prompt.getByRole('heading', { name: correctionStrings.en.heading, exact: true })).toBeFocused();
  await bio.fill('My reviewed new bio');
  expect((await inspectedProfile(admin, venue.id, alice.id)).status).toBe('awaiting_changes');
  await prompt.getByRole('button', { name: correctionStrings.en.submit, exact: true }).click();
  await expect(prompt).toContainText(correctionStrings.en.waiting);
  await ownPage.reload();
  await expect(prompt).toContainText(correctionStrings.en.waiting);
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
  // Approval and delivery of the owner's authoritative review are prerequisites
  // for the return transition. Keep the navigation deadline for the UI itself.
  const approval = adminPage.waitForResponse(response =>
    new URL(response.url()).pathname === '/rest/v1/rpc/approve_profile_review' && response.request().method() === 'POST');
  const confirmedReview = ownPage.waitForResponse(async response => {
    if (new URL(response.url()).pathname !== '/rest/v1/rpc/my_profile_review' || !response.ok()) return false;
    const body: unknown = await response.json().catch(() => undefined);
    return body === null;
  });
  await Promise.all([
    approval.then(async response => { expect(response.ok()).toBe(true); expect(await response.finished()).toBeNull(); }),
    confirmedReview.then(async response => { expect(await response.finished()).toBeNull(); }),
    review.getByRole('button', { name: 'Approve & next' }).click(),
  ]);
  await expect(ownPage).toHaveURL(`/v/${venue.slug}?reviewNight=${venue.nightId}`);
  await expect(ownPage.getByRole('heading', { name: correctionStrings.en.heading, exact: true })).toHaveCount(0);
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
  await page.getByRole('dialog').getByRole('button', { name: correctionStrings.en.modify, exact: true }).click();
  const flow = page.getByTestId('focused-corrections');
  await flow.getByRole('textbox', { name: 'First name', exact: true }).fill('CompactAlix');
  await flow.getByRole('textbox', { name: 'Bio', exact: true }).fill('A safe new bio for the reviewer');
  const photo = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#805347' } }).jpeg().toBuffer();
  await flow.locator('input[type=file]').setInputFiles({ name: 'compact.jpg', mimeType: 'image/jpeg', buffer: photo });
  await page.getByRole('dialog').getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await flow.getByRole('button', { name: correctionStrings.en.submit, exact: true }).click();
  await expect(flow).toContainText(correctionStrings.en.waiting);
  const submitted = await inspectedProfile(admin, venue.id, alice.id);
  expect(submitted.firstName).toBe('CompactAlix'); expect(submitted.bio).toBe('A safe new bio for the reviewer');
  expect(submitted.changedFields).toEqual(['first_name', 'bio', 'photo']);
  expect(submitted.status).toBe('needs_review');
  const photoState = await owner.from('photo_state').select('pending_id').eq('profile_id', alice.id).single();
  expect(photoState.error).toBeNull(); expect(photoState.data?.pending_id).toBeTruthy();
  const actualPhoto = await owner.from('photo_versions').select('path').eq('id', photoState.data!.pending_id!).single();
  expect(actualPhoto.error).toBeNull(); expect(submitted.photoPath).toBe(actualPhoto.data!.path);
  const reviewer = await (await contextFor(founder)).newPage();
  await reviewer.goto('/admin'); await reviewer.getByRole('navigation', { name: 'Admin', exact: true }).getByRole('link', { name: 'Moderation', exact: true }).click();
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
  await page.getByRole('dialog').getByRole('button', { name: correctionStrings.en.modifyPhoto, exact: true }).click();
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
  // Bootstrap can spend several seconds in authenticated prerequisite reads.
  // Start the UI deadline after discovery arrives, preserving the Leave assertion.
  const discovery = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/rest/v1/rpc/room_candidates' && response.request().method() === 'POST');
  await page.goto(`/v/${venue.slug}`);
  const loaded = await discovery;
  expect(loaded.ok()).toBe(true);
  expect(await loaded.finished()).toBeNull();
  await expect(page.getByRole('button', { name: 'Quitter la soirée', exact: true })).toBeVisible();
  const approved = await inspectedProfile(admin, venue.id, alice.id);
  expect((await admin.rpc('request_profile_corrections', { p_profile: alice.id, p_venue: venue.id, p_revision: approved.revision,
    p_fields: [{ field: 'first_name', reason: 'misleading_identity' }, { field: 'bio', reason: 'harassment' }, { field: 'photo', reason: 'face_unclear' }] })).error).toBeNull();
  const notice = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: correctionStrings.fr.modify, exact: true }) });
  await expect(notice).toBeVisible();
  await notice.getByRole('button', { name: correctionStrings.fr.modify, exact: true }).tap();
  await expect(page).toHaveURL(new RegExp(`/profile\\?edit=1&venue=${venue.slug}&correction=1$`));
  const flow = page.getByTestId('focused-corrections');
  await expect(flow.getByRole('textbox', { name: 'Prénom', exact: true })).toBeVisible();
  await expect(flow.getByRole('textbox', { name: 'Bio', exact: true })).toBeVisible();
  await expect(flow.getByRole('button', { name: t.fr.profile.addPhoto, exact: true })).toBeVisible();
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
  await page.getByRole('dialog').getByRole('button', { name: 'Next' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();
  await page.getByRole('group', { name: 'I am', exact: true }).getByRole('button', { name: 'Woman', exact: true }).click();
  await page.getByRole('group', { name: 'I’d like to meet', exact: true }).getByRole('button', { name: 'Man', exact: true }).click();
  await next.click();
  await page.getByPlaceholder('Bio (optional)').fill('Here for a real conversation.');
  await next.click();
  await page.getByRole('checkbox', { name: 'I’m 18 or older.' }).check();
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
  const notice = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: correctionStrings.en.modify, exact: true }) });
  await expect(notice).toBeVisible();
  await notice.getByRole('button', { name: correctionStrings.en.modify, exact: true }).tap();
  await expect(page).toHaveURL(new RegExp(`/profile\\?edit=1&venue=${venue.slug}&correction=1$`));
  const flow = page.getByTestId('focused-corrections');
  await expect(flow.getByRole('textbox', { name: 'First name', exact: true })).toBeVisible();
  await expect(flow.getByRole('textbox', { name: 'Bio', exact: true })).toBeVisible();
  await expect(flow.getByRole('button', { name: t.en.profile.addPhoto, exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('new-profile-corrections.png'), fullPage: true });
});

async function replacementPhotoState(data: TestData, profile: string) {
  const result = await data.service.from('photo_state').select('displayed_id,pending_id,correction_required,last_action,last_reason,revision').eq('profile_id', profile).single();
  expect(result.error).toBeNull();
  return result.data!;
}
async function uploadReplacement(data: TestData, request: APIRequestContext, owner: TestIdentity) {
  const state = await replacementPhotoState(data, owner.id);
  const photo = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#365e70' } }).jpeg().toBuffer();
  const response = await request.post('/api/profile-photo', {
    headers: { Authorization: `Bearer ${owner.session.access_token}`, ...(process.env.E2E_VERCEL_BYPASS ? { 'x-vercel-protection-bypass': process.env.E2E_VERCEL_BYPASS } : {}) },
    multipart: { revision: String(state.revision), photo: { name: 'replacement.jpg', mimeType: 'image/jpeg', buffer: photo } },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

test('rejecting a voluntary replacement keeps the approved photo, discovery and participant notice', async ({ data, contextFor, request }) => {
  test.setTimeout(120_000);
  const photo = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#805347' } }).jpeg().toBuffer();
  const alice = await data.identity('ReplacementAlice', 'woman', undefined, photo), bob = await data.identity('ReplacementBob', 'man');
  const founder = await data.identity('ReplacementReviewer');
  expect((await data.service.from('admins').insert({ user_id: founder.id })).error).toBeNull();
  const client = (token: string) => createClient<Database>(data.env.url, data.env.publishableKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const owner = client(alice.session.access_token), peer = client(bob.session.access_token), admin = client(founder.session.access_token);
  const venue = await data.venue(); await data.checkIn(venue, [alice, bob]);
  await approveProfile(admin, venue.id, alice.id); await approveProfile(admin, venue.id, bob.id);
  const original = await replacementPhotoState(data, alice.id);
  await uploadReplacement(data, request, alice);
  const pending = await replacementPhotoState(data, alice.id);
  expect(pending.pending_id).toBeTruthy();
  const ownPage = await (await contextFor(alice)).newPage();
  await ownPage.goto(`/profile?edit=1&venue=${venue.slug}`);
  await expect(ownPage.getByText('Your new photo is waiting for review.', { exact: true })).toBeVisible();
  const page = await (await contextFor(founder)).newPage();
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/admin'); await page.getByRole('navigation', { name: 'Admin', exact: true }).getByRole('link', { name: 'Moderation', exact: true }).click();
  const review = await selectReviewProfile(page, venue.id, alice.name);
  await review.getByRole('button', { name: /^Needs review / }).click();
  await expect(review.getByText(alice.name, { exact: true })).toBeVisible();
  for (const label of ['Current photo', 'New photo']) {
    await expect(review.locator('figcaption').getByText(label, { exact: true })).toBeVisible();
    await review.getByRole('button', { name: `Enlarge ${label.toLowerCase()}`, exact: true }).click();
    const picture = page.getByRole('dialog', { name: label, exact: true }).getByRole('img');
    await expect.poll(() => picture.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
  }
  await expect(review.getByText('Approved · visible to others', { exact: true })).toBeVisible();
  await expect(review.getByText('Waiting for your decision', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await review.getByText('Other actions', { exact: true }).click();
  await review.getByRole('button', { name: 'Request profile changes…', exact: true }).click();
  await review.getByRole('checkbox', { name: 'Profile picture', exact: true }).check();
  await expect(review.getByRole('status')).toContainText('removes both the current approved photo and the proposed replacement');
  await expect(review.getByRole('status')).toContainText('hides the profile until a new photo is approved');
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  await review.getByRole('combobox', { name: 'Rejection reason' }).selectOption('multiple_people');
  await review.getByRole('button', { name: 'Reject new photo', exact: true }).click();
  await expect(review.getByRole('heading', { name: 'You’re all caught up' })).toBeVisible();
  const final = await replacementPhotoState(data, alice.id);
  expect(final).toMatchObject({ displayed_id: original.displayed_id, pending_id: null, correction_required: false, last_action: 'rejected', last_reason: 'multiple_people' });
  const versions = await data.service.from('photo_versions').select('id,status').in('id', [original.displayed_id!, pending.pending_id!]);
  expect(versions.error).toBeNull();
  expect(versions.data).toEqual(expect.arrayContaining([{ id: original.displayed_id, status: 'approved' }, { id: pending.pending_id, status: 'rejected' }]));
  const mine = await owner.rpc('my_profile_review'); expect(mine.error).toBeNull(); expect(mine.data).toBeNull();
  expect((await inspectedProfile(admin, venue.id, alice.id)).status).toBe('approved');
  const candidates = await peer.rpc('room_candidates', { p_venue_id: venue.id });
  expect(candidates.error).toBeNull(); expect(candidates.data?.some(row => row.id === alice.id)).toBe(true);
  // The editor status must refresh without navigating or reloading.
  await expect(ownPage.getByTestId('photo-rejection-inline')).toHaveText('Your last photo was declined: choose a photo showing only you. This one stays visible.');
  await expect(ownPage.getByRole('dialog')).toHaveCount(0);
});

test('replacement rejection refuses non-replacement, stale revision, invalid reason and non-admin without effects', async ({ data, request }) => {
  const alice = await data.identity('ReplacementGuard', 'woman');
  const founder = await data.identity('ReplacementGuardReviewer');
  expect((await data.service.from('admins').insert({ user_id: founder.id })).error).toBeNull();
  const client = (token: string) => createClient<Database>(data.env.url, data.env.publishableKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const owner = client(alice.session.access_token), admin = client(founder.session.access_token);
  const venue = await data.venue(); await data.checkIn(venue, [alice]);
  const initial = await inspectedProfile(admin, venue.id, alice.id);
  const before = await replacementPhotoState(data, alice.id);
  const args = { p_profile: alice.id, p_venue: venue.id, p_revision: initial.revision, p_reason: 'face_unclear' };
  expect((await admin.rpc('reject_profile_photo_replacement', args)).error?.code).toBe('PT409');
  expect(await replacementPhotoState(data, alice.id)).toEqual(before);
  await approveProfile(admin, venue.id, alice.id);
  const approved = await inspectedProfile(admin, venue.id, alice.id);
  await uploadReplacement(data, request, alice);
  const pending = await replacementPhotoState(data, alice.id);
  const review = await inspectedProfile(admin, venue.id, alice.id);
  expect(review.photoReplacement).toBe(true);
  expect((await admin.rpc('reject_profile_photo_replacement', { ...args, p_revision: approved.revision })).error?.code).toBe('PT409');
  expect((await admin.rpc('reject_profile_photo_replacement', { ...args, p_revision: review.revision, p_reason: 'hateful' })).error?.code).toBe('22023');
  expect((await owner.rpc('reject_profile_photo_replacement', { ...args, p_revision: review.revision })).error?.code).toBe('42501');
  expect(await replacementPhotoState(data, alice.id)).toEqual(pending);
  expect((await inspectedProfile(admin, venue.id, alice.id)).revision).toBe(review.revision);
  const version = await data.service.from('photo_versions').select('status').eq('id', pending.pending_id!).single();
  expect(version.error).toBeNull(); expect(version.data?.status).toBe('unverified');
});
