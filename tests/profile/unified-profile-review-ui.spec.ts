// Controlled RPC transport exercises the real mounted screens without shared
// data writes. The separate SQL test executes the actual migration and RLS.
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { mockNameUi, nameIds, nameUiState } from '../helpers/name-ui-fixture';
import { reviewCounts, orderedReviews, type ReviewProfile } from '../../lib/profile-review';
import { mockCorrections } from '../helpers/correction-ui';
import { correctionStrings } from '../../lib/correction-strings';
import { profileReviewStrings } from '../../lib/profile-review-strings';
import type { Locale } from '../../lib/strings';

async function allowLocalDevelopmentSocket(context: BrowserContext) {
  // The transport fixture closes external sockets. Next's development client
  // also needs its own local HMR connection before hydrating the mounted page.
  await context.routeWebSocket(url => ['127.0.0.1', '127.0.0.2', 'localhost'].includes(url.hostname) && url.pathname.startsWith('/_next/'), socket => { socket.connectToServer(); });
}

async function mockLiveRoom(context: BrowserContext, locale: Locale = 'fr') {
  await allowLocalDevelopmentSocket(context);
  await context.addInitScript(locale => {
    localStorage.setItem('amourette-locale', locale);
    localStorage.setItem('amourette-room-hint-dismissed', '1');
  }, locale);
  const night = { venue_id: nameIds.venue, venue_night_id: nameIds.night, status: 'live', participant_count: 3,
    launch_threshold: 4, guaranteed_launch_at: new Date().toISOString(), closes_at: new Date(Date.now() + 3600000).toISOString(), terminal_reason: null };
  await context.route('**/rest/v1/**', route => {
    const request = route.request(), name = new URL(request.url()).pathname.split('/').at(-1);
    const rows = (value: unknown[]) => route.fulfill({ json: request.headers().accept?.includes('object+json') ? value[0] ?? null : value });
    if (name === 'venues') return rows([{ id: nameIds.venue, name: 'Test bar', slug: 'test-bar', city: 'Paris', timezone: 'Europe/Paris' }]);
    if (name === 'venue_night_state' || name === 'venue_night_public_state') return rows([night]);
    if (name === 'profile_private') return rows([{ adult_confirmed_at: new Date().toISOString() }]);
    if (name === 'presence') return rows([{ id: nameIds.alice, profile_id: nameIds.alice, venue_night_id: nameIds.night, left_at: null, is_visible: true }]);
    if (name === 'matches') return rows([]);
    return route.fallback();
  });
}

async function captureRoom(page: Page, name: string) {
  if (!process.env.E2E_SCREENSHOTS_DIR) return;
  await mkdir(process.env.E2E_SCREENSHOTS_DIR, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(process.env.E2E_SCREENSHOTS_DIR, `${name}.png`), scale: 'css' });
}

for (const locale of ['fr', 'en', 'es'] as const) {
  for (const photoOnly of [true, false]) {
    for (const pending of [false, true]) {
      test(`hidden live room: ${locale}, ${photoOnly ? 'photo' : 'profile'}, ${pending ? 'pending' : 'awaiting'}`, async ({ context, page }) => {
        const fixture = await mockCorrections(context, photoOnly ? ['photo'] : ['first_name', 'photo']);
        fixture.state.notification = false;
        fixture.state.status = pending ? 'needs_review' : 'awaiting_changes';
        await mockLiveRoom(context, locale);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/v/test-bar');
        const c = correctionStrings[locale];
        const prompt = page.getByTestId('profile-correction-prompt');
        const title = prompt.getByRole('heading', { name: c.roomHiddenTitle });
        await expect(title).toBeVisible();
        await expect(title).toHaveClass(/wordmark/);
        await expect(prompt).not.toHaveClass(/night-panel/);
        await expect(prompt).toContainText(pending
          ? photoOnly ? c.roomPhotoPending : c.roomProfilePending
          : photoOnly ? c.roomPhotoCorrection : c.roomProfileCorrection);
        await expect(prompt.getByRole('button')).toHaveCount(1);
        await expect(page.locator('.night-button-primary:visible')).toHaveCount(pending ? 0 : 1);
        const action = prompt.getByRole('button', { name: pending ? c.viewStatus : photoOnly ? c.modifyPhoto : c.modify, exact: true });
        await expect(action).toBeInViewport();
        await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
        if (locale === 'fr') await captureRoom(page, `room-${photoOnly ? 'photo' : 'profile'}-${pending ? 'pending' : 'awaiting'}-fr`);
        await action.click();
        await expect(page).toHaveURL(/\/profile\?edit=1&venue=test-bar&correction=1/);
        await expect(page.getByTestId('focused-corrections')).toBeVisible();
        expect(fixture.commands.acknowledgements).toBe(1);
        if (pending) await expect(page.getByTestId('focused-corrections')).toContainText(c.waiting);
      });
    }
  }
}

test('the rejection notice opens over the hidden room and dismisses back to its primary action', async ({ context, page }) => {
  const fixture = await mockCorrections(context, ['photo']);
  await mockLiveRoom(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/v/test-bar');
  const notice = page.getByRole('dialog');
  await expect(notice.getByRole('heading', { name: correctionStrings.fr.photoRejected })).toBeVisible();
  await expect(page.getByTestId('profile-correction-prompt')).toContainText(correctionStrings.fr.roomHiddenTitle);
  await captureRoom(page, 'room-notice-fr');
  await page.keyboard.press('Escape');
  await expect(notice).toHaveCount(0);
  expect(fixture.commands.acknowledgements).toBe(1);
  await expect(page.getByTestId('profile-correction-prompt').getByRole('button', { name: correctionStrings.fr.modifyPhoto })).toBeVisible();
});

test('a room review failure shows one retry and suppresses legacy correction cards', async ({ context, page }) => {
  const fixture = await mockCorrections(context, ['first_name', 'photo']);
  fixture.faults.review = true;
  fixture.state.notification = false;
  await mockLiveRoom(context);
  await page.goto('/v/test-bar');
  const alerts = page.getByRole('main').getByRole('alert');
  await expect(alerts).toHaveCount(1);
  await expect(alerts).toContainText(profileReviewStrings.fr.error);
  await expect(page.getByTestId('text-correction-status')).toHaveCount(0);
  await expect(page.getByTestId('photo-status')).toHaveCount(0);
  fixture.faults.review = false;
  await page.getByRole('button', { name: 'Actualiser', exact: true }).click();
  await expect(alerts).toHaveCount(0);
  await expect(page.getByRole('heading', { name: correctionStrings.fr.roomHiddenTitle })).toBeVisible();
});

test('legacy photo correction uses the hidden room and keeps its editor link in both states', async ({ context, page }) => {
  await mockCorrections(context, ['photo']);
  await context.route('**/rest/v1/rpc/my_profile_review', route => route.fulfill({ json: null }));
  let pending = false;
  await context.route('**/rest/v1/photo_state?*', route => route.fulfill({ json: {
    profile_id: nameIds.alice, displayed_id: null, pending_id: pending ? nameIds.bob : null,
    correction_required: true, reason: 'face_unclear', last_action: 'rejected', last_reason: 'face_unclear', revision: 1,
  } }));
  await mockLiveRoom(context);
  await page.goto('/v/test-bar');
  const room = page.getByTestId('room-correction-state');
  await expect(room.getByRole('heading', { name: correctionStrings.fr.roomHiddenTitle })).toBeVisible();
  await expect(room.getByRole('link', { name: correctionStrings.fr.modifyPhoto })).toHaveAttribute('href', '/profile?edit=1&venue=test-bar');
  await expect(room.locator('.night-button-primary')).toHaveCount(1);
  pending = true;
  await page.reload();
  await expect(room).toContainText(correctionStrings.fr.roomPhotoPending);
  await expect(room.locator('.night-button-primary')).toHaveCount(0);
  await expect(room.getByRole('link', { name: correctionStrings.fr.viewStatus })).toHaveAttribute('href', '/profile?edit=1&venue=test-bar');
});

test('legacy text correction remains reachable when unified review is unavailable', async ({ context, page }) => {
  await mockCorrections(context, ['first_name']);
  await context.route('**/rest/v1/rpc/my_profile_review', route => route.fulfill({ status: 404, json: { code: 'PGRST202' } }));
  await mockLiveRoom(context);
  await page.goto('/v/test-bar');
  const legacy = page.getByTestId('text-correction-status');
  await expect(legacy).toBeVisible();
  await expect(legacy.getByRole('link')).toHaveAttribute('href', '/profile?edit=1&venue=test-bar');
  await expect(page.getByTestId('profile-correction-prompt')).toHaveCount(0);
});

const emptyVenue = '00000000-0000-4000-8000-000000000030';
const profile = (id: string, firstName: string): ReviewProfile => ({ id, firstName, bio: 'A complete profile', photoPath: null, photoReplacement: false, currentPhotoPath: null,
  revision: crypto.randomUUID(), status: 'needs_review', submittedAt: '2026-10-03T19:00:00Z',
  resubmission: false, approvedFields: [], changedFields: [], correction: null });

test('real admin integration scopes counts, refuses stale decisions and advances one consolidated request', async ({ context, page }) => {
  await mockNameUi(context, nameUiState(), 'admin');
  await allowLocalDevelopmentSocket(context);
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
  await page.goto('/admin'); await page.getByRole('navigation', { name: 'Admin', exact: true }).getByRole('link', { name: 'Moderation', exact: true }).click();
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
  await allowLocalDevelopmentSocket(context);
  const correction = {
    profileId: nameIds.alice, requestId: crypto.randomUUID(), revision: crypto.randomUUID(), status: 'awaiting_changes',
    fields: [{ field: 'first_name', reason: 'harassment' }, { field: 'bio', reason: 'inappropriate' }, { field: 'photo', reason: 'multiple_people' }],
    updatedFields: [], canSubmit: false, notification: true,
  };
  await context.route('**/rest/v1/rpc/my_profile_review', route => route.fulfill({ json: correction }));
  await context.route('**/rest/v1/rpc/acknowledge_profile_correction', route => {
    correction.notification = false;
    return route.fulfill({ json: null });
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`/chat/${nameIds.match}`);
  await expect(page.getByTestId('profile-correction-prompt')).toBeVisible();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const input = page.getByTestId('chat-input');
  await expect(input).toBeEnabled(); await input.fill('Still here'); await expect(input).toBeFocused();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 320);
  const box = await input.boundingBox(); expect(box!.y + box!.height).toBeLessThanOrEqual(568);
  await page.screenshot({ path: test.info().outputPath('unified-owner-chat-mobile.png') });
  await page.getByTestId('profile-correction-prompt').getByRole('button', { name: 'Fix my profile' }).click();
  await expect(page).toHaveURL(/\/profile\?.*correction=1/);
  if (await page.getByRole('dialog').count()) await page.getByRole('dialog').getByRole('button', { name: 'Fix my profile', exact: true }).click();
  await expect(page.getByTestId('focused-corrections').getByRole('heading', { name: 'Correct your profile', exact: true })).toBeVisible();
});

for (const needsTextReview of [false, true]) test(`replacement review compares photos at desktop and 320px, with text review=${needsTextReview}`, async ({ context, page }, info) => {
  await mockNameUi(context, nameUiState(), 'admin');
  const candidate: ReviewProfile = { ...profile(nameIds.alice, 'Alice'), photoReplacement: true,
    currentPhotoPath: '/test-profiles/portrait-1.svg', photoPath: '/test-profiles/portrait-2.svg',
    approvedFields: needsTextReview ? ['first_name'] : ['first_name', 'bio'] };
  const commands: Record<string, unknown>[] = [];
  await context.route('**/rest/v1/rpc/admin_profile_reviews', route => {
    const args = route.request().postDataJSON();
    return route.fulfill({ json: { venueId: args.p_venue, filter: args.p_filter, offset: args.p_offset,
      counts: reviewCounts([candidate]), profiles: orderedReviews([candidate], args.p_filter) } });
  });
  await context.route('**/rest/v1/rpc/approve_profile_review', route => {
    commands.push(route.request().postDataJSON()); candidate.status = 'approved';
    return route.fulfill({ json: null });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/admin');
  await page.getByRole('navigation', { name: 'Admin', exact: true }).getByRole('link', { name: 'Moderation', exact: true }).click();
  const review = page.getByTestId('admin-profile-review');
  await review.getByRole('combobox', { name: 'Venue' }).selectOption(nameIds.venue);
  await review.getByRole('button', { name: /^Needs review / }).click();
  const decide = review.getByRole('region', { name: 'To decide · Photo replacement' });
  const approved = review.getByRole('complementary', { name: 'Already approved' });
  await expect(approved.getByText('Alice', { exact: true })).toBeVisible();
  await expect((needsTextReview ? decide : approved).getByText('A complete profile', { exact: true })).toBeVisible();
  await expect(decide.getByText('Needs review', { exact: true })).toHaveCount(needsTextReview ? 1 : 0);
  const approve = decide.getByRole('button', { name: needsTextReview ? 'Approve profile & new photo' : 'Approve new photo', exact: true });
  await expect(approve).toBeVisible();
  await expect(review.getByRole('button', { name: 'Approve & next', exact: true })).toHaveCount(0);
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const current = decide.getByRole('button', { name: 'Enlarge current photo', exact: true });
    const proposed = decide.getByRole('button', { name: 'Enlarge new photo', exact: true });
    await expect(current.getByRole('img')).toBeVisible(); await expect(proposed.getByRole('img')).toBeVisible();
    const [left, right] = await Promise.all([current.boundingBox(), proposed.boundingBox()]);
    expect(Math.abs(left!.y - right!.y)).toBeLessThan(2);
    expect(left!.x + left!.width).toBeLessThanOrEqual(right!.x);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width);
    await expect(review.getByRole('button', { name: 'Request profile changes…', exact: true })).toBeHidden();
    await page.screenshot({ path: info.outputPath(`replacement-${needsTextReview}-${width}.png`), fullPage: true });
    for (const [button, title] of [[current, 'Current photo'], [proposed, 'New photo']] as const) {
      await button.click();
      await expect(page.getByRole('dialog', { name: title, exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
    }
  }
  await review.getByText('Other actions', { exact: true }).click();
  await review.getByRole('button', { name: 'Request profile changes…', exact: true }).click();
  await review.getByRole('checkbox', { name: 'Profile picture', exact: true }).check();
  await expect(review.getByRole('status')).toContainText('removes both the current approved photo and the proposed replacement');
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  await approve.click();
  expect(commands).toEqual([{ p_profile: candidate.id, p_venue: nameIds.venue, p_revision: candidate.revision }]);
});

for (const action of ['reject', 'approve'] as const) test(`a stale replacement ${action} shows its alert and allows reloading before another decision`, async ({ context, page }) => {
  await mockNameUi(context, nameUiState(), 'admin');
  const candidate: ReviewProfile = { ...profile(nameIds.alice, 'Alice'), photoReplacement: true,
    currentPhotoPath: '/test-profiles/portrait-1.svg', photoPath: '/test-profiles/portrait-2.svg',
    approvedFields: ['first_name', 'bio'] };
  const inspectedRevision = candidate.revision;
  const commands: Record<string, unknown>[] = [];
  await context.route('**/rest/v1/rpc/admin_profile_reviews', route => {
    const args = route.request().postDataJSON();
    return route.fulfill({ json: { venueId: args.p_venue, filter: args.p_filter, offset: args.p_offset,
      counts: reviewCounts([candidate]), profiles: orderedReviews([candidate], args.p_filter) } });
  });
  const rpc = action === 'reject' ? 'reject_profile_photo_replacement' : 'approve_profile_review';
  await context.route(`**/rest/v1/rpc/${rpc}`, route => {
    commands.push(route.request().postDataJSON());
    candidate.revision = crypto.randomUUID();
    candidate.bio = 'Updated while the decision was being made';
    return route.fulfill({ status: 409, json: { code: 'PT409' } });
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/admin');
  await page.getByRole('navigation', { name: 'Admin', exact: true }).getByRole('link', { name: 'Moderation', exact: true }).click();
  const review = page.getByTestId('admin-profile-review');
  await review.getByRole('combobox', { name: 'Venue' }).selectOption(nameIds.venue);
  await review.getByRole('button', { name: /^Needs review / }).click();
  const decision = review.getByRole('region', { name: 'To decide · Photo replacement' });
  const approve = decision.getByRole('button', { name: 'Approve new photo', exact: true });
  const reject = decision.getByRole('button', { name: 'Reject new photo', exact: true });
  const reason = decision.getByRole('combobox', { name: 'Rejection reason', exact: true });
  if (action === 'reject') await reason.selectOption('multiple_people');
  await (action === 'reject' ? reject : approve).click();

  const alert = review.getByRole('alert');
  await expect(alert).toHaveCount(1);
  await expect(alert.locator('p')).toHaveText('This profile changed while you were reviewing it. Reload and inspect the latest submission before deciding.');
  await expect(alert).toBeVisible();
  const reload = alert.getByRole('button', { name: 'Reload profile', exact: true });
  await expect(reload).toBeVisible();
  await expect(reload).toBeEnabled();
  await expect(approve).toBeDisabled();
  await expect(reject).toBeDisabled();
  await expect(reason).toBeDisabled();
  expect(commands).toEqual([{ p_profile: candidate.id, p_venue: nameIds.venue, p_revision: inspectedRevision,
    ...(action === 'reject' ? { p_reason: 'multiple_people' } : {}) }]);

  await reload.click();
  await expect(review.getByText(candidate.bio!, { exact: true })).toBeVisible();
  await expect(alert).toHaveCount(0);
  await expect(approve).toBeEnabled();
  await expect(reject).toBeEnabled();
  await expect(reason).toBeEnabled();
  expect(commands).toHaveLength(1);
});
