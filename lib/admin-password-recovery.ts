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

export type AdminRecoveryGate = "invalid" | "unauthorized" | "ready";

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

export async function resolveAdminRecoveryGate<TSession>(
  recoverySession: TSession | null,
  isAdmin: () => Promise<boolean>,
): Promise<AdminRecoveryGate> {
  if (!recoverySession) return "invalid";
  return (await isAdmin()) ? "ready" : "unauthorized";
}
