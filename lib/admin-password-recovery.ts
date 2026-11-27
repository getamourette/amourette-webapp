import type { AuthChangeEvent } from "@supabase/supabase-js";

interface AuthSubscription {
  unsubscribe: () => void;
}

interface RecoveryAuthSource<TSession> {
  initialize: () => Promise<unknown>;
  onAuthStateChange: (
    callback: (event: AuthChangeEvent, session: TSession | null) => void,
  ) => { data: { subscription: AuthSubscription } };
}

export type AdminRecoveryGate = "invalid" | "challenge" | "setup" | "unauthorized" | "ready";

// Supabase emits PASSWORD_RECOVERY in a timer after it finishes processing the
// redirect URL. Register this gate immediately after createClient(), then wait
// one timer turn beyond initialization before concluding that no recovery event
// exists. This records the one-shot redirect proof without treating an ordinary
// INITIAL_SESSION or SIGNED_IN event as recovery.
export function createPasswordRecoveryEventGate<TSession>(
  auth: RecoveryAuthSource<TSession>,
): Promise<TSession | null> {
  return new Promise((resolve) => {
    let settled = false;
    let subscription: AuthSubscription | null = null;

    function finish(session: TSession | null) {
      if (settled) return;
      settled = true;
      subscription?.unsubscribe();
      resolve(session);
    }

    const result = auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) finish(session);
    });
    subscription = result.data.subscription;

    void auth.initialize().then(
      () => setTimeout(() => finish(null), 0),
      () => setTimeout(() => finish(null), 0),
    );
  });
}

// A recovery link signs in with one factor. When the account has an
// authenticator, its code comes first (#374): Supabase Auth refuses the
// password update without it, and founder access requires it. A founder
// without one is offered setup first: founder access requires the second
// factor, so the password form would otherwise be unreachable.
export async function resolveAdminRecoveryGate<TSession>(
  recoverySession: TSession | null,
  isAdmin: () => Promise<boolean>,
  needsSecondFactor: () => Promise<boolean> = async () => false,
  needsSetup: () => Promise<boolean> = async () => false,
): Promise<AdminRecoveryGate> {
  if (!recoverySession) return "invalid";
  if (await needsSecondFactor()) return "challenge";
  if (await isAdmin()) return "ready";
  return (await needsSetup()) ? "setup" : "unauthorized";
}
