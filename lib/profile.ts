// Shared profile vocabulary for the dating filter (see docs/decisions.md,
// 2026-06-19). Kept in sync with the CHECK constraints on public.profiles.

export const GENDERS = ["woman", "man", "nonbinary"] as const;
export type Gender = (typeof GENDERS)[number];
export const FIRST_NAME_MAX_LENGTH = 30;
export const PROFILE_BIO_MAX_LENGTH = 300;

// Display labels are localized in lib/strings.ts (t[locale].genders).

export function isGender(value: unknown): value is Gender {
  return typeof value === "string" && (GENDERS as readonly string[]).includes(value);
}

export function isInterestedIn(value: unknown): value is Gender[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= 3 &&
    value.every(isGender) && new Set(value).size === value.length;
}
