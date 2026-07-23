import { supabase } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

// V1 auth is Supabase anonymous sign-in (see docs/decisions.md, 2026-06-19):
// landing / scanning the QR creates a real auth.users row with zero friction,
// which gives us auth.uid() so RLS is enforceable from day one.
//
// Memoized as a single in-flight promise so React 19 strict-mode double-invokes
// (and concurrent callers across pages) never create two anonymous users.
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
        inFlight = null; // let the next caller retry
        throw error ?? new Error("Anonymous sign-in returned no user");
      }
      return data.user;
    })();
  }
  return inFlight;
}
