import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

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

async function fetchHead(request: APIRequestContext, page: Page, path: string) {
  const response = await request.get(path, { headers: bypass, maxRedirects: 0 });
  const html = await response.text();
  // Parse the raw response in a detached document so scripts cannot add tags.
  const metadata = await page.evaluate(source => {
    const document = new DOMParser().parseFromString(source, 'text/html');
    const head = document.head;
    const tags = head.querySelectorAll<HTMLMetaElement>('meta[property], meta[name]');
    const meta: Partial<Record<string, string>> = Object.fromEntries(
      Array.from(tags, tag => [tag.getAttribute('property') ?? tag.name, tag.content]),
    );
    return {
      title: document.title,
      meta,
      canonical: head.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    };
  }, html);
  return { status: response.status(), robots: response.headers()['x-robots-tag'], ...metadata };
}

// The same preview on every page, image included (a deeper segment that sets
// openGraph would drop the root image), and never the page's own URL.
function expectGenericPreview(meta: Partial<Record<string, string>>) {
  expect(meta['og:url']).toBeUndefined();
  expect(meta['og:site_name']).toBe('Amourette');
  expect(meta['og:type']).toBe('website');
  expect(meta['og:title']).toBe(title);
  expect(meta['og:description']).toBe(description);
  expect(meta['og:locale']).toBe('fr_FR');
  expect(meta['og:locale:alternate']).toBeUndefined();
  expect(meta['og:image']).toMatch(/^https:\/\/getamourette\.com\/opengraph-image(?:\?|$)/);
  expect(meta['og:image:width']).toBe('1200');
  expect(meta['og:image:height']).toBe('630');
  expect(meta['og:image:alt']).toBe('Amourette logo, cream on a dark velvet background');
  expect(meta['twitter:card']).toBe('summary_large_image');
  expect(meta['twitter:title']).toBe(title);
  expect(meta['twitter:description']).toBe(description);
}

test('the landing page carries its title, description, canonical URL and link preview', async ({ request, page }) => {
  const head = await fetchHead(request, page, '/');
  expect(head.status).toBe(200);
  expect(head.title).toBe(title);
  expect(head.meta.description).toBe(description);
  expect(head.canonical).toBe('https://getamourette.com');
  expectGenericPreview(head.meta);
  // Not the production deployment: the landing page does not advertise itself.
  expect(head.robots).toBe('noindex, nofollow');
});

// Private and transactional pages: generic preview only, no canonical, and
// noindex in the response header.
for (const path of ['/v/search-indexing-probe', `/chat/${id}`, '/profile', '/admin', `/events/${id}`, `/reservations/${id}`, '/email-preferences', '/unsubscribe', '/legal']) {
  test(`${path} is noindex and shares only the generic preview`, async ({ request, page }) => {
    const head = await fetchHead(request, page, path);
    expect(head.status).toBeLessThan(500);
    expect(head.robots).toBe('noindex, nofollow');
    expectGenericPreview(head.meta);
    expect(head.canonical).toBeUndefined();
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

test('the link-preview image is a 1200 x 630 PNG', async ({ request, page }) => {
  const image = new URL((await fetchHead(request, page, '/')).meta['og:image']!);
  const response = await request.get(`${image.pathname}${image.search}`, { headers: bypass });
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('image/png');
  const png = await response.body();
  expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
});
