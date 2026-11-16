import { randomBytes } from "node:crypto";
import { DEMO_SEED } from "./demo-venue-roster.mjs";

// Shared rules for the synthetic accounts behind the QA rooms and the demo
// room. This repository is public: nothing here may let a reader work out a
// credential that a seeded account accepts (#370, SEC-007).

export const TEST_SEED = "always-live-test-venues-v1";

const SEED_EMAIL = /^([a-z0-9-]+)@seed\.(?:amourette|paramour)\.invalid$/;

// A fresh secret per account and per run. It lives only in the seeding process,
// long enough to record the participant's own consent, and is never stored or
// printed. The suffix satisfies character-class password policies.
export function randomSeedPassword() {
  return `${randomBytes(32).toString("base64url")}aA1!`;
}

// "test" = QA rooms, "demo" = venue-pitch room, "other" = a synthetic account
// from an older seed tag or email domain, null = not a seed account.
export function seedScope(user) {
  const tag = user.app_metadata?.test_seed;
  if (tag === TEST_SEED) return "test";
  if (tag === DEMO_SEED) return "demo";
  if (tag || SEED_EMAIL.test(user.email ?? "")) return "other";
  return null;
}

export function seedAccounts(users, scope) {
  return users
    .map((user) => ({ user, scope: seedScope(user) }))
    .filter((entry) => entry.scope && (scope === "all" || entry.scope === scope))
    .sort((a, b) => a.scope.localeCompare(b.scope) || (a.user.email ?? "").localeCompare(b.user.email ?? ""));
}

// The templates published before #370, kept only so the rotation command can
// prove that no account accepts them any more. Never use them to create or
// update an account.
export function retiredTemplatePasswords(user) {
  const key = SEED_EMAIL.exec(user.email ?? "")?.[1];
  return key ? [`Test-only-${key}-2026!`, `Demo-only-${key}-2026!`] : [];
}
