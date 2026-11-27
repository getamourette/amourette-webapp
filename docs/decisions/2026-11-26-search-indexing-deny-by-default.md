# Only the production landing page is indexable; noindex is a header, by default

**Date:** 2026-11-26 · **Issue:** #277

## Decision

1. The production landing page (`/` on getamourette.com) is the only indexable
   page. Every other path (venue rooms, chat, profile, admin, reservations, email
   preferences, legal pages, API, static files) and every non-production
   deployment (Vercel previews, CI and local builds) answers
   `X-Robots-Tag: noindex, nofollow`.
2. The rule lives in one place, `lib/search-indexing.ts`, applied as a
   `next.config.ts` header keyed on `VERCEL_ENV === "production"` at build time.
   A new route is private without anyone remembering to mark it.
3. robots.txt never lists private paths. In production it allows everything and
   points to a sitemap holding only the landing page; elsewhere it disallows all.
4. Every page shares one generic link preview: the landing page's title and
   description (taken from its existing `kicker` and `promise` copy) and the
   approved vertical logo in cream on the velvet ground, generated at build time
   by `app/opengraph-image.tsx`. Only the landing page names a canonical URL; no
   page sets `og:url` (apps use the shared URL). No preview names a venue, a night
   or a person. No segment below the root sets `openGraph`: Next would replace the
   whole object, generated image included (seen on #575).
5. `metadataBase` and the canonical URL are always `https://getamourette.com`,
   including on previews.

## Why

- Rooms, chats and reservations are the participants' private space, and the
  product promise is "who is here, now", not a searchable directory. A header
  covers client-rendered pages and non-HTML responses that cannot carry a meta
  tag, and deny-by-default means a forgotten route fails closed.
- A crawler blocked by robots.txt never reads the page's noindex and can still
  list the bare URL, so robots.txt is not used to hide anything (it is also a
  public list of what one wants hidden).
- Legal pages stay noindex for now: founder triage (2026-10-21) reduced launch
  scope to the landing page; opening more pages is a later SEO choice, made by
  adding a path to `INDEXABLE_PATHS`.
- A shared venue QR or event link is the most common share. A generic preview
  keeps tonight's venue, night and guests out of messaging apps' caches.
- The image reuses the delivered logo (`docs/brand/logo/v1`) rather than a new
  composition, so no unapproved brand artwork ships.

## Rejected

- Per-page `robots` metadata: easy to forget on a new route, and unavailable to
  responses that are not pages.
- A sitemap listing legal pages, or one on previews: nothing else is meant to be
  found.
