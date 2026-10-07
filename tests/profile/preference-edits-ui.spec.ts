import { test, expect, type BrowserContext } from '@playwright/test';
import sharp from 'sharp';
import { mockNameUi, nameUiState } from '../helpers/name-ui-fixture';
import { cooldownActive, parseProfileEditState, parsePreferenceResult, restrictedPreferenceChange, samePreferences,
  type ProfileEditState, type PreferenceValues } from '../../lib/profile-edit';
import { PHOTO_REFRESH_EVENT } from '../../lib/photo-refresh';

async function mockPreferences(context: BrowserContext) {
  const identity = nameUiState();
  await mockNameUi(context, identity);
  const mock = {
    identity, server: { gender: 'woman', interested_in: ['woman','man'], version: null,
      available_at: null, server_now: new Date().toISOString() } as ProfileEditState,
    writes: [] as Record<string, unknown>[], failReads: false, failWrites: false, loseResponse: false, reads: 0,
  };
  await context.route('**/rest/v1/rpc/*my_profile*', async route => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    if (name !== 'get_my_profile_edit_state' && name !== 'update_my_profile_preferences') return route.fallback();
    const reply = (value: unknown, status = 200) => route.fulfill({ status, json: value });
    if (name === 'get_my_profile_edit_state') {
      mock.reads++;
      return mock.failReads ? reply({ message: 'Synthetic offline' }, 503) : reply(mock.server);
    }
    const body = route.request().postDataJSON();
    mock.writes.push(body);
    if (mock.failWrites) return reply({ message: 'Synthetic offline' }, 503);
    const target: PreferenceValues = { gender: body.p_gender, interested_in: body.p_interested_in };
    let status = 'unchanged';
    if (!samePreferences(mock.server, target)) {
      if (body.p_expected_version !== mock.server.version) status = 'stale';
      else if (cooldownActive(mock.server) && restrictedPreferenceChange(mock.server, target)) status = 'cooldown';
      else {
        const deadline = restrictedPreferenceChange(mock.server, target)
          ? new Date(Date.parse(mock.server.server_now) + 43200000).toISOString() : mock.server.available_at;
        mock.server = { ...mock.server, ...target, version: crypto.randomUUID(), available_at: deadline };
        status = 'saved';
      }
    }
    return mock.loseResponse ? reply({ message: 'Synthetic lost response' }, 503) : reply({ ...mock.server, status });
  });
  return mock;
}

test('runtime contracts reject malformed state and compare preference sets and exact deadlines', () => {
  const valid: ProfileEditState = { gender: 'woman', interested_in: ['man','woman'], version: null, available_at: null, server_now: '2026-09-22T12:00:00Z' };
  for (const patch of [{gender:'Woman'}, {interested_in:[]}, {interested_in:['man','man']}, {interested_in:[['man']]},
    {version:'forged'}, {available_at:'infinity'}, {server_now:123}, {version:undefined}]) {
    expect(() => parseProfileEditState({...valid,...patch})).toThrow();
  }
  expect(() => parsePreferenceResult({...valid,status:'ok'})).toThrow();
  expect(samePreferences(valid,{gender:'woman',interested_in:['woman','man']})).toBe(true);
  expect(restrictedPreferenceChange(valid,{gender:'woman',interested_in:['man']})).toBe(false);
  expect(restrictedPreferenceChange(valid,{gender:'man',interested_in:['man']})).toBe(true);
  expect(cooldownActive({...valid,available_at:valid.server_now})).toBe(false);
  expect(cooldownActive({...valid,available_at:'2026-09-22T12:00:00.001Z'})).toBe(true);
});

test('a background check during a save gesture preserves review but refuses writes until both reads verify', async ({ context, page }) => {
  const mock = await mockPreferences(context);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/profile?edit=1');
  const group = page.getByRole('region', { name: 'Gender and preferences' });
  const man = group.getByRole('group', { name: 'I am', exact: true }).getByRole('button', { name: 'Man', exact: true });
  await man.click();
  const save = group.getByRole('button', { name: 'Save my preferences', exact: true });
  await expect(save).toBeEnabled();
  await save.scrollIntoViewIfNeeded();
  await page.waitForLoadState('networkidle');
  let releaseConsent!: () => void;
  let releasePreferences!: () => void;
  const consentHeld = new Promise<void>(resolve => { releaseConsent = resolve; });
  const preferencesHeld = new Promise<void>(resolve => { releasePreferences = resolve; });
  let consentReads = 0;
  let preferenceReads = 0;
  await page.route('**/rest/v1/rpc/get_my_matching_consent', async route => {
    consentReads++;
    await consentHeld;
    await route.fallback();
  });
  await page.route('**/rest/v1/rpc/get_my_profile_edit_state', async route => {
    preferenceReads++;
    await preferencesHeld;
    await route.fallback();
  });
  try {
    const bounds = await save.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    await page.mouse.down();
    await page.evaluate(event => window.dispatchEvent(new Event(event)), PHOTO_REFRESH_EVENT);
    await expect.poll(() => consentReads).toBeGreaterThan(0);
    await page.mouse.up();
    const dialog = page.getByRole('alertdialog', { name: 'Save these preferences?' });
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByRole('button', { name: 'Save my preferences', exact: true });
    await expect(confirm).toBeDisabled();
    await expect(dialog.getByText('Checking your preferences…', { exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('preference-review-checking-320.png') });
    expect(mock.writes).toHaveLength(0);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => preferenceReads).toBeGreaterThan(0);
    releasePreferences();
    await expect(group.getByText('Checking your preferences…', { exact: true })).toHaveCount(0);
    await expect(confirm).toBeDisabled();
    expect(mock.writes).toHaveLength(0);
    releaseConsent();
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(group.getByText('Preferences saved.', { exact: true })).toBeVisible();
    expect(mock.writes).toHaveLength(1);
    expect(mock.writes[0]).toEqual({ p_gender: 'man', p_interested_in: ['woman', 'man'], p_expected_version: null });
    await expect(man).toHaveAttribute('aria-pressed', 'true');
    await expect(group.getByRole('group', { name: 'I am', exact: true }).getByRole('button', { name: 'Woman', exact: true })).toBeDisabled();
    await expect(save).toBeDisabled();
  } finally {
    releaseConsent();
    releasePreferences();
    await page.mouse.up();
    await page.unrouteAll({ behavior: 'wait' });
  }
});

test('a failed consent recheck preserves preference review without enabling a write', async ({ context, page }) => {
  const mock = await mockPreferences(context);
  await page.goto('/profile?edit=1');
  const group = page.getByRole('region', { name: 'Gender and preferences' });
  const man = group.getByRole('group', { name: 'I am', exact: true }).getByRole('button', { name: 'Man', exact: true });
  await man.click();
  await page.waitForLoadState('networkidle');
  let failing = true;
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let reads = 0;
  await page.route('**/rest/v1/rpc/get_my_matching_consent', async route => {
    reads++;
    await held;
    return failing ? route.fulfill({ status: 503, json: { message: 'Synthetic offline' } }) : route.fallback();
  });
  const save = group.getByRole('button', { name: 'Save my preferences', exact: true });
  const dialog = page.getByRole('alertdialog', { name: 'Save these preferences?' });
  try {
    await page.evaluate(event => window.dispatchEvent(new Event(event)), PHOTO_REFRESH_EVENT);
    await expect.poll(() => reads).toBeGreaterThan(0);
    await save.click();
    await expect(dialog.getByRole('button', { name: 'Save my preferences', exact: true })).toBeDisabled();
    release();
    await expect(dialog.getByRole('alert')).toContainText('Could not verify your preferences. Your draft is still here.');
    await expect(dialog.getByText('Checking your preferences…', { exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Save my preferences', exact: true })).toBeDisabled();
    expect(mock.writes).toHaveLength(0);
    await page.screenshot({ path: test.info().outputPath('preference-review-verification-error.png') });
    await dialog.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await expect(save).toBeDisabled();
  } finally { release(); }
  failing = false;
  await page.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(man).toBeEnabled();
  await expect(man).toHaveAttribute('aria-pressed', 'true');
  await save.click();
  await dialog.getByRole('button', { name: 'Save my preferences', exact: true }).click();
  await expect(group.getByText('Preferences saved.', { exact: true })).toBeVisible();
  expect(mock.writes).toHaveLength(1);
});

test('separate saves preserve drafts, confirmation cancels with focus, and reductions remain editable', async ({ context, page }) => {
  const mock = await mockPreferences(context);
  await page.setViewportSize({width:320,height:740});
  await page.goto('/profile?edit=1');
  const group = page.getByRole('region',{name:'Gender and preferences'});
  const interests = group.getByRole('group',{name:'I’d like to meet'});
  const save = group.getByRole('button',{name:'Save my preferences',exact:true});
  const bio = page.getByPlaceholder('Bio (optional)');
  await interests.getByRole('button',{name:'Non-binary',exact:true}).click();
  await bio.fill('Independent bio');
  await page.locator('input[type=file]').setInputFiles({name:'draft.png',mimeType:'image/png',buffer:await sharp('public/test-profiles/portrait-1.svg').png().toBuffer()});
  const cropDialog = page.getByRole('dialog',{name:'Crop your photo'});
  await cropDialog.getByRole('button',{name:'Confirm crop',exact:true}).click();
  await expect(cropDialog).toHaveCount(0);
  const photoPreviews = page.locator('img[src^="blob:"]');
  await expect(photoPreviews).toHaveCount(2);
  const acceptedPreviews = await photoPreviews.evaluateAll(images => images.map(image => image.getAttribute('src')));
  await page.getByRole('button',{name:'Save my bio',exact:true}).click();
  await expect(page.getByText('Bio saved.',{exact:true})).toBeVisible();
  expect(mock.identity.patches).toEqual([{bio:'Independent bio'}]);
  expect(mock.writes).toEqual([]);
  await expect(interests.getByRole('button',{name:'Non-binary',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(photoPreviews.nth(0)).toBeVisible();
  await expect(photoPreviews.nth(1)).toBeVisible();
  expect(await photoPreviews.evaluateAll(images => images.map(image => image.getAttribute('src')))).toEqual(acceptedPreviews);
  await bio.fill('Another unsaved bio');
  await save.click();
  const dialog = page.getByRole('alertdialog',{name:'Save these preferences?'});
  await expect(dialog).toContainText('12 hours');
  await expect(dialog).toContainText('You can still remove preferences.');
  await page.screenshot({path:test.info().outputPath('preference-confirmation-320.png')});
  await expect(dialog.getByRole('button',{name:'Keep editing'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(save).toBeFocused(); expect(mock.writes).toHaveLength(0);
  await save.click(); await dialog.getByRole('button',{name:'Save my preferences',exact:true}).click();
  await expect(group.getByText('Preferences saved.',{exact:true})).toBeVisible();
  await expect(bio).toHaveValue('Another unsaved bio');
  expect(await photoPreviews.evaluateAll(images => images.map(image => image.getAttribute('src')))).toEqual(acceptedPreviews);
  expect(mock.writes).toHaveLength(1);
  expect(Object.keys(mock.writes[0]).sort()).toEqual(['p_expected_version','p_gender','p_interested_in']);
  await expect(group.getByRole('group',{name:'I am',exact:true}).getByRole('button',{name:'Man',exact:true})).toBeDisabled();
  const man = interests.getByRole('button',{name:'Man',exact:true});
  await man.click(); await expect(man).toBeEnabled(); await man.click();
  await expect(save).toBeDisabled();
  await man.click(); await save.click();
  await expect(group.getByText('Preferences saved.',{exact:true})).toBeVisible();
  await expect(man).toBeDisabled(); expect(mock.writes).toHaveLength(2);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await interests.getByRole('button',{name:'Non-binary',exact:true}).click();
  await expect(interests.getByRole('button',{name:'Woman',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Back',exact:true}).first().click();
  await expect(page.getByRole('alertdialog',{name:'Discard changes?'})).toBeVisible();
  await page.getByRole('button',{name:'Keep editing',exact:true}).click();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth',320);
  await page.screenshot({path:test.info().outputPath('preferences-cooldown-320.png'),fullPage:true});
});

test('two tabs preserve drafts on conflict and explicitly adopt saved preferences', async ({ context, page }) => {
  await mockPreferences(context);
  const second = await context.newPage();
  await page.goto('/profile?edit=1'); await second.goto('/profile?edit=1');
  const interests = (p: typeof page) => p.getByRole('group',{name:'I’d like to meet'});
  await interests(second).getByRole('button',{name:'Man',exact:true}).click();
  await second.getByPlaceholder('Bio (optional)').fill('Keep this bio');
  await interests(page).getByRole('button',{name:'Non-binary',exact:true}).click();
  await page.getByRole('button',{name:'Save my preferences',exact:true}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'Save my preferences',exact:true}).click();
  await expect(page.getByText('Preferences saved.',{exact:true})).toBeVisible();
  // Submission from the stale tab is refused and returns authoritative state.
  await second.getByRole('button',{name:'Save my preferences',exact:true}).click();
  await expect(second.getByText(/changed in another session/)).toBeVisible();
  await expect(interests(second).getByRole('button',{name:'Man',exact:true})).toHaveAttribute('aria-pressed','false');
  await second.screenshot({path:test.info().outputPath('preferences-conflict.png'),fullPage:true});
  await second.getByRole('button',{name:'Load saved preferences'}).click();
  await expect(interests(second).getByRole('button',{name:'Man',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(second.getByPlaceholder('Bio (optional)')).toHaveValue('Keep this bio');
  await interests(page).getByRole('button',{name:'Man',exact:true}).click();
  await page.getByRole('button',{name:'Save my preferences',exact:true}).click();
  await expect(page.getByText('Preferences saved.',{exact:true})).toBeVisible();
  await second.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(second.getByText(/changed in another session/)).toBeVisible();
});

test('lost response and failed verification block retry until a successful reread', async ({ context,page }) => {
  const mock = await mockPreferences(context);
  await page.goto('/profile?edit=1');
  const interests = page.getByRole('group',{name:'I’d like to meet'});
  const save = page.getByRole('button',{name:'Save my preferences',exact:true});
  await interests.getByRole('button',{name:'Non-binary',exact:true}).click();
  mock.loseResponse = true; mock.failReads = true;
  await save.click(); await page.getByRole('alertdialog').getByRole('button',{name:'Save my preferences',exact:true}).click();
  await expect(page.getByText(/Could not verify your preferences/)).toBeVisible();
  await expect(save).toBeDisabled(); expect(mock.writes).toHaveLength(1);
  await page.screenshot({path:test.info().outputPath('preferences-network-recovery.png'),fullPage:true});
  mock.failReads = false;
  await page.getByRole('button',{name:'Check again'}).click();
  await expect(page.getByText('Preferences saved.',{exact:true})).toBeVisible();
  expect(mock.writes).toHaveLength(1);
  await expect(save).toBeDisabled();
  // A request that never reached SQL also preserves its draft and can recover.
  mock.loseResponse = false; mock.failWrites = true; mock.failReads = true;
  await interests.getByRole('button',{name:'Man',exact:true}).click(); await save.click();
  await expect(page.getByRole('button',{name:'Check again'})).toBeVisible();
  mock.failReads = false; mock.failWrites = false;
  await page.getByRole('button',{name:'Check again'}).click();
  await expect(save).toBeEnabled(); await save.click();
  await expect(page.getByText('Preferences saved.',{exact:true})).toBeVisible();
});

test('server expiry unlocks fields and localized narrow/mobile/desktop layouts keep explicit labels', async ({context,page}) => {
  const mock = await mockPreferences(context);
  await page.clock.install();
  mock.server.available_at = new Date(Date.parse(mock.server.server_now)+1000).toISOString();
  mock.server.version = crypto.randomUUID();
  await page.goto('/profile?edit=1');
  const man = page.getByRole('group',{name:'I am',exact:true}).getByRole('button',{name:'Man',exact:true});
  await expect(man).toBeDisabled();
  mock.server.server_now = mock.server.available_at;
  await page.clock.fastForward(1100); await expect(man).toBeEnabled();
  await man.click();
  for (const [locale,bioLabel,preferenceLabel] of [
    ['en','Save my bio','Save my preferences'],['fr','Enregistrer ma bio','Enregistrer mes préférences'],['es','Guardar mi bio','Guardar mis preferencias'],
  ]) for (const width of [320,390,1280]) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(locale => { localStorage.setItem('amourette-locale',locale); window.dispatchEvent(new Event('amourette-locale-change')); },locale);
    await expect(page.getByRole('button',{name:bioLabel,exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:preferenceLabel,exact:true})).toBeVisible();
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth',width);
    expect(await page.locator('[aria-labelledby="profile-preferences-heading"] [role="group"] button').evaluateAll(buttons => buttons.every(button => {
      const bounds = button.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(button);
      return [...range.getClientRects()].every(rect => rect.left >= bounds.left && rect.right <= bounds.right);
    }))).toBe(true);
    await page.screenshot({path:test.info().outputPath(`preferences-${locale}-${width}.png`),fullPage:true});
    await page.getByRole('button',{name:preferenceLabel,exact:true}).click();
    await expect(page.getByRole('alertdialog')).toContainText('12');
    await page.screenshot({path:test.info().outputPath(`preference-confirmation-${locale}-${width}.png`)});
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button',{name:preferenceLabel,exact:true})).toBeFocused();
  }
});

test('initial read failures leave bio usable and name drafts still protect navigation after a bio save', async ({context,page}) => {
  const mock = await mockPreferences(context); mock.failReads = true;
  await page.goto('/profile?edit=1');
  await expect(page.getByRole('button',{name:'Check again'})).toBeVisible();
  await page.screenshot({path:test.info().outputPath('preferences-read-error.png'),fullPage:true});
  await expect(page.getByRole('button',{name:'Save my preferences',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Request a correction'}).click();
  await page.getByRole('textbox',{name:'Requested first name'}).fill('Alix');
  await page.keyboard.press('Escape');
  await page.getByPlaceholder('Bio (optional)').fill('A saved bio');
  await page.getByRole('button',{name:'Save my bio',exact:true}).click();
  await expect(page.getByText('Bio saved.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Back',exact:true}).first().click();
  await expect(page.getByRole('alertdialog',{name:'Discard changes?'})).toBeVisible();
  await page.getByRole('button',{name:'Keep editing'}).click();
  mock.failReads = false;
  await page.getByRole('button',{name:'Check again'}).click();
  await expect(page.getByRole('group',{name:'I am',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Request a correction'}).click();
  await expect(page.getByRole('textbox',{name:'Requested first name'})).toHaveValue('Alix');
});
