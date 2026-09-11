import { isRecord, isUnsubscribeToken } from "@/lib/input-validation";
import { readBoundedJson, RequestBodyError } from "@/lib/server/request-body";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type UnsubscribeResult =
  | "unsubscribed"
  | "already_unsubscribed"
  | "invalid_token"
  | "failure";

function publicClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function response(body: { status: UnsubscribeResult }) {
  return Response.json(body, {
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

export async function POST(request: Request) {
  let token = "";
  try {
    const body = await readBoundedJson(request, 1024);
    token = isRecord(body) && isUnsubscribeToken(body.token) ? body.token : "";
  } catch (error) {
    if (error instanceof RequestBodyError && error.status === 413) return new Response(null, { status: 413 });
    return response({ status: "invalid_token" });
  }
  if (!isUnsubscribeToken(token)) return response({ status: "invalid_token" });
  const { data, error } = await publicClient().rpc(
    "unsubscribe_email_by_token",
    { p_token: token }
  );
  if (error) return response({ status: "failure" });
  const allowed: UnsubscribeResult[] = [
    "unsubscribed", "already_unsubscribed", "invalid_token", "failure",
  ];
  return response({ status: allowed.includes(data as UnsubscribeResult) ? data as UnsubscribeResult : "failure" });
}
