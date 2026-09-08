// Standalone visual capture: never runs the shared-database chat test setup.
// Build/start with NEXT_PUBLIC_SUPABASE_URL=https://logo-preview.invalid and
// NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=preview-only-not-a-real-key first.
// For deployed inspection, set BRAND_PREVIEW_URL and load its public Supabase URL;
// browser backend calls still use mocks and never reach the shared database.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const phase = process.argv[2];
assert(['before', 'after', 'aligned', 'preview'].includes(phase), 'Pass before, after, aligned or preview');
const origin = process.env.BRAND_PREVIEW_URL || 'http://127.0.0.1:3100';
const backend = new URL(process.env.BRAND_PREVIEW_URL
  ? process.env.NEXT_PUBLIC_SUPABASE_URL : 'https://logo-preview.invalid');
const storageKey = `sb-${backend.hostname.split('.')[0]}-auth-token`;
const output = process.env.BRAND_CAPTURE_OUTPUT || 'docs/brand/explorations/logo-wordmark/integration-preview';
await mkdir(`${output}/captures`, { recursive: true });
const browser = await chromium.launch({ headless: true });
const userId = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const venueId = '00000000-0000-4000-8000-000000000010';
const nightId = '00000000-0000-4000-8000-000000000011';
const match = { id: '00000000-0000-4000-8000-000000000020', profile_a: userId, profile_b: otherId, expires_at: '2099-09-09T06:00:00Z' };
const self = { id: userId, first_name: 'Alexandra', photo_url: '/test-profiles/portrait-1.svg', bio: 'A quiet corner, good music, and a conversation that surprises me.', gender: 'woman', interested_in: ['man'] };
const other = { id: otherId, first_name: 'Jean-Baptiste-Alexandre', photo_url: '/test-profiles/portrait-2.svg', bio: 'Here for the music. Staying for the conversation.', gender: 'man', interested_in: ['woman'] };
const user = { id: userId, aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: '2026-09-08T20:00:00Z' };
const session = { access_token: `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: userId, exp: 4099766400, role: 'authenticated' })).toString('base64url')}.synthetic`, refresh_token: 'synthetic', expires_in: 3600, expires_at: 4099766400, token_type: 'bearer', user };
const cases = [
  ['home-new', '/', 'Scan'], ['home-returning', '/', 'Alexandra'],
  ['room', '/v/preview-bar', 'Jean-Baptiste-Alexandre'],
  ['room-menu', '/v/preview-bar', 'Jean-Baptiste-Alexandre'],
  ['room-hint', '/v/preview-bar', 'First entry'],
  ['email-prompt', '/v/preview-bar', 'Email invitation'],
  ['waiting', '/v/preview-bar', '21:30'],
  ['entry', '/v/preview-bar', 'Le Salon'],
  ['profile-edit', '/profile?edit=1', 'Edit'],
  ['age', '/profile', '18'], ['match', '/v/preview-bar', 'You both tapped'],
  ['email', '/email-preferences', 'Email'], ['admin', '/admin', 'Control center'],
  ['reset', '/admin/reset-password', 'password'],
  ['home-loading', '/', 'Amourette'], ['home-error', '/', 'Amourette'],
  ['room-loading', '/v/preview-bar', 'Amourette'], ['room-error', '/v/preview-bar', 'Amourette'],
  ['closed', '/v/preview-bar', 'Amourette'], ['ended', '/v/preview-bar', 'Amourette'],
  ['left', '/v/preview-bar', 'Amourette'], ['onboarding', '/profile', 'name'],
  ['unsubscribe', '/unsubscribe?lang=en', 'Email'],
];
const records = [];
try {
  for (const [width, height] of [[390, 844], [320, 740], [1280, 900]]) {
    for (const [name, path] of cases) {
      if (width === 1280 && !['home-new', 'home-returning', 'room', 'profile-edit', 'match', 'email'].includes(name)) continue;
      if (process.env.CAPTURE_CASES && !process.env.CAPTURE_CASES.split(',').includes(name)) continue;
      const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale: 'en-US', reducedMotion: 'reduce', serviceWorkers: 'block' });
      const unexpected = [];
      let liked = false;
      const night = { venue_night_id: nightId, status: name === 'waiting' ? 'waiting' : name === 'ended' ? 'closed' : 'live', participant_count: name === 'waiting' ? 3 : 12, launch_threshold: 8, guaranteed_launch_at: '2026-09-08T21:30:00Z', closes_at: '2099-09-09T06:00:00Z', terminal_reason: name === 'ended' ? 'scheduled_end' : null, updated_at: '2026-09-08T20:00:00Z' };
      await context.addInitScript(({ session, name, nightId, storageKey }) => {
        localStorage.setItem('amourette-locale', 'en');
        if (name !== 'room-hint') localStorage.setItem('amourette-room-hint-dismissed', '1');
        if (!['admin', 'reset'].includes(name)) localStorage.setItem(storageKey, JSON.stringify(session));
        if (name !== 'entry') sessionStorage.setItem('amourette-entered:preview-bar', '1');
        sessionStorage.setItem('amourette-venue-night:preview-bar', nightId);
      }, { session, name, nightId, storageKey });
      await context.routeWebSocket(/.*/, socket => socket.close());
      await context.route('**/*', async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin === origin && url.pathname.startsWith('/_vercel/')) return route.fulfill({ status: 204 });
        if (url.origin === origin && !url.pathname.startsWith('/api/')) return route.continue();
        if (url.origin !== backend.origin) {
          unexpected.push(`${request.method()} ${url.origin}${url.pathname}`);
          return route.abort();
        }
        const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
        if (name.endsWith('-loading')) return; // Hold the mocked prerequisite until context closes.
        if (name.endsWith('-error')) return reply({ message: 'Synthetic preview failure' }, 500);
        if (url.pathname.startsWith('/auth/')) return reply(url.pathname.endsWith('/user') ? user : session);
        const table = url.pathname.split('/').at(-1);
        const single = request.headers().accept?.includes('object+json');
        const rows = data => reply(single ? data[0] ?? null : data);
        if (table === 'venues') return reply({ id: venueId, name: 'Le Salon des Rencontres Extraordinaires', slug: 'preview-bar', city: 'Paris', timezone: 'Europe/Paris', profile_preview_enabled: false });
        if (table === 'record_venue_scan') return reply(null);
        if (table === 'am_i_admin') return reply(false);
        if (table === 'venue_night_state') return reply(['closed', 'ended'].includes(name) ? [] : [night]);
        if (table === 'venue_night_public_state') return reply(name === 'closed' ? null : night);
        if (table === 'profiles') {
          if (['home-new', 'onboarding'].includes(name)) return rows([]);
          const id = url.searchParams.get('id') ?? '';
          return rows([id.includes(otherId) ? other : self]);
        }
        if (table === 'profile_private') return reply({ adult_confirmed_at: name === 'age' ? null : '2026-09-08T20:00:00Z' });
        if (table === 'email_subscriptions') return reply(['email', 'waiting', 'email-prompt'].includes(name) ? null : { user_id: userId, email: 'alexandra@example.test', status: 'subscribed' });
        if (table === 'presence') {
          if (url.searchParams.get('select')?.includes('profiles!inner')) return rows([{ checked_in_at: '2026-09-08T20:00:00Z', profiles: other }]);
          return rows([{ id: 'preview-presence', left_at: name === 'left' ? '2026-09-08T21:00:00Z' : null, is_visible: true }]);
        }
        if (table === 'likes') {
          if (request.method() === 'POST') { liked = true; return reply(null, 201); }
          return rows([]);
        }
        if (table === 'matches') return rows(name === 'home-returning' || liked ? [match] : []);
        if (table === 'messages') return rows([]);
        unexpected.push(`${request.method()} ${url.pathname}`);
        return route.abort();
      });
      const page = await context.newPage();
      if (name === 'email-prompt') await page.clock.install();
      await page.goto(`${origin}${path}`);
      await page.evaluate(() => document.fonts.ready);
      if (name === 'entry') {
        await page.getByRole('heading', { name: 'Le Salon des Rencontres Extraordinaires' }).waitFor();
      } else {
        await page.waitForTimeout(1200);
      }
      if (['room', 'room-menu', 'match'].includes(name)) await page.getByTestId('profile-feed').waitFor();
      if (name === 'room-menu') await page.locator('[aria-controls="room-overflow-menu"]').click();
      if (name === 'room-hint') await page.locator('#room-hint-title').waitFor();
      if (name === 'email-prompt') {
        await page.getByTestId('profile-feed').waitFor();
        await page.clock.runFor(121_000);
        await page.locator('#email-prompt-title').waitFor();
      }
      if (name === 'match') {
        await page.locator('[data-testid="profile-feed"] .heart-button').first().click();
        await page.getByRole('heading', { name: 'You both tapped' }).waitFor();
      }
      await page.evaluate(() => Promise.all([...document.images].map(img => img.decode().catch(() => {}))));
      const geometry = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > innerWidth,
        logos: [...document.querySelectorAll('img[alt="Amourette"]')].filter(el => el.getBoundingClientRect().width).map(el => {
          const r = el.getBoundingClientRect();
          return { src: el.getAttribute('src'), x: r.x, y: r.y, width: r.width, height: r.height, animation: getComputedStyle(el.parentElement).animationName };
        }),
        text: document.querySelector('main')?.innerText.slice(0, 500),
      }));
      assert.equal(unexpected.length, 0, `Unexpected requests: ${unexpected}`);
      if (phase !== 'before') {
        assert.equal(geometry.overflow, false, `${name} overflows at ${width}`);
        if (name !== 'onboarding') assert(geometry.logos.length > 0, `${name}: logo missing`);
        for (const logo of geometry.logos) {
          assert(logo.width >= (logo.src.includes('vertical') ? 200 : 192) - 0.1, `${name}: logo below minimum`);
          assert(logo.x >= 0 && logo.x + logo.width <= width + 0.1, `${name}: logo outside viewport`);
        }
      }
      const file = `${name}-${width}-${phase}.png`;
      await page.screenshot({ path: `${output}/captures/${file}`, fullPage: true });
      if (phase !== 'before') {
        const language = page.getByRole('button', { name: 'Language', exact: true });
        if (['profile-edit', 'age', 'waiting'].includes(name)) {
          const control = await language.boundingBox();
          const logo = geometry.logos[0];
          assert(control && (control.y >= logo.y + logo.height || control.y + control.height <= logo.y || control.x >= logo.x + logo.width || control.x + control.width <= logo.x), `${name}: control overlaps logo canvas`);
          await language.click();
          await page.getByRole('menuitemradio', { name: 'English' }).waitFor();
          await page.keyboard.press('Escape');
          assert(await language.evaluate(el => el === document.activeElement), `${name}: language focus not restored`);
        }
        if (name === 'room') {
          const logo = page.getByRole('img', { name: 'Amourette', exact: true });
          assert.equal(await logo.evaluate(el => getComputedStyle(el).pointerEvents), 'none', 'Logo intercepts room gestures');
          const menu = page.locator('[aria-controls="room-overflow-menu"]');
          await menu.click();
          await page.locator('#room-overflow-menu').waitFor();
          await page.mouse.click(5, height / 2);
          assert.equal(await menu.getAttribute('aria-expanded'), 'false');
        }
        if (name === 'profile-edit') {
          const field = page.locator('input:not([type]), input[type="text"]').first();
          await field.focus();
          assert.equal(await field.inputValue(), self.first_name);
          await field.blur();
        }
        if (name === 'onboarding') assert.equal(geometry.logos.length, 0);
        if (phase === 'preview' && name === 'room-hint') {
          assert.equal(await page.getByRole('dialog').getByRole('img', { name: 'Amourette' }).count(), 0, 'Reminder duplicates room branding');
        }
        if (name === 'match') {
          const chat = await page.getByRole('link', { name: 'Start the chat' }).boundingBox();
          assert(chat && chat.y + chat.height <= height, 'Match CTA outside viewport');
        }
        for (const logo of await page.getByRole('img', { name: 'Amourette', exact: true }).all()) {
          assert.equal(await logo.evaluate(el => Boolean(el.closest('a,button'))), false, 'Logo became interactive');
        }
        if (['aligned', 'preview'].includes(phase)) {
          const target = ['room', 'room-menu', 'waiting'].includes(name)
            ? page.locator('p').filter({ hasText: 'Le Salon des Rencontres Extraordinaires' }).first()
            : ['profile-edit', 'age', 'email', 'admin', 'reset'].includes(name)
              ? page.getByRole('heading', { level: 1 }).first() : null;
          if (target) {
            const targetBox = await target.boundingBox();
            const logo = geometry.logos[0];
            const artworkStart = logo.x + logo.width * 100 / 1279.39203125;
            assert(targetBox && Math.abs(artworkStart - targetBox.x) < 0.1, `${name}: A is not aligned with adjacent copy`);
          }
          if (name === 'email-prompt' || (phase === 'aligned' && name === 'room-hint')) {
            const dialog = page.getByRole('dialog');
            const mark = await dialog.getByRole('img', { name: 'Amourette' }).boundingBox();
            const title = await dialog.getByRole('heading').boundingBox();
            assert(mark && title && Math.abs(mark.x + mark.width * 100 / 1279.39203125 - title.x) < 0.1, `${name}: modal artwork alignment`);
          }
        }
      }
      records.push({ name, path, width, height, file, ...geometry });
      console.log(`${phase}: ${name} ${width} ${geometry.overflow ? 'OVERFLOW' : 'ok'}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  const previous = process.env.CAPTURE_CASES
    ? JSON.parse(await readFile(`${output}/${phase}.json`, 'utf8').catch(() => '[]'))
      .filter(row => !records.some(next => next.name === row.name && next.width === row.width))
    : [];
  await writeFile(`${output}/${phase}.json`, JSON.stringify([...previous, ...records], null, 2) + '\n');
}
