import { supabase } from "@/lib/supabase";
import { browserIdentityMarker, createGuestSession } from "@/lib/guest-session";
import type { User } from "@supabase/supabase-js";

// V1 auth is Supabase anonymous sign-in (see docs/decisions.md, 2026-06-19):
// landing / scanning the QR creates a real auth.users row with zero friction,
// which gives us auth.uid() so RLS is enforceable from day one. A failed token
// refresh never replaces that identity (#480, lib/guest-session.ts).
export const guestSession = createGuestSession(supabase.auth, browserIdentityMarker);

export function ensureAnonSession(): Promise<User> {
  return guestSession.ensure();
}
