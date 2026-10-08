import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { mockCorrections } from '../helpers/correction-ui';
import { correctionStrings } from '../../lib/correction-strings';
import { profileReviewStrings } from '../../lib/profile-review-strings';
import { photoStrings } from '../../lib/photo-strings';
import { REVIEW_FIELDS } from '../../lib/profile-review';
import { nameIds } from '../helpers/name-ui-fixture';

async function open(page: Page, locale: 'en' | 'fr' | 'es' = 'en') {
  await page.getByRole('dialog').getByRole('button', { name: correctionStrings[locale].modify, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('focused-corrections')).toHaveAttribute('aria-busy', 'false');
}
async function choosePhoto(page: Page, locale: 'en' | 'fr' | 'es' = 'en') {
  const image = await sharp({ create: { width: 600, height: 800, channels: 3, background: '#805347' } }).jpeg().toBuffer();
  await page.getByTestId('focused-corrections').locator('input[type=file]').setInputFiles({ name: 'correction.jpg', mimeType: 'image/jpeg', buffer: image });
  await page.getByRole('dialog').getByRole('button', { name: ({ en: 'Confirm crop', fr: 'Valider le cadrage', es: 'Confirmar encuadre' })[locale] }).click();
}

for (let mask = 1; mask < 8; mask++) {
  const fields = REVIEW_FIELDS.filter((_field, index) => mask & (1 << index));
  test(`compact correction submits only ${fields.join(', ')} together and resumes pending review`, async ({ context, page }) => {
    const fixture = await mockCorrections(context, fields);
    await page.goto('/profile?edit=1&correction=1');
    const flow = page.getByTestId('focused-corrections');
    const notice = page.getByRole('dialog');
    await expect(notice.getByRole('heading')).toHaveText(correctionStrings.en.rejected);
    for (const field of fields) await expect(notice).toContainText(field === 'photo' ? photoStrings.en.reasons.face_unclear : profileReviewStrings.en.reasons.misleading_identity);
    await open(page);
    await expect(flow.getByRole('textbox')).toHaveCount(fields.filter(field => field !== 'photo').length);
    await expect(flow.getByRole('combobox')).toHaveCount(0);
    await expect(flow).not.toContainText('Ready to send');
    if (fields.includes('first_name')) await flow.getByRole('textbox', { name: 'First name', exact: true }).fill('Alix');
    if (fields.includes('bio')) await flow.getByRole('textbox', { name: 'Bio', exact: true }).fill('A revised bio');
    if (fields.includes('photo')) await choosePhoto(page);
    expect(fixture.commands.submissions).toBe(0);
    await flow.getByRole('button', { name: correctionStrings.en.submit, exact: true }).click();
    await expect(flow).toContainText(correctionStrings.en.waiting);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(flow.getByRole('textbox')).toHaveCount(0);
    expect(fixture.commands.submissions).toBe(1);
    expect(fixture.state.updatedFields).toEqual(fields);
    expect(fixture.commands.saves).toHaveLength(fields.filter(field => field !== 'photo').length);
    expect(fixture.commands.uploads).toBe(fields.includes('photo') ? 1 : 0);
    await page.reload();
    await expect(flow).toContainText(correctionStrings.en.waiting);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await flow.getByRole('button', { name: 'Account settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Edit my profile', exact: true })).toBeVisible();
  });
}

test('failed save and failed final submission preserve drafts, receipts and saved-but-unsubmitted resume', async ({ context, page }) => {
  const fixture = await mockCorrections(context, ['first_name', 'bio']);
  await page.goto('/profile?edit=1&correction=1'); await open(page);
  const flow = page.getByTestId('focused-corrections');
  const submit = flow.getByRole('button', { name: 'Send for review', exact: true });
  await flow.getByRole('textbox', { name: 'First name', exact: true }).fill('Alix');
  await flow.getByRole('textbox', { name: 'Bio', exact: true }).fill('A revised bio');
  fixture.faults.save = true;
  await submit.click();
  await expect(flow.getByRole('alert')).toContainText('Your edits are still here');
  expect(fixture.commands.submissions).toBe(0);
  await expect(flow.getByRole('textbox', { name: 'First name', exact: true })).toHaveValue('Alix');
  await expect(flow.getByRole('textbox', { name: 'Bio', exact: true })).toHaveValue('A revised bio');
  fixture.faults.save = false; fixture.faults.loseSave = true; fixture.faults.submit = true;
  await submit.click();
  await expect(flow.getByRole('alert').first()).toBeVisible();
  expect(fixture.commands.saves[0].p_request_id).toBe(fixture.commands.saves[1].p_request_id);
  expect(fixture.state.status).toBe('awaiting_changes');
  await page.reload();
  await expect(flow.getByRole('textbox', { name: 'First name', exact: true })).toHaveValue('Alix');
  await expect(flow.getByRole('textbox', { name: 'Bio', exact: true })).toHaveValue('A revised bio');
  await expect(flow.getByText('Awaiting approval', { exact: true })).toHaveCount(0);
  fixture.faults.submit = false; fixture.faults.loseSubmit = true;
  await submit.dblclick();
  await expect(flow).toContainText('Awaiting approval');
  await expect(flow.getByRole('alert')).toHaveCount(0);
  expect(fixture.commands.submissions).toBe(2);
});

test('photo upload failure preserves the cropped photo and retry uses the existing upload pipeline', async ({ context, page }) => {
  const fixture = await mockCorrections(context, ['photo']);
  await page.goto('/profile?edit=1'); await open(page);
  const flow = page.getByTestId('focused-corrections');
  const submit = flow.getByRole('button', { name: 'Send for review', exact: true });
  await expect(submit).toBeDisabled();
  await choosePhoto(page); fixture.faults.upload = true;
  await submit.click();
  await expect(flow.getByRole('alert')).toBeVisible();
  await expect(flow.getByRole('img', { name: 'New photo', exact: true })).toBeVisible();
  expect(fixture.commands.submissions).toBe(0);
  fixture.faults.upload = false;
  await submit.click();
  await expect(flow).toContainText('Awaiting approval');
  expect(fixture.commands.uploads).toBe(2);
});

for (const locale of ['en', 'fr', 'es'] as const) {
  test(`reference popup, compact form and pending screenshots use selected ${locale} at 320px`, async ({ context, page }) => {
    await mockCorrections(context, ['first_name', 'bio', 'photo']);
    await context.addInitScript(locale => localStorage.setItem('amourette-locale', locale), locale);
    await page.setViewportSize({ width: 320, height: 740 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/profile?edit=1&correction=1');
    const s = correctionStrings[locale], flow = page.getByTestId('focused-corrections');
    await expect(page.getByRole('dialog')).toContainText(s.rejected);
    await page.screenshot({ path: test.info().outputPath(`popup-${locale}.png`), fullPage: true });
    await open(page, locale);
    await flow.getByRole('textbox', { name: s.labels.first_name, exact: true }).fill('Alix');
    await flow.getByRole('textbox', { name: s.labels.bio, exact: true }).fill('I love live music and meeting people over a drink.');
    await choosePhoto(page, locale);
    await expect(flow.getByRole('button', { name: s.submit, exact: true })).toBeEnabled();
    await expect(flow.getByRole('button', { name: s.submit, exact: true })).toHaveCSS('opacity', '1');
    await page.screenshot({ path: test.info().outputPath(`correction-${locale}.png`), fullPage: true });
    await flow.getByRole('button', { name: s.submit, exact: true }).click();
    await expect(flow).toContainText(s.waiting);
    await page.screenshot({ path: test.info().outputPath(`pending-${locale}.png`), fullPage: true });
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 320);
    await expect(flow.getByRole('combobox')).toHaveCount(0);
  });
}

test('Unicode bounds, empty bio and unavailable reads refuse effects without discarding values', async ({ context, page }) => {
  const fixture = await mockCorrections(context, ['bio']); fixture.faults.read = true;
  await page.goto('/profile?edit=1'); await open(page);
  const flow = page.getByTestId('focused-corrections');
  await expect(flow.getByRole('textbox')).toBeDisabled();
  fixture.faults.read = false; await flow.getByRole('button', { name: 'Try again' }).click();
  await expect(flow.getByRole('textbox')).toBeEnabled();
  await flow.getByRole('textbox').fill('😀'.repeat(301));
  const submit = flow.getByRole('button', { name: 'Send for review', exact: true });
  await expect(submit).toBeDisabled(); expect(fixture.commands.saves).toHaveLength(0);
  await flow.getByRole('textbox').fill('😀'.repeat(300));
  await expect(flow).toContainText('300 / 300'); await expect(submit).toBeEnabled();
  await flow.getByRole('textbox').fill(''); await submit.click();
  await expect(flow).toContainText('Awaiting approval');
  expect(fixture.commands.saves[0].p_proposed_text).toBe('');
});

for (const resumed of [false, true]) {
  test(`only a confirmed completed cycle returns to existing attendance ${resumed ? 'on reopening' : 'while open'}`, async ({ context, page }) => {
    const fixture = await mockCorrections(context, ['first_name', 'bio']);
    fixture.saved('first_name'); fixture.saved('bio'); fixture.state.status = 'needs_review'; fixture.state.notification = false;
    let approved = false, failed = false;
    await context.route('**/rest/v1/rpc/my_profile_review', route => route.fulfill(failed ? { status: 503, json: { message: 'Unavailable' } } : { json: approved ? null : fixture.state }));
    await context.route('**/rest/v1/presence?*', route => route.fulfill({ json: { venue_night_id: nameIds.night, venues: { slug: 'test-bar' } } }));
    await context.route('**/rest/v1/profile_private?*', route => route.fulfill({ json: { adult_confirmed_at: '2026-10-06T12:00:00Z' } }));
    await page.goto('/profile?edit=1&venue=test-bar');
    await expect(page.getByTestId('focused-corrections')).toContainText('Awaiting approval');
    await expect(page).toHaveURL(/correction=1/);
    // A published field or transport failure is not full approval.
    fixture.text.find(row => row.field === 'first_name')!.required = false;
    await page.evaluate(() => window.dispatchEvent(new Event('amourette-participant-refresh')));
    await expect(page).toHaveURL(/\/profile/);
    failed = true;
    await page.evaluate(() => window.dispatchEvent(new Event('amourette-participant-refresh')));
    await expect(page.getByTestId('focused-corrections').getByRole('alert')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Edit my profile', exact: true })).toHaveCount(0);
    failed = false; approved = true;
    if (resumed) await page.reload();
    else await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page).toHaveURL(`/v/test-bar?reviewNight=${nameIds.night}`);
    await expect(page.getByRole('heading', { name: 'Edit my profile', exact: true })).toHaveCount(0);
  });
}

test('another rejection replaces the pending state with one popup and only the newly rejected fields', async ({ context, page }) => {
  const fixture = await mockCorrections(context, ['bio']);
  await page.goto('/profile?edit=1&correction=1'); await open(page);
  await page.getByRole('textbox', { name: 'Bio', exact: true }).fill('A revised bio');
  await page.getByRole('button', { name: 'Send for review', exact: true }).click();
  await expect(page.getByTestId('focused-corrections')).toContainText('Awaiting approval');
  Object.assign(fixture.state, { requestId: crypto.randomUUID(), revision: crypto.randomUUID(), status: 'awaiting_changes', notification: true,
    fields: [{ field: 'photo', reason: 'multiple_people' }], updatedFields: [], canSubmit: false });
  await page.evaluate(() => window.dispatchEvent(new Event('amourette-participant-refresh')));
  await expect(page.getByRole('dialog')).toContainText(photoStrings.en.reasons.multiple_people);
  await open(page);
  await expect(page.getByTestId('focused-corrections').getByRole('textbox')).toHaveCount(0);
  await expect(page.getByTestId('focused-corrections').locator('input[type=file]')).toHaveCount(1);
});

test('failed or missing initial review RPC cannot display an editor or authorize a correction return', async ({ context, page }) => {
  await mockCorrections(context, ['first_name']);
  let missing = false;
  await context.route('**/rest/v1/rpc/my_profile_review', route => route.fulfill({ status: missing ? 404 : 503, json: { code: missing ? 'PGRST202' : '503', message: 'Unavailable' } }));
  await page.goto('/profile?edit=1&correction=1');
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  missing = true; await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/profile/);
});

for (const scenario of ['expired', 'new-night', 'paused', 'no-attendance', 'ended-attendance', 'malformed'] as const) {
  test(`automatic correction return respects ${scenario} without a new check-in`, async ({ context, page }) => {
    await mockCorrections(context, ['photo']);
    await context.route('**/rest/v1/rpc/my_profile_review', route => route.fulfill({ json: null }));
    const night = { venue_night_id: nameIds.night, status: 'live', participant_count: 3, launch_threshold: 2,
      guaranteed_launch_at: new Date().toISOString(), closes_at: new Date(Date.now() + 3600000).toISOString(), terminal_reason: null as string | null };
    if (scenario === 'expired' || scenario === 'new-night') Object.assign(night, { status: 'closed', terminal_reason: 'scheduled_end', closes_at: new Date(Date.now() - 1000).toISOString() });
    if (scenario === 'paused') night.status = 'closed';
    let checkIns = 0;
    await context.route('**/rest/v1/rpc/check_in', route => { checkIns++; return route.fulfill({ status: 403, json: { message: 'Forbidden' } }); });
    await context.route('**/rest/v1/venues?*', route => route.fulfill({ json: { id: nameIds.venue, name: 'Test bar', city: 'Paris', timezone: 'Europe/Paris' } }));
    await context.route('**/rest/v1/rpc/venue_night_state', route => route.fulfill({ json: scenario === 'expired' || scenario === 'paused' ? [] :
      [{ ...night, status: 'live', venue_night_id: scenario === 'new-night' ? crypto.randomUUID() : nameIds.night }] }));
    await context.route('**/rest/v1/venue_night_public_state?*', route => route.fulfill({ json: night }));
    await context.route('**/rest/v1/profile_private?*', route => route.fulfill({ json: { adult_confirmed_at: new Date().toISOString() } }));
    await context.route('**/rest/v1/presence?*', route => route.fulfill({ json: scenario === 'no-attendance' ? [] :
      [{ id: crypto.randomUUID(), left_at: new Date().toISOString(), is_visible: true }] }));
    await page.goto(`/v/test-bar?reviewNight=${scenario === 'malformed' ? 'invalid' : nameIds.night}`);
    const expected = scenario === 'paused' ? 'The night is paused' : scenario === 'expired' || scenario === 'new-night' ? 'The night has ended' :
      scenario === 'malformed' ? 'No night to join right now' : 'Back at the bar?';
    await expect(page.getByRole('heading', { name: expected, exact: true })).toBeVisible();
    expect(checkIns).toBe(0);
  });
}
