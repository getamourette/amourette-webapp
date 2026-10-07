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
  await page.getByTestId('profile-correction-prompt').getByRole('button', { name: 'Continue corrections' }).click();
  await expect(page).toHaveURL(/\/profile\?.*correction=1/);
  await expect(page.getByTestId('focused-corrections').getByRole('heading', { name: 'Let’s update your first name' })).toBeVisible();
});
