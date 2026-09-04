// Shared profile vocabulary for the dating filter (see docs/decisions.md,
// 2026-06-19). Kept in sync with the CHECK constraints on public.profiles.

export const GENDERS = ["woman", "man", "nonbinary"] as const;
export type Gender = (typeof GENDERS)[number];
export const FIRST_NAME_MAX_LENGTH = 30;
export const PROFILE_BIO_MAX_LENGTH = 500;

// Display labels are localized in lib/strings.ts (t[locale].genders).

// Mutual compatibility: each side must want the other's gender. This is the
// filter that decides who shows up in the room.
export function isMutuallyCompatible(
  a: { gender: string; interested_in: string[] },
  b: { gender: string; interested_in: string[] }
): boolean {
  return a.interested_in.includes(b.gender) && b.interested_in.includes(a.gender);
}
