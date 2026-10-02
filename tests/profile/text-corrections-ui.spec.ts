// Controlled transport tests never write to the shared project. Database policy
// and concurrency are exercised separately using the actual prepared migration.
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { mockNameUi, nameIds, nameUiState } from '../helpers/name-ui-fixture';
import type { TextCorrection } from '../../lib/text-moderation';

const fieldState = (field: 'first_name' | 'bio'): TextCorrection => ({
  field, revision: crypto.randomUUID(), required: false, reason: null,
  request_id: null, proposed_text: null, status: null,
});
async function setup(context: BrowserContext, actor: 'alice' | 'bob' | 'admin' = 'alice') {
  const profile = nameUiState();
  const fields = [fieldState('first_name'), fieldState('bio')];
  const calls: Record<string, unknown>[] = [];
  let fail = false;
  await mockNameUi(context, profile, actor);
  await context.route('**/rest/v1/rpc/my_text_corrections', route => route.fulfill({ json: actor === 'alice' ? fields : [] }));
  await context.route('**/rest/v1/rpc/submit_bio_correction', route => {
    const body = route.request().postDataJSON(); calls.push(body);
    if (fail) return route.fulfill({ status: 503, json: { message: 'Retry' } });
    Object.assign(fields[1], { status: 'pending', request_id: body.p_request_id, proposed_text: body.p_proposed_text || null });
    return route.fulfill({ json: body.p_request_id });
  });
  await context.route('**/rest/v1/rpc/cancel_bio_correction', route => {
    fields[1].status = 'cancelled'; return route.fulfill({ json: 'cancelled' });
  });
  const reviewRows = () => fields.map(row => ({ ...row, profile_id: nameIds.alice,
    first_name: profile.name, published_text: row.field === 'bio' ? profile.bio : profile.name,
    rejected_text: row.required ? 'Rejected content visible only to reviewer' : null,
  }));
  await context.route('**/rest/v1/rpc/admin_text_reviews', route => route.fulfill({ json: reviewRows() }));
  await context.route('**/rest/v1/rpc/admin_text_history', route => route.fulfill({ json: [] }));
  await context.route('**/rest/v1/rpc/require_profile_text_correction', route => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({ status: 409, json: { code: 'PT409', message: 'Review changed' } });
  });
  return { profile, fields, calls, fail(value: boolean) { fail = value; },
    reject(field: 'first_name' | 'bio') {
      Object.assign(fields.find(row => row.field === field)!, { required: true, reason: 'inappropriate', revision: crypto.randomUUID() });
      if (field === 'bio') profile.bio = null; else profile.name = null;
    },
  };
}
async function refresh(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('amourette-participant-refresh')));
}

test('bio correction preserves drafts, validates code points, retries the same request and requires review of an empty bio', async ({ context, page }) => {
  const state = await setup(context); state.reject('bio');
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/profile?edit=1');
  await expect(page.getByTestId('text-correction-status')).toContainText('Your profile can still appear without it');
  await expect(page.getByTestId('current-first-name')).toHaveText('Alice');
  const input = page.getByRole('textbox', { name: 'Bio', exact: true });
  const submit = page.getByRole('button', { name: 'Submit for review' });
  await input.fill('😀'.repeat(301)); await expect(submit).toBeDisabled();
  await input.fill('😀'.repeat(300)); await expect(submit).toBeEnabled();
  state.fail(true); await submit.click();
  await expect(page.getByTestId('bio-correction').getByRole('alert')).toContainText('Could not confirm');
  await expect(input).toHaveValue('😀'.repeat(300));
  state.fail(false); await submit.click();
  await expect(page.getByTestId('bio-correction')).toContainText('Waiting for review');
  expect(state.calls[0].p_request_id).toBe(state.calls[1].p_request_id);
  expect(state.profile.patches).toHaveLength(0);
  await page.getByRole('button', { name: 'Cancel this request' }).click();
  await expect(input).toBeVisible(); await input.fill(''); await submit.click();
  await expect(page.getByTestId('bio-correction')).toContainText('No bio');
  await expect(page.getByTestId('text-correction-status')).toContainText('Your bio is hidden');
  expect(state.calls.at(-1)!.p_proposed_text).toBe('');
  Object.assign(state.fields[1], { required: false, reason: null, status: 'approved' });
  await refresh(page);
  await expect(page.getByTestId('text-correction-status')).toContainText('Correction approved');
  await expect(page.getByRole('button', { name: 'Save my bio' })).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 320);
});

test('both restrictions remain understandable in EN/FR/ES at 320px and a rejected replacement remains correctable', async ({ context, page }) => {
  const state = await setup(context); state.reject('first_name'); state.reject('bio');
  Object.assign(state.fields[1], { status: 'rejected', request_id: crypto.randomUUID(), proposed_text: 'Rejected replacement' });
  await page.setViewportSize({ width: 320, height: 740 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/profile?edit=1');
  await page.getByRole('button', { name: 'Request a correction' }).click();
  await expect(page.getByRole('dialog')).toContainText('Your profile is hidden');
  await expect(page.getByRole('dialog')).not.toContainText('Your current name stays visible');
  await page.keyboard.press('Escape');
  for (const [locale, name, bio, submit] of [
    ['en', 'First name', 'Bio', 'Submit for review'],
    ['fr', 'Prénom', 'Bio', 'Envoyer pour validation'],
    ['es', 'Nombre', 'Bio', 'Enviar para revisión'],
  ]) {
    await page.evaluate(locale => { localStorage.setItem('amourette-locale', locale); window.dispatchEvent(new Event('amourette-locale-change')); }, locale);
    const notice = page.getByTestId('text-correction-status');
    await expect(notice.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(notice.getByRole('heading', { name: bio, exact: true })).toBeVisible();
    const input = page.getByRole('textbox', { name: bio, exact: true });
    await input.focus(); await expect(input).toBeFocused(); await input.fill('A revised bio');
    await page.keyboard.press('Tab'); await expect(page.getByRole('button', { name: submit })).toBeFocused();
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 320);
    await page.screenshot({ path: test.info().outputPath(`text-corrections-${locale}-320.png`), fullPage: true });
  }
});

test('rejection redacts an already-open chat profile, keeps messages usable and displays the approved name notice once', async ({ context, page }) => {
  const state = await setup(context, 'bob');
  await page.goto(`/chat/${nameIds.match}`);
  await expect(page.getByTestId('chat-profile-name')).toHaveText('Alice');
  await page.getByRole('button', { name: /View.*Alice/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Hello from Alice.');
  state.reject('bio'); state.reject('first_name'); await refresh(page);
  await expect(page.getByTestId('chat-profile-name')).toHaveText('Participant');
  await expect(page.getByRole('dialog')).not.toContainText('Alice');
  await expect(page.getByRole('dialog')).not.toContainText('Hello from Alice.');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('chat-input')).toBeEnabled();
  state.profile.name = 'Alix'; state.profile.notices.set(nameIds.match, crypto.randomUUID()); await refresh(page);
  await expect(page.getByTestId('chat-profile-name')).toHaveText('Alix');
  await expect(page.getByTestId('chat-name-notice')).toBeVisible();
  await page.reload(); await expect(page.getByTestId('chat-profile-name')).toHaveText('Alix');
  await expect(page.getByTestId('chat-name-notice')).toHaveCount(0);
});

test('founder rejection uses the inspected revision and disables decisions after a conflict until explicit rereview', async ({ context, page }) => {
  const state = await setup(context, 'admin'); state.reject('bio');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/admin'); await page.getByRole('button', { name: /Moderation/ }).click();
  const queue = page.getByTestId('admin-text-corrections');
  await queue.getByRole('button', { name: /Required text corrections/ }).click();
  await queue.getByRole('button', { name: /Alice.*review/ }).click();
  const review = queue.getByTestId('admin-text-review');
  const revision = state.fields[0].revision;
  await review.getByRole('combobox').selectOption('harassment');
  const button = review.getByRole('button', { name: 'Require first name correction' });
  await button.click();
  expect(state.calls[0]).toMatchObject({ p_profile: nameIds.alice, p_field: 'first_name', p_revision: revision, p_reason: 'harassment' });
  await expect(review.getByRole('status')).toContainText('Could not confirm');
  await expect(button).toBeDisabled();
  state.fields[0].revision = crypto.randomUUID();
  await review.getByRole('button', { name: 'Reload review' }).click();
  await expect(button).toBeEnabled(); await button.click();
  expect(state.calls[1].p_revision).toBe(state.fields[0].revision);
  await page.screenshot({ path: test.info().outputPath('text-admin-conflict.png'), fullPage: true });
});

test('an open room removes a rejected bio then a rejected name from cards, match pills and the match reveal', async ({ context, page }) => {
  const state = await setup(context, 'bob');
  let matched = false;
  const presence = crypto.randomUUID();
  const night = { venue_id: nameIds.venue, venue_night_id: nameIds.night, status: 'live', participant_count: 3,
    launch_threshold: 4, guaranteed_launch_at: new Date().toISOString(), closes_at: new Date(Date.now() + 3600000).toISOString(), terminal_reason: null };
  await context.route('**/rest/v1/**', async route => {
    const request = route.request(), url = new URL(request.url()), name = url.pathname.split('/').at(-1);
    const rows = (value: unknown[]) => route.fulfill({ json: request.headers().accept?.includes('object+json') ? value[0] ?? null : value });
    if (name === 'venues') return rows([{ id: nameIds.venue, name: 'Test bar', city: 'Paris', timezone: 'Europe/Paris' }]);
    if (name === 'venue_night_state' || name === 'venue_night_public_state') return rows([night]);
    if (name === 'profile_private') return rows([{ adult_confirmed_at: new Date().toISOString() }]);
    if (name === 'presence') return rows([{ id: presence, profile_id: nameIds.bob, venue_night_id: nameIds.night, left_at: null, is_visible: true }]);
    if (name === 'profiles') return rows([{ id: url.searchParams.get('id') === `eq.${nameIds.alice}` ? nameIds.alice : nameIds.bob,
      first_name: url.searchParams.get('id') === `eq.${nameIds.alice}` ? state.profile.name : 'Bob', bio: state.profile.bio, photo_url: null }]);
    if (name === 'room_candidates') return rows(state.profile.name === null ? [] : [{ id: nameIds.alice,
      first_name: state.profile.name, bio: state.profile.bio, photo_url: null, checked_in_at: new Date(Date.now() - 600000).toISOString(),
      venue_night_id: nameIds.night, like_token: nameIds.match }]);
    if (name === 'matches') return rows(matched ? [{ id: nameIds.match, profile_a: nameIds.alice, profile_b: nameIds.bob,
      expires_at: night.closes_at, created_at: new Date().toISOString() }] : []);
    return route.fallback();
  });
  await page.goto('/v/test-bar');
  await page.locator('[aria-labelledby="room-hint-title"]').getByRole('button').click();
  await expect(page.getByRole('heading', { name: 'Alice', exact: true })).toBeVisible();
  await expect(page.getByText('Hello from Alice.', { exact: true })).toBeVisible();
  state.reject('bio'); await refresh(page);
  await expect(page.getByText('Hello from Alice.', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Alice', exact: true })).toBeVisible();
  matched = true; await refresh(page);
  await expect(page.locator(`a[href="/chat/${nameIds.match}"]`).first()).toBeAttached();
  state.reject('first_name'); await refresh(page);
  await expect(page.getByText('Alice', { exact: true })).toHaveCount(0);
  await expect(page.locator('[aria-label*="Alice"], [alt="Alice"]')).toHaveCount(0);
  await expect(page.locator(`a[href="/chat/${nameIds.match}"]`).first()).toHaveAttribute('aria-label', /Participant/);
  await page.screenshot({ path: test.info().outputPath('room-redacted-match.png') });
});

test('photo participant review exposes text actions only with a venue-night context', async ({ context, page }) => {
  const state = await setup(context, 'admin');
  await context.route('**/rest/v1/venue_nights?*', route => route.fulfill({ json: [{
    id: nameIds.night, waiting_opens_at: new Date().toISOString(), venues: { name: 'Test bar' },
  }] }));
  await context.route('**/rest/v1/rpc/admin_photo_framing', route => route.fulfill({ json: [{
    profile_id: nameIds.alice, first_name: 'Alice', displayed_id: crypto.randomUUID(), pending_id: null,
    correction_required: false, displayed_status: 'unverified', displayed_path: null, pending_path: null,
    revision: 0, submitted_at: new Date().toISOString(),
  }] }));
  await page.goto('/admin'); await page.getByRole('button', { name: /Moderation/ }).click();
  const photos = page.getByTestId('admin-photo-queue');
  await photos.getByRole('button', { name: /Photos/ }).click();
  await photos.getByRole('button', { name: /Alice/ }).click();
  await expect(page.getByRole('dialog')).not.toContainText('Require first name correction');
  await page.getByRole('button', { name: 'Close photo review' }).click();
  await photos.getByRole('combobox', { name: 'Night', exact: true }).selectOption(nameIds.night);
  await photos.getByRole('button', { name: /Alice/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Require first name correction' }).click();
  expect(state.calls[0]).toMatchObject({ p_profile: nameIds.alice, p_night: nameIds.night, p_field: 'first_name' });
  expect(state.calls[0]).not.toHaveProperty('p_report');
});

test('multiple owner corrections leave the chat composer reachable in a short mobile viewport', async ({ context, page }) => {
  const state = await setup(context); state.reject('first_name'); state.reject('bio');
  await context.route('**/rest/v1/rpc/chat_partner_state', route => route.fulfill({ json: {
    id: nameIds.bob, first_name: 'Bob', bio: null, photo_url: null, correction_id: null,
    seen_correction_id: null, expires_at: new Date(Date.now() + 3600000).toISOString(),
  } }));
  await page.setViewportSize({ width: 320, height: 400 });
  await page.goto(`/chat/${nameIds.match}`);
  await expect(page.getByTestId('text-correction-status')).toContainText('First name');
  await expect(page.getByTestId('text-correction-status')).toContainText('Bio');
  const notice = page.getByTestId('chat-text-correction');
  expect(await notice.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  const input = page.getByTestId('chat-input');
  await expect(input).toBeInViewport(); await input.fill('Still able to talk');
  await expect(input).toBeFocused(); await expect(input).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('chat-owner-corrections-short.png') });
});
