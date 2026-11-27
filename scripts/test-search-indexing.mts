// What crawlers receive on each deployment (#277): only the production landing
// page may be indexed; every other path, and every non-production deployment,
// answers noindex. robots.txt never blocks a private path (a blocked page's noindex
// is never read), and only production advertises a sitemap.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
// @ts-expect-error Node's direct TypeScript runner requires the file extension.
import { INDEXABLE_PATHS, NOINDEX, SITE_URL, robotsRules, searchIndexingHeaders, sitemapEntries } from "../lib/search-indexing.ts";

// The matcher Next.js applies to `headers()` sources.
const { getPathMatch } = createRequire(import.meta.url)("next/dist/shared/lib/router/utils/path-match") as {
  getPathMatch: (source: string) => (pathname: string) => false | object;
};

type Env = { VERCEL_ENV?: string };
const robotsHeader = (env: Env, pathname: string) => {
  const rule = searchIndexingHeaders(env).find(({ source }) => getPathMatch(source)(pathname));
  return rule?.headers.find(({ key }) => key === "X-Robots-Tag")?.value ?? null;
};

const production = { VERCEL_ENV: "production" };
const nonProduction: Env[] = [{ VERCEL_ENV: "preview" }, { VERCEL_ENV: "development" }, {}, { VERCEL_ENV: "Production" }];

const privatePaths = [
  "/v/some-bar", "/v/some-bar?night=1", "/chat/00000000-0000-4000-8000-000000000000", "/profile",
  "/admin", "/admin/venues/x/nights/y", "/admin/reset-password", "/email-preferences", "/unsubscribe",
  "/events/00000000-0000-4000-8000-000000000000", "/reservations/access", "/reservations/x",
  "/reservation-terms", "/preview/reservation-qr", "/legal", "/privacy", "/terms", "/api/email/subscribe",
  "/opengraph-image", "/brand/amourette-wordmark-ruby.svg", "/_next/static/chunks/app.js", "/unknown",
];

// Production: the landing page alone is indexable.
assert.deepEqual([...INDEXABLE_PATHS], ["/"]);
assert.equal(robotsHeader(production, "/"), null, "the production landing page stays indexable");
for (const path of privatePaths) assert.equal(robotsHeader(production, path.split("?")[0]), NOINDEX, `production ${path}`);

// Any other deployment, including the landing page: noindex. An unexpected
// VERCEL_ENV value is treated as a preview, never as production.
for (const env of nonProduction) {
  for (const path of ["/", ...privatePaths]) assert.equal(robotsHeader(env, path.split("?")[0]), NOINDEX, `${JSON.stringify(env)} ${path}`);
}
assert.equal(NOINDEX, "noindex, nofollow");

// robots.txt: production lets crawlers reach every page so they read its noindex,
// and points to the sitemap; any other deployment refuses all crawling.
assert.deepEqual(robotsRules(production), { rules: { userAgent: "*", allow: "/" }, sitemap: "https://getamourette.com/sitemap.xml" });
for (const env of nonProduction) assert.deepEqual(robotsRules(env), { rules: { userAgent: "*", disallow: "/" } }, JSON.stringify(env));

// sitemap.xml: only the production landing page, on the canonical origin.
assert.equal(SITE_URL, "https://getamourette.com");
assert.deepEqual(sitemapEntries(production), [{ url: "https://getamourette.com/" }]);
for (const env of nonProduction) assert.deepEqual(sitemapEntries(env), [], JSON.stringify(env));

console.log("PASS search indexing: production landing indexable, every other path and deployment noindex");
