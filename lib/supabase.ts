import { createClient } from "@supabase/supabase-js";
import type { Session } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createPasswordRecoveryEventGate } from "@/lib/admin-password-recovery";

// A database request on a bar's Wi-Fi can hang without failing. Every PostgREST
// read and RPC gives up after this long, so the screen that waits on it can
// show its retry path instead of the logo forever (#486). Auth and Storage keep
// their own transports: photo uploads may legitimately take longer.
export const DATABASE_REQUEST_TIMEOUT_MS = 15_000;

export const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { db: { timeout: DATABASE_REQUEST_TIMEOUT_MS } }
);

// Register immediately after client creation so the one-shot redirect event is
// captured even when it fires before the reset page's React effect mounts.
export const passwordRecoverySession: Promise<Session | null> =
  createPasswordRecoveryEventGate(supabase.auth);
