// Founder second factor (#374). Supabase Auth owns the TOTP secrets and checks
// every code; this module only shapes the input and walks the founder's
// verified authenticators, since each device enrolled separately has its own
// secret and a code matches only one of them.

export const TOTP_CODE_DIGITS = 6;

// An authenticator shows the code as "123 456"; spaces are a display artifact.
// Anything other than exactly six ASCII digits after removing them is refused
// before a request is sent.
export function normalizeTotpCode(raw: string): string | null {
  const code = raw.replace(/\s+/g, "");
  return /^[0-9]{6}$/.test(code) ? code : null;
}

type Factor = { id: string; factor_type: string; status: string };
type Result<T> = { data: T | null; error: unknown };

export interface TwoFactorAuth {
  mfa: {
    listFactors: () => Promise<Result<{ all: Factor[]; totp: Factor[] }>>;
    challengeAndVerify: (params: { factorId: string; code: string }) => Promise<Result<unknown>>;
    getAuthenticatorAssuranceLevel: () => Promise<Result<{ currentLevel: string | null; nextLevel: string | null }>>;
  };
}

// "verified": the session is now aal2. "invalid": no authenticator accepted the
// code. "unavailable": the factors could not be read (network, expired session).
export async function verifyTotpCode(auth: TwoFactorAuth, code: string): Promise<"verified" | "invalid" | "unavailable"> {
  const { data, error } = await auth.mfa.listFactors();
  if (error || !data) return "unavailable";
  for (const factor of data.totp) {
    const result = await auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (!result.error) return "verified";
  }
  return "invalid";
}

// "challenge": the account has a verified factor the session has not used yet.
// "none": a one-factor session of an account without any. "satisfied": aal2.
// "unknown": no session, or a token without an assurance level (it was not
// issued by Supabase Auth): the database still decides access.
export async function secondFactorState(auth: TwoFactorAuth): Promise<"challenge" | "none" | "satisfied" | "unknown"> {
  let level;
  try {
    ({ data: level } = await auth.mfa.getAuthenticatorAssuranceLevel());
  } catch {
    return "unknown";
  }
  if (level?.currentLevel === "aal2") return "satisfied";
  if (level?.currentLevel === "aal1") return level.nextLevel === "aal2" ? "challenge" : "none";
  return "unknown";
}
