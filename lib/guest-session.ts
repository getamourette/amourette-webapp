import { isAuthRefreshDiscardedError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import type { AuthError, Session, User } from "@supabase/supabase-js";

// Keeps a guest's anonymous identity across a bad network (#480).
//
// A guest has no login: the session stored in this browser is the only key to
// her profile, matches and chats. Supabase drops an expired session only when
// the server refuses its refresh token; on a network failure or a 5xx it keeps
// the session and reports a retryable error. So:
//   - a retryable refresh failure keeps the session and waits for the network
//     ("reconnecting"), never signing in again;
//   - a refused refresh, or a session that disappeared after this browser
//     already had an identity, is reported as "ended" and the guest decides to
//     start again; nothing creates a new identity behind her back;
//   - only a browser that never had an identity signs in anonymously at once.

export type GuestSessionState = "ok" | "reconnecting" | "ended";

type SessionResult = { data: { session: Session | null }; error: AuthError | null };
type SignInResult = { data: { user: User | null }; error: AuthError | null };

export type GuestAuth = {
  getSession(): Promise<SessionResult>;
  signInAnonymously(): Promise<SignInResult>;
};

export type IdentityMarker = {
  read(): boolean;
  write(userId: string): void;
  clear(): void;
};

export class GuestSessionEndedError extends Error {
  constructor() {
    super("The guest session ended and was not replaced");
    this.name = "GuestSessionEndedError";
  }
}

// Supabase answers from a cached failure for 60 s after a failed refresh, so a
// poll costs nothing until it really retries.
export const RECONNECT_POLL_MS = 3_000;

const MARKER_KEY = "amourette-guest-identity";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Remembers that this browser holds an anonymous identity, so a session cleared by a
// background refresh is not mistaken for a first visit. It holds only the
// opaque user id, which is also inside the Supabase session it shadows.
export const browserIdentityMarker: IdentityMarker = {
  read() {
    try {
      const raw = window.localStorage.getItem(MARKER_KEY);
      return raw !== null && uuid.test(raw);
    } catch {
      return false;
    }
  },
  write(userId) {
    try {
      if (uuid.test(userId)) window.localStorage.setItem(MARKER_KEY, userId);
    } catch { /* Storage unavailable: the session cannot persist either. */ }
  },
  clear() {
    try { window.localStorage.removeItem(MARKER_KEY); } catch { /* Storage unavailable. */ }
  },
};

export function createGuestSession(
  auth: GuestAuth,
  marker: IdentityMarker,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
) {
  let state: GuestSessionState = "ok";
  const listeners = new Set<() => void>();
  const setState = (next: GuestSessionState) => {
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  };

  async function resolve(): Promise<User> {
    for (;;) {
      const { data: { session }, error } = await auth.getSession();
      if (session?.user) {
        // A password sign-in (a founder's admin in the same browser) replaces
        // the guest on purpose, and its sign-out starts a new guest as before.
        if (session.user.is_anonymous) marker.write(session.user.id);
        else marker.clear();
        setState("ok");
        return session.user;
      }
      // Another tab rotated the tokens under this refresh: read storage again.
      if (error && isAuthRefreshDiscardedError(error)) continue;
      if (error && isAuthRetryableFetchError(error)) {
        setState("reconnecting");
        await wait(RECONNECT_POLL_MS);
        continue;
      }
      if (error || marker.read()) {
        setState("ended");
        throw new GuestSessionEndedError();
      }
      const { data, error: signInError } = await auth.signInAnonymously();
      if (signInError || !data.user) {
        throw signInError ?? new Error("Anonymous sign-in returned no user");
      }
      marker.write(data.user.id);
      setState("ok");
      return data.user;
    }
  }

  // Share only a pending request so React 19 strict-mode double-invokes (and
  // concurrent callers) never create two anonymous users. A settled user must
  // not be cached: another tab may replace or remove the authenticated session.
  let inFlight: Promise<User> | null = null;

  return {
    ensure(): Promise<User> {
      if (!inFlight) inFlight = resolve().finally(() => { inFlight = null; });
      return inFlight;
    },
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    // The guest chose to start again after her session ended.
    forgetIdentity() {
      marker.clear();
    },
    // Every auth change, including the admin's password sign-in on a page
    // that never asks for a guest session: a password user replaced the guest
    // on purpose, so its later sign-out is a fresh start, not a lost session.
    observeUser(user: User | null) {
      if (user && !user.is_anonymous) marker.clear();
    },
  };
}
