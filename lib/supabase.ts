import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

// Temporary #119 POC: cookie-backed auth lets iOS copy the anonymous session
// from Safari into an app installed from that page. The browser and installed
// app then share the copied starting point but maintain separate cookie jars.
export const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);
