import { test, expect, type APIRequestContext } from '@playwright/test';

// #277: what a crawler or a link-preview bot receives. This server is never the
// production deployment (CI build, local build or Vercel preview), so every path,
// the landing page included, must answer noindex. The production classification
// (landing indexable, every other path noindex) is pinned by
// scripts/test-search-indexing.mts. No shared data is read or written; the ids
// and the venue slug do not need to exist.
const bypass = process.env.E2E_BASE_URL && process.env.E2E_VERCEL_BYPASS
  ? { 'x-vercel-protection-bypass': process.env.E2E_VERCEL_BYPASS } : undefined;
const id = '00000000-0000-4000-8000-000000000000';
const title = 'Amourette';
const description = "Des soirées dans des bars, à Paris. Tu likes quelqu'un sur place. Si ce n'est pas réciproque, personne ne le saura.";

type Head = { status: number; robots: string | undefined; html: string };
async function fetchHead(request: APIRequestContext, path: string): Promise<Head> {
  const response = await request.get(path, { headers: bypass, maxRedirects: 0 });
  const html = await response.text();
  return { status: response.status(), robots: response.headers()['x-robots-tag'], html: html.slice(0, html.indexOf('</head>')) };
}

const decode = (value: string) => value.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');
function meta(html: string, key: string): string | undefined {
  const tag = html.match(new RegExp(`<meta[^>]*(?:property|name)="${key.replace(/[.:]/g, '\\$&')}"[^>]*>`))?.[0];
  const content = tag?.match(/content="([^"]*)"/)?.[1];
  return content === undefined ? undefined : decode(content);
}
const canonical = (html: string) => html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"/)?.[1];

// The same preview on every page, image included (a deeper segment that sets
// openGraph would drop the root image), and never the page's own URL.
function expectGenericPreview(html: string) {
  expect(meta(html, 'og:url')).toBeUndefined();
  expect(meta(html, 'og:site_name')).toBe('Amourette');
  expect(meta(html, 'og:type')).toBe('website');
  expect(meta(html, 'og:title')).toBe(title);
  expect(meta(html, 'og:description')).toBe(description);
  expect(meta(html, 'og:locale')).toBe('fr_FR');
  expect(meta(html, 'og:locale:alternate')).toBeUndefined();
  expect(meta(html, 'og:image')).toMatch(/^https:\/\/getamourette\.com\/opengraph-image(?:\?|$)/);
  expect(meta(html, 'og:image:width')).toBe('1200');
  expect(meta(html, 'og:image:height')).toBe('630');
  expect(meta(html, 'og:image:alt')).toBe('Amourette logo, cream on a dark velvet background');
  expect(meta(html, 'twitter:card')).toBe('summary_large_image');
  expect(meta(html, 'twitter:title')).toBe(title);
  expect(meta(html, 'twitter:description')).toBe(description);
}

test('the landing page carries its title, description, canonical URL and link preview', async ({ request }) => {
  const head = await fetchHead(request, '/');
  expect(head.status).toBe(200);
  expect(head.html).toContain(`<title>${title}</title>`);
  expect(meta(head.html, 'description')).toBe(description);
  expect(canonical(head.html)).toBe('https://getamourette.com');
  expectGenericPreview(head.html);
  // Not the production deployment: the landing page does not advertise itself.
  expect(head.robots).toBe('noindex, nofollow');
});

// Private and transactional pages: generic preview only, no canonical, and
// noindex in the response header.
for (const path of ['/v/search-indexing-probe', `/chat/${id}`, '/profile', '/admin', `/events/${id}`, `/reservations/${id}`, '/email-preferences', '/unsubscribe', '/legal']) {
  test(`${path} is noindex and shares only the generic preview`, async ({ request }) => {
    const head = await fetchHead(request, path);
    expect(head.status).toBeLessThan(500);
    expect(head.robots).toBe('noindex, nofollow');
    expectGenericPreview(head.html);
    expect(canonical(head.html)).toBeUndefined();
  });
}

test('robots.txt refuses crawling and advertises no sitemap outside production', async ({ request }) => {
  const response = await request.get('/robots.txt', { headers: bypass });
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toMatch(/User-Agent: \*\s+Disallow: \//);
  expect(body).not.toContain('Sitemap:');
  expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow');
  const sitemap = await request.get('/sitemap.xml', { headers: bypass });
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).not.toContain('<url>');
});

test('the link-preview image is a 1200 x 630 PNG', async ({ request }) => {
  const image = new URL(meta((await fetchHead(request, '/')).html, 'og:image')!);
  const response = await request.get(`${image.pathname}${image.search}`, { headers: bypass });
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('image/png');
  const png = await response.body();
  expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
});
