import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

// V1 auth is Supabase anonymous sign-in (see docs/decisions.md, 2026-06-19):
// landing / scanning the QR creates a real auth.users row with zero friction,
// which gives us auth.uid() so RLS is enforceable from day one.
//
// Share only a pending request so React 19 strict-mode double-invokes (and
// concurrent callers) never create two anonymous users. A settled user must
// not be cached: another tab may replace or remove the authenticated session.
let inFlight: Promise<User> | null = null;

export function ensureAnonSession(): Promise<User> {
  if (!inFlight) {
    inFlight = (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) return session.user;

      const { data, error } = await supabase.auth.signInAnonymously();
      if (error || !data.user) {
        throw error ?? new Error("Anonymous sign-in returned no user");
      }
      return data.user;
    })().finally(() => { inFlight = null; });
  }
  return inFlight;
}
