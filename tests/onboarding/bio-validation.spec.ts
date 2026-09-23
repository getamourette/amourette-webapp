import { test, expect } from '../helpers/fixtures';

test('creation preserves an excessive draft, returns from confirmation errors and saves the correction', async ({ data, contextFor }) => {
  const identity = await data.identity('Alice');
  const page = await (await contextFor(identity)).newPage();
  await page.goto('/profile');
  const next = page.getByRole('button', { name: 'Continue', exact: true });
  await page.getByPlaceholder('First name', { exact: true }).fill('Alice');
  await next.click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'bio-test.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aM1sAAAAASUVORK5CYII=', 'base64'),
  });
  await next.click();
  await page.getByRole('group', { name: 'I am', exact: true }).getByRole('button', { name: 'Woman', exact: true }).click();
  await next.click();
  await page.getByRole('group', { name: 'I’d like to meet', exact: true }).getByRole('button', { name: 'Man', exact: true }).click();
  await next.click();
  const bio = page.getByRole('textbox', { name: 'Bio (optional)' });
  await expect(page.locator('#profile-bio-counter')).toHaveText('0 / 300 characters');
  await bio.fill('a'.repeat(269));
  await expect(page.locator('#profile-bio-counter')).toHaveClass(/text-taupe/);
  await bio.fill('a'.repeat(270));
  await expect(page.locator('#profile-bio-counter')).toHaveClass(/text-champagne/);
  // A paste/input event must preserve the entire string (including emoji pairs).
  await bio.fill('😀'.repeat(301));
  await expect(bio).toHaveValue('😀'.repeat(301));
  await expect(next).toBeDisabled();
  await expect(page.locator('#profile-bio-error')).toHaveText('Remove 1 character to save your bio.');
  await page.evaluate((id) => {
    const key = `amourette-onboarding-draft:${id}`;
    const draft = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(key, JSON.stringify({ ...draft, step: 5 }));
  }, identity.id);
  await page.reload();
  await expect(bio).toHaveValue('😀'.repeat(301));
  await expect(next).toBeDisabled();
  await bio.fill(`\u00a0${'😀'.repeat(300)}\ufeff`);
  await expect(page.locator('#profile-bio-counter')).toHaveText('300 / 300 characters');
  await next.click();
  await page.getByRole('checkbox').check();
  await page.route('**/api/profile-photo', route => route.fulfill({ status: 400, json: { error: 'bio_too_long' } }));
  await page.getByRole('button', { name: 'Join tonight', exact: true }).click();
  await expect(bio).toBeFocused();
  await expect(page.locator('#profile-bio-error')).toHaveText('Your bio can be up to 300 characters long.');
  await bio.fill('😀'.repeat(300));
  await expect(page.locator('#profile-bio-error')).toHaveCount(0);
  await page.unroute('**/api/profile-photo');
  await next.click();
  await page.getByRole('button', { name: 'Join tonight', exact: true }).click();
  await expect(page).toHaveURL('/');
  const saved = await data.service.from('profiles').select('bio').eq('id', identity.id).single();
  expect(saved.error).toBeNull();
  expect(saved.data?.bio).toBe('😀'.repeat(300));
});

test('editor preserves legacy bio and identifies only bio constraint errors', async ({ data, contextFor }) => {
  const identity = await data.identity('Alice', 'woman');
  const page = await (await contextFor(identity)).newPage();
  await page.route('**/rest/v1/rpc/get_my_profile', async route => {
    const response = await route.fetch();
    const json = await response.json();
    await route.fulfill({ response, json: Array.isArray(json)
      ? json.map(row => ({ ...row, bio: 'x'.repeat(301) }))
      : { ...json, bio: 'x'.repeat(301) } });
  });
  await page.goto('/profile?edit=1');
  const bio = page.getByRole('textbox', { name: 'Bio (optional)' });
  const save = page.getByRole('button', { name: 'Save my bio', exact: true });
  await expect(bio).toHaveValue('x'.repeat(301));
  await expect(save).toBeDisabled();
  for (const [locale, counter, removal] of [
    ['fr', '301 / 300 caractères', 'Retire 1 caractère pour enregistrer ta bio.'],
    ['es', '301 / 300 caracteres', 'Elimina 1 carácter para guardar tu bio.'],
    ['en', '301 / 300 characters', 'Remove 1 character to save your bio.'],
  ]) {
    await page.evaluate((value) => {
      localStorage.setItem('amourette-locale', value);
      window.dispatchEvent(new Event('amourette-locale-change'));
    }, locale);
    await expect(page.locator('#profile-bio-counter')).toHaveText(counter);
    await expect(page.locator('#profile-bio-error')).toHaveText(removal);
  }
  await page.unroute('**/rest/v1/rpc/get_my_profile');
  await bio.fill('x'.repeat(300));
  await page.route('**/rest/v1/profiles?*', async route => {
    if (route.request().method() === 'PATCH') await route.fulfill({ status: 400,
      json: { code: '23514', message: 'violates check constraint "profiles_bio_check"' } });
    else await route.continue();
  });
  await save.click();
  await expect(bio).toBeFocused();
  await expect(page.locator('#profile-bio-error')).toBeVisible();
  await bio.fill('x'.repeat(299));
  await expect(page.locator('#profile-bio-error')).toHaveCount(0);
  await page.unroute('**/rest/v1/profiles?*');
  await page.route('**/rest/v1/profiles?*', async route => {
    if (route.request().method() === 'PATCH') await route.fulfill({ status: 400,
      json: { code: '23514', message: 'violates check constraint "profiles_first_name_check"' } });
    else await route.continue();
  });
  await save.click();
  await expect(save).toBeEnabled();
  await expect(page.locator('#profile-bio-error')).toHaveCount(0);
  await page.unroute('**/rest/v1/profiles?*');
  await save.click();
  await expect(page.getByText('Bio saved.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL('/profile?edit=1');
});
