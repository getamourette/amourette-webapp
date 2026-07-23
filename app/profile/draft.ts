// Onboarding draft persistence (#72). The guided flow persists the scalar
// answers to localStorage keyed by the anonymous user id, so a returning user
// resumes where they stopped instead of starting over (e.g. they checked a
// message mid-flow). The photo is deliberately NOT persisted here: a File does
// not serialize to localStorage, so it lives in memory only and is re-asked
// after a full tab close. Persisting the photo Blob to IndexedDB is the tracked
// follow-up (#98).

import { GENDERS, type Gender } from "@/lib/profile";

export type OnboardingDraft = {
  firstName: string;
  bio: string;
  gender: Gender | "";
  interestedIn: Gender[];
  adultConfirmed: boolean;
  step: number;
};

const KEY_PREFIX = "amourette-onboarding-draft:";

function isGender(value: unknown): value is Gender {
  return typeof value === "string" && (GENDERS as readonly string[]).includes(value);
}

export function loadDraft(userId: string): OnboardingDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft>;
    return {
      firstName: typeof parsed.firstName === "string" ? parsed.firstName : "",
      bio: typeof parsed.bio === "string" ? parsed.bio : "",
      gender: isGender(parsed.gender) ? parsed.gender : "",
      interestedIn: Array.isArray(parsed.interestedIn)
        ? parsed.interestedIn.filter(isGender)
        : [],
      adultConfirmed: parsed.adultConfirmed === true,
      step: typeof parsed.step === "number" ? parsed.step : 0,
    };
  } catch {
    return null;
  }
}

export function saveDraft(userId: string, draft: OnboardingDraft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_PREFIX + userId, JSON.stringify(draft));
  } catch {
    // Quota or private-mode failures are non-fatal: the flow still works, it
    // just won't resume after a reload. No need to surface this to the user.
  }
}

export function clearDraft(userId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY_PREFIX + userId);
  } catch {
    // Ignore — a stale draft is harmless (it is overwritten on next save, and
    // the profile already exists so the resume path is no longer reached).
  }
}
