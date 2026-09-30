// Preserve this exact draft wording in the SQL catalog. Public release requires
// #203's approved disclosures and a new version; never rewrite accepted wording.
export const MATCHING_CONSENT_VERSION = 'matching-v1-draft';
export const MATCHING_CONSENT_WORDING = {
  en: 'I agree that Amourette uses my gender and dating preferences to suggest compatible people to me and show my profile to them.',
  fr: 'J’accepte qu’Amourette utilise mon genre et mes préférences de rencontre pour me proposer des personnes compatibles et leur montrer mon profil.',
  es: 'Acepto que Amourette utilice mi género y mis preferencias de citas para sugerirme personas compatibles y mostrarles mi perfil.',
} as const;
export type ConsentLocale = keyof typeof MATCHING_CONSENT_WORDING;
// Scrub legacy scalar drafts on every application entry, including accounts
// that already have a profile and never revisit the onboarding resume path.
export function purgeStoredMatchingAnswers() {
  if (typeof window === 'undefined') return;
  try {
    const storage = window.localStorage;
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i))
      .filter((key): key is string => key !== null && key.startsWith('amourette-onboarding-draft:'));
    for (const key of keys) {
      const raw = storage.getItem(key);
      if (!raw || raw.length > 32768) { storage.removeItem(key); continue; }
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { storage.removeItem(key); continue; }
        const draft = parsed as Record<string, unknown>;
        storage.setItem(key, JSON.stringify({ firstName: draft.firstName, bio: draft.bio,
          adultConfirmed: draft.adultConfirmed === true,
          step: typeof draft.step === 'number' && Number.isInteger(draft.step) ? Math.max(0, Math.min(2, draft.step)) : 0 }));
      } catch { storage.removeItem(key); }
    }
  } catch { /* Unavailable storage cannot authorize consent or restore answers. */ }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const timestamp = (value: unknown): value is string => typeof value === 'string' && value.length <= 40 &&
  /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
export function validMatchingConsent(value: Record<string, unknown>): boolean {
  return value.matching_consent === true && value.matching_consent_version === MATCHING_CONSENT_VERSION &&
    (value.matching_consent_locale === 'en' || value.matching_consent_locale === 'fr' || value.matching_consent_locale === 'es');
}
export type MatchingConsentState = {
  active: boolean; revision: string | null; granted_at: string | null;
  withdrawn_at: string | null; available_at: string | null; server_now: string;
};
export function parseMatchingConsentState(value: unknown): MatchingConsentState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid consent state');
  const row = value as Record<string, unknown>;
  if (typeof row.active !== 'boolean' || !(row.revision === null || (typeof row.revision === 'string' && uuid.test(row.revision))) ||
    !timestamp(row.server_now) || ![row.granted_at, row.withdrawn_at, row.available_at].every(v => v === null || timestamp(v)) ||
    (row.active && (row.revision === null || row.granted_at === null || row.withdrawn_at !== null))) throw new Error('Invalid consent state');
  return { active: row.active, revision: row.revision, granted_at: row.granted_at as string | null,
    withdrawn_at: row.withdrawn_at as string | null, available_at: row.available_at as string | null, server_now: row.server_now };
}
