import sharp from 'sharp';
import { test, expect } from '../helpers/fixtures';

for (const boundary of ['storage', 'editor_storage', 'photo_state', 'photo_versions'] as const) {
  test(`initial photo recovers after a temporary ${boundary} failure`, async ({ data, contextFor, request }) => {
    const owner = await data.identity('PhotoRecovery');
    const buffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#805347' } }).jpeg().toBuffer();
    const response = await request.post('/api/profile-photo', {
      headers: { Authorization: `Bearer ${owner.session.access_token}` },
      multipart: {
        revision: '0',
        profile: JSON.stringify({ first_name: owner.name, gender: 'woman', interested_in: ['man'], adult_confirmed: true }),
        photo: { name: 'portrait.jpg', mimeType: 'image/jpeg', buffer },
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const page = await (await contextFor(owner)).newPage();
    await page.clock.install();
    const pattern = boundary.endsWith('storage')
      ? new RegExp(`/storage/v1/object/(?:authenticated/)?profile-photos/${owner.id}/`)
      : new RegExp(`/rest/v1/${boundary}\\?`);
    let failures = 0;
    await page.route(pattern, route => {
      failures++;
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Temporarily unavailable"}' });
    });
    await page.goto(boundary === 'storage' ? '/' : '/profile?edit=1');
    const image = page.locator(boundary === 'storage' ? '.night-photo-ring img' : 'label img');
    await expect.poll(() => failures).toBeGreaterThan(0);
    await expect(image).toHaveCount(0);
    await page.unroute(pattern);
    // No navigation, foreground event or moderation change may trigger recovery.
    await page.clock.fastForward(30000);
    await expect(image).toBeVisible();

    // Once recovered, the unchanged revision must not trigger more downloads.
    const previous = await image.getAttribute('src');
    let downloads = 0;
    page.on('request', outgoing => {
      if (outgoing.url().includes(`/profile-photos/${owner.id}/`)) downloads++;
    });
    const revision = page.waitForResponse(result => result.url().includes('/photo_invalidation?'));
    await page.clock.fastForward(30000);
    await revision;
    expect(downloads).toBe(0);
    await expect(image).toHaveAttribute('src', previous!);
  });
}
