// Controlled RPC transport exercises the real mounted screens without shared
// data writes. The separate SQL test executes the actual migration and RLS.
import { test, expect } from '@playwright/test';
import { mockNameUi, nameIds, nameUiState } from '../helpers/name-ui-fixture';
import { reviewCounts, orderedReviews, type ReviewProfile } from '../../lib/profile-review';

const emptyVenue = '00000000-0000-4000-8000-000000000030';
const profile = (id: string, firstName: string): ReviewProfile => ({ id, firstName, bio: 'A complete profile', photoPath: null,
  revision: crypto.randomUUID(), status: 'needs_review', submittedAt: '2026-10-03T19:00:00Z',
  resubmission: false, approvedFields: [], changedFields: [], correction: null });

test('real admin integration scopes counts, refuses stale decisions and advances one consolidated request', async ({ context, page }) => {
  await mockNameUi(context, nameUiState(), 'admin');
  const profiles = [profile(nameIds.alice, 'Alice'), profile(nameIds.bob, 'Bob')];
  const commands: Record<string, unknown>[] = [];
  let stale = true;
  await context.route('**/rest/v1/venues?*', route => route.fulfill({ json: [{ id: nameIds.venue, name: 'Test bar' }, { id: emptyVenue, name: 'Empty bar' }] }));
  await context.route('**/rest/v1/rpc/admin_profile_reviews', route => {
    const args = route.request().postDataJSON();
    const scoped = args.p_venue === nameIds.venue ? profiles : [];
    return route.fulfill({ json: { venueId: args.p_venue, filter: args.p_filter, offset: args.p_offset,
      counts: reviewCounts(scoped), profiles: orderedReviews(scoped, args.p_filter).slice(args.p_offset, args.p_offset + 1) } });
  });
  await context.route('**/rest/v1/rpc/approve_profile_review', route => {
    const args = route.request().postDataJSON(); commands.push(args);
    if (stale) { stale = false; profiles[0].revision = crypto.randomUUID(); return route.fulfill({ status: 409, json: { code: 'PT409' } }); }
    Object.assign(profiles.find(p => p.id === args.p_profile)!, { status: 'approved', approvedFields: ['first_name', 'bio', 'photo'] });
    return route.fulfill({ json: null });
  });
  await context.route('**/rest/v1/rpc/request_profile_corrections', route => {
    const args = route.request().postDataJSON(); commands.push(args);
    Object.assign(profiles.find(p => p.id === args.p_profile)!, { status: 'awaiting_changes', correction: {
      fields: args.p_fields, original: { firstName: 'Alice', bio: 'A complete profile', photoPath: null },
    } });
    return route.fulfill({ json: null });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/admin'); await page.getByRole('button', { name: /Moderation/ }).click();
  const review = page.getByTestId('admin-profile-review');
  await expect(review.getByText('Alice', { exact: true })).toBeVisible();
  await review.getByRole('button', { name: /^Needs review / }).click();
  await review.getByRole('combobox', { name: 'Venue' }).selectOption(nameIds.venue);
  await expect(review.getByText('Alice', { exact: true })).toBeVisible();
  await expect(page.getByTestId('admin-name-corrections')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Active queue', exact: true })).toBeVisible();
  const inspected = profiles[0].revision;
  await review.getByRole('button', { name: 'Approve & next' }).click();
  await expect(review.getByRole('alert')).toContainText('This profile changed');
  await page.screenshot({ path: test.info().outputPath('unified-admin-stale-desktop.png'), fullPage: true });
  expect(commands[0].p_revision).toBe(inspected);
  await expect(review.getByRole('button', { name: 'Approve & next' })).toBeDisabled();
  await review.getByRole('button', { name: 'Reload profile' }).click();
  await review.getByRole('button', { name: 'Request changes', exact: true }).click();
  await review.getByRole('checkbox', { name: 'Name', exact: true }).check();
  await review.getByRole('checkbox', { name: 'Bio', exact: true }).check();
  await review.getByRole('combobox', { name: 'Bio reason' }).selectOption('harassment');
  await page.screenshot({ path: test.info().outputPath('unified-admin-correction-desktop.png'), fullPage: true });
  await review.getByRole('button', { name: 'Request changes & next' }).click();
  await expect(review.getByText('Bob', { exact: true })).toBeVisible();
  expect(commands[1]).toMatchObject({ p_profile: nameIds.alice, p_venue: nameIds.venue, p_fields: [{ field: 'first_name', reason: 'inappropriate' }, { field: 'bio', reason: 'harassment' }] });
  await review.getByRole('button', { name: 'Approve & next' }).click();
  await expect(review.getByText('You’re all caught up')).toBeVisible();
  await review.getByRole('button', { name: 'Awaiting changes 1 profiles' }).click();
  await expect(review.getByText('Alice', { exact: true }).first()).toBeVisible();
  await expect(review.getByRole('button', { name: 'Request changes', exact: true })).toHaveCount(0);
  await review.getByRole('combobox', { name: 'Venue' }).selectOption(emptyVenue);
  await expect(review.getByText('Alice', { exact: true })).toHaveCount(0);
  await expect(review.getByRole('button', { name: 'All profiles 0 profiles' })).toBeVisible();
});

test('real owner integration consolidates notice, opens field editors and explicitly resubmits after partial edits', async ({ context, page }) => {
  const names = nameUiState(); names.name = null; names.bio = null;
  await mockNameUi(context, names);
  const fields = ['first_name', 'bio'] as const;
  const state = { profileId: nameIds.alice, requestId: crypto.randomUUID(), revision: crypto.randomUUID(), status: 'awaiting_changes',
    fields: fields.map(field => ({ field, reason: 'harassment' })), updatedFields: [] as string[], canSubmit: false, notification: true };
  const text = fields.map(field => ({ field, revision: crypto.randomUUID(), required: true, reason: 'harassment', status: null as string | null,
    request_id: null as string | null, proposed_text: null as string | null }));
  let submissions = 0;
  let delayedTextRead: Promise<void> | null = null;
  let releaseTextRead: () => void = () => {};
  await context.route('**/rest/v1/rpc/my_profile_review', route => route.fulfill({ json: state }));
  await context.route('**/rest/v1/rpc/my_text_corrections', async route => {
    if (delayedTextRead) await delayedTextRead;
    await route.fulfill({ json: text });
  });
  await context.route('**/rest/v1/rpc/acknowledge_profile_correction', route => {
    expect(route.request().postDataJSON().p_request_id).toBe(state.requestId);
    state.notification = false; return route.fulfill({ json: null });
  });
  await context.route('**/rest/v1/rpc/submit_name_correction', async route => {
    const args = route.request().postDataJSON();
    names.corrections.push({ id: args.p_request_id, proposed_name: args.p_proposed_name, profile_id: nameIds.alice, status: 'pending', created_at: new Date().toISOString(), resolved_at: null, reviewed_by: null });
    state.updatedFields.push('first_name'); state.revision = crypto.randomUUID();
    await route.fulfill({ json: args.p_request_id });
  });
  await context.route('**/rest/v1/rpc/submit_bio_correction', route => {
    const args = route.request().postDataJSON();
    Object.assign(text[1], { status: 'pending', request_id: args.p_request_id, proposed_text: args.p_proposed_text });
    state.updatedFields.push('bio'); state.canSubmit = true; state.revision = crypto.randomUUID();
    return route.fulfill({ json: args.p_request_id });
  });
  await context.route('**/rest/v1/rpc/submit_profile_review', route => {
    submissions++; expect(route.request().postDataJSON().p_revision).toBe(state.revision);
    // Simulate a lost success response. The fresh owner read must confirm the
    // durable submission instead of sending a second command or false error.
    state.status = 'needs_review'; return route.fulfill({ status: 503, json: { message: 'Lost response' } });
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/profile?edit=1');
  const prompt = page.getByTestId('profile-correction-prompt');
  await expect(prompt).toContainText('Your profile is hidden until approved');
  await expect(page.getByTestId('text-correction-status')).toHaveCount(0);
  await prompt.getByRole('button', { name: 'Got it' }).click();
  await prompt.getByRole('button', { name: 'Edit name' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('textbox', { name: 'Requested first name' }).fill('Alix');
  await page.getByRole('button', { name: 'Save name changes' }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('amourette-participant-refresh')));
  await expect(prompt.getByText('Updated', { exact: true })).toHaveCount(1);
  await expect(prompt.getByRole('button', { name: 'Submit for review' })).toBeDisabled();
  expect(submissions).toBe(0);
  delayedTextRead = new Promise<void>(resolve => { releaseTextRead = resolve; });
  await page.reload();
  await expect(prompt).toContainText('Your profile is hidden until approved');
  await prompt.getByRole('button', { name: 'Edit bio' }).click();
  releaseTextRead(); delayedTextRead = null;
  const bio = page.getByRole('textbox', { name: 'Bio', exact: true });
  await expect(bio).toBeFocused(); await bio.fill('A revised bio');
  await page.getByTestId('bio-correction').getByRole('button', { name: 'Save bio changes' }).click();
  await expect(prompt.getByRole('button', { name: 'Submit for review' })).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath('unified-owner-ready-mobile.png'), fullPage: true });
  expect(submissions).toBe(0);
  await prompt.getByRole('button', { name: 'Submit for review' }).click();
  await expect(prompt.getByRole('heading', { name: 'Your changes are waiting for review' })).toBeVisible();
  await expect(prompt.getByRole('alert')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('unified-owner-pending-mobile.png'), fullPage: true });
  expect(submissions).toBe(1);
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 320);
  await page.reload(); await expect(prompt.getByRole('button', { name: 'Got it' })).toHaveCount(0);
});

test('consolidated owner correction keeps the existing chat composer reachable at 320px', async ({ context, page }) => {
  await mockNameUi(context, nameUiState());
  await context.route('**/rest/v1/rpc/my_profile_review', route => route.fulfill({ json: {
    profileId: nameIds.alice, requestId: crypto.randomUUID(), revision: crypto.randomUUID(), status: 'awaiting_changes',
    fields: [{ field: 'first_name', reason: 'harassment' }, { field: 'bio', reason: 'inappropriate' }, { field: 'photo', reason: 'multiple_people' }],
    updatedFields: [], canSubmit: false, notification: true,
  } }));
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`/chat/${nameIds.match}`);
  await expect(page.getByTestId('profile-correction-prompt')).toBeVisible();
  const input = page.getByTestId('chat-input');
  await expect(input).toBeEnabled(); await input.fill('Still here'); await expect(input).toBeFocused();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 320);
  const box = await input.boundingBox(); expect(box!.y + box!.height).toBeLessThanOrEqual(568);
  await page.screenshot({ path: test.info().outputPath('unified-owner-chat-mobile.png') });
});
