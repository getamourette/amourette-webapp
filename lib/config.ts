// Dev-only default venue. Bloc 2 (like/match) is built before Bloc 1 (QR
// check-in), so there is no real presence/venue selection yet: the landing and
// the post-onboarding redirect send people to this seeded venue. In Bloc 1 the
// `/v/[venueSlug]` route is entered by scanning a QR and this constant goes away.
export const DEV_DEFAULT_VENUE_SLUG = "paris-test";

// Optional store links for the post-onboarding promo modal. These fall back to
// the store homepages until real app listings exist.
export const APP_STORE_URL =
  process.env.NEXT_PUBLIC_APP_STORE_URL ?? "https://apps.apple.com/";
export const GOOGLE_PLAY_URL =
  process.env.NEXT_PUBLIC_GOOGLE_PLAY_URL ?? "https://play.google.com/store/apps";
