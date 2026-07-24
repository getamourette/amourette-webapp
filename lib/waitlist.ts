import type { Locale } from "@/lib/strings";

// Cold-acquisition email capture on the landing (#71). The visitor here has no
// profile (that is what makes them "new"), so their address cannot live in
// profile_private — it belongs in the standalone `email_signups` table (#105),
// the profile-less entry point of the same global subscription as #33.

// Version of the consent copy the visitor accepts by submitting. Bump when the
// waitlist wording materially changes, so #63/#64 can reason about what was
// agreed to.
export const WAITLIST_CONSENT_VERSION = "2026-07-24";

// A deliberately loose client-side gate — real verification happens before any
// marketing send (#63). This only stops the obvious typo from reaching the form
// submit; it is not an RFC-5322 validator.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

export class InvalidEmailError extends Error {}

/**
 * Record a cold waitlist signup from the landing page.
 *
 * TODO(#105): persist to the `email_signups` table once it exists
 * (`insert({ email, locale, source: "landing", consent_version })` as the
 * `authenticated` role — anonymous sign-in issues `authenticated`, so RLS and
 * the grant target that role). Until the migration lands, this accepts the
 * address client-side only; the app is pre-launch with no real traffic, and
 * swapping the body below for the insert is a one-line change.
 */
export async function subscribeEmail(email: string, locale: Locale): Promise<void> {
  const trimmed = email.trim();
  if (!isValidEmail(trimmed)) throw new InvalidEmailError();

  // Stand in for the network round-trip so the form's loading state is real;
  // the actual insert (#105) will take its place and carry its own latency.
  await new Promise((resolve) => setTimeout(resolve, 450));

  if (process.env.NODE_ENV !== "production") {
    console.info("[waitlist] pending #105 — would subscribe", {
      email: trimmed,
      locale,
      source: "landing",
      consent_version: WAITLIST_CONSENT_VERSION,
    });
  }
}
