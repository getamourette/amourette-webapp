import { createClient } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createPasswordRecoveryEventGate } from "@/lib/admin-password-recovery";
import { withAuthRequestTimeout } from "@/lib/auth-request-timeout";

// A database request on a bar's Wi-Fi can hang without failing. Every PostgREST
// read and RPC gives up after this long, so the screen that waits on it can
// show its retry path instead of the logo forever (#486). Storage keeps its own
// transport: photo uploads may legitimately take longer.
export const DATABASE_REQUEST_TIMEOUT_MS = 15_000;

export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {
    db: { timeout: DATABASE_REQUEST_TIMEOUT_MS },
    global: { fetch: withAuthRequestTimeout(process.env.NEXT_PUBLIC_SUPABASE_URL!) },
  }
);

// Register immediately after client creation so the one-shot redirect event is
// captured even when it fires before the reset page's React effect mounts.
export const passwordRecoverySession: Promise<Session | null> =
  createPasswordRecoveryEventGate(supabase.auth);
