import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await client.rpc("unsubscribe_email_by_token", { p_token: token });
  if (error || data === "failure") return new Response(null, { status: 500 });
  if (data === "invalid_token") return new Response(null, { status: 400 });
  return new Response(null, { status: 200 });
}

