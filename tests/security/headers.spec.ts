import { test, expect, type APIResponse } from '@playwright/test';

// SEC-014 (#377): every response carries the baseline headers. No shared data is
// read or written; the venue slug does not need to exist.
const bypass = process.env.E2E_BASE_URL && process.env.E2E_VERCEL_BYPASS
  ? { 'x-vercel-protection-bypass': process.env.E2E_VERCEL_BYPASS } : undefined;

function expectBaseline(response: APIResponse, referrer = 'strict-origin-when-cross-origin') {
  const headers = response.headers();
  expect(headers['strict-transport-security']).toMatch(/^max-age=63072000\b/);
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe(referrer);
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['content-security-policy']).toBe("frame-ancestors 'none'");
  expect(headers['permissions-policy']).toContain('camera=(self)');
  expect(headers['permissions-policy']).toContain('geolocation=()');
  expect(headers['x-powered-by']).toBeUndefined();
  const policy = headers['content-security-policy-report-only'];
  expect(policy).toContain("default-src 'self'");
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).toContain("object-src 'none'");
  // The server may be built for another Supabase project than this process (a
  // Vercel preview), so check the shape; the logic test pins the exact value.
  const connect = /(?:^|; )connect-src ([^;]+)/.exec(policy)?.[1].split(' ') ?? [];
  // CI runs a local http:// stack; deployments use https://.
  const backend = connect.find(source => /^https?:\/\//.test(source));
  expect(backend).toBeDefined();
  expect(connect).toContain(backend!.replace(/^http/, 'ws'));
  expect(policy.split('; ').find(part => part.startsWith('img-src '))?.split(' ')).toContain(backend);
}

const pages = [
  ['public landing', '/'],
  ['legal page', '/legal'],
  ['founder admin', '/admin'],
  ['venue room', '/v/security-headers-probe'],
  ['profile', '/profile'],
  ['unknown page', '/security-headers-probe'],
  ['static asset', '/brand/amourette-wordmark-ruby.svg'],
] as const;

for (const [name, path] of pages) {
  test(`${name} carries the baseline security headers`, async ({ request }) => {
    expectBaseline(await request.get(path, { headers: bypass, maxRedirects: 0 }));
  });
}

test('token-bearing pages never send a referrer', async ({ request }) => {
  for (const path of ['/unsubscribe?token=probe', '/reservations/access']) {
    expectBaseline(await request.get(path, { headers: bypass, maxRedirects: 0 }), 'no-referrer');
  }
});

test('booking pages keep their stricter referrer and cache policy', async ({ request }) => {
  for (const path of ['/events/00000000-0000-4000-8000-000000000000', '/reservations/00000000-0000-4000-8000-000000000000']) {
    const response = await request.get(path, { headers: bypass, maxRedirects: 0 });
    expectBaseline(response, 'no-referrer');
    expect(response.headers()['cache-control']).toBe('private, no-store');
    expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow');
  }
});

test('responses built by the proxy and by route handlers are covered', async ({ request }) => {
  // proxy.ts answers this malformed admin URL itself.
  const proxied = await request.get('/admin/venues/not-a-venue-id', { headers: bypass, maxRedirects: 0 });
  expect(proxied.status()).toBe(404);
  expectBaseline(proxied);
  const id = '00000000-0000-4000-8000-000000000000';
  const redirected = await request.get(`/admin/venues/${id}/nights/${id}`, { headers: bypass, maxRedirects: 0 });
  expect(redirected.status()).toBe(308);
  expectBaseline(redirected);
  // Configured headers replace a handler's own, so the API keeps no-referrer
  // globally. The empty token is refused before any database call.
  const api = await request.post('/api/unsubscribe', { headers: bypass, data: { token: '' } });
  expect(await api.json()).toEqual({ status: 'invalid_token' });
  expectBaseline(api, 'no-referrer');
});

test('the landing page loads without violating the observed policy', async ({ page }) => {
  if (bypass) await page.setExtraHTTPHeaders(bypass);
  const violations: string[] = [];
  page.on('console', message => { if (/Content Security Policy|\[Report Only\]/i.test(message.text())) violations.push(message.text()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle');
  // Vercel's preview toolbar is injected outside the application bundle.
  expect(violations.filter(text => !text.includes('vercel.live'))).toEqual([]);
});
