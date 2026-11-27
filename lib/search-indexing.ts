// What search engines and link previews receive (#277). Only the production
// landing page is indexable: every other path (venue rooms, chat, profile, admin,
// reservations, email preferences, legal pages, API, assets) and every non-production
// deployment answers `X-Robots-Tag: noindex, nofollow`. robots.txt never hides a
// private path, because a crawler that cannot fetch a page never sees its noindex.

/** Canonical production origin. Previews and local builds never advertise their own. */
export const SITE_URL = "https://getamourette.com";

/** Paths a production crawler may index. Anything else is noindex. */
export const INDEXABLE_PATHS = ["/"] as const;

export const NOINDEX = "noindex, nofollow";

type IndexingEnv = Record<string, string | undefined>;

/** Only the Vercel production deployment, never a preview, a CI build or a local server. */
export function isProductionDeployment(env: IndexingEnv): boolean {
  return env.VERCEL_ENV === "production";
}

/**
 * next.config.ts header rules. `/:path+` needs at least one segment, so in
 * production it matches every path except the landing page itself.
 */
export function searchIndexingHeaders(env: IndexingEnv) {
  return [{
    source: isProductionDeployment(env) ? "/:path+" : "/:path*",
    headers: [{ key: "X-Robots-Tag", value: NOINDEX }],
  }];
}

/** Body of robots.txt: crawl the production site, nothing on any other deployment. */
export function robotsRules(env: IndexingEnv) {
  return isProductionDeployment(env)
    ? { rules: { userAgent: "*", allow: "/" }, sitemap: `${SITE_URL}/sitemap.xml` }
    : { rules: { userAgent: "*", disallow: "/" } };
}

/** sitemap.xml: the indexable production URLs, empty elsewhere. */
export function sitemapEntries(env: IndexingEnv) {
  return isProductionDeployment(env) ? INDEXABLE_PATHS.map(path => ({ url: `${SITE_URL}${path}` })) : [];
}
