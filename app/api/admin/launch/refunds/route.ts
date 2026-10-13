import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { refundRecoveryInput } from "@/lib/launch-operations";
import { launchProvider, launchRpc, privateJson } from "@/lib/server/launch-service";
import { recoverLaunchRefund } from "@/lib/server/launch-recovery";
import { readBoundedJson, RequestBodyError } from "@/lib/server/request-body";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  // Admin previews use their own same-origin URL; no guest checkout origin is
  // needed. Tokens are verified remotely and never decoded as authorization.
  const origin = request.headers.get("origin");
  let sameOrigin = false;
  try {
    const url = new URL(origin ?? "");
    sameOrigin = url.origin === origin && url.host === request.headers.get("host") &&
      (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)));
  } catch { /* Malformed origins are refused before authentication. */ }
  if (!sameOrigin || request.headers.get("sec-fetch-site") === "cross-site" ||
    request.headers.get("content-type")?.split(";")[0] !== "application/json") return privateJson({ error: "Request refused." }, 403);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || authorization.length > 8192) return privateJson({ error: "Sign in again." }, 401);
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } },
  });
  try {
    const { data: { user }, error } = await client.auth.getUser(authorization.slice(7));
    if (error || !user || user.is_anonymous) return privateJson({ error: "Sign in again." }, 401);
    const admin = await client.rpc("am_i_admin");
    if (admin.error || admin.data !== true) return privateJson({ error: "Founder access required." }, 403);
    let input;
    try { input = refundRecoveryInput(await readBoundedJson(request, 8192)); }
    catch (error) { return privateJson({ error: "Enter a valid refund reference and a reason of 1–500 characters." }, error instanceof RequestBodyError ? error.status : 400); }
    const rpc = launchRpc();
    // Bucket by verified user, independent of client-provided IP addresses.
    const { createHash } = await import("node:crypto");
    if (!await rpc("launch_http_allow", { p_bucket: createHash("sha256").update(`launch-admin:${user.id}`).digest("hex") })) {
      return privateJson({ error: "Too many requests. Wait a minute and try again." }, 429);
    }
    const { stripe, account } = await launchProvider();
    await recoverLaunchRefund(rpc, stripe, account, user.id, input);
    return privateJson({ ok: true });
  } catch {
    // No raw provider/DB messages, tokens or guest details in logs/responses.
    return privateJson({ error: "Recovery could not be verified. Refresh the reservation and check the full refund in Stripe. Partial refunds, disputes, active processing and uncertain failures need review." }, 409);
  }
}
