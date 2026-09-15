import { createClient } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createPasswordRecoveryEventGate } from "@/lib/admin-password-recovery";

export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

// Register immediately after client creation so the one-shot redirect event is
// captured even when it fires before the reset page's React effect mounts.
export const passwordRecoverySession: Promise<Session | null> =
  createPasswordRecoveryEventGate(supabase.auth);
