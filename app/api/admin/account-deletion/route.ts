import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { DELETION_REFUSALS, DELETION_VERDICTS, accountId, removePhotoFiles, type DeletionVerdict } from "@/lib/server/account-deletion";
import { readBoundedJson, RequestBodyError } from "@/lib/server/request-body";

export const runtime = "nodejs";
export const maxDuration = 60;

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: {
  "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
} });

// #258: a founder deletes a guest's profile, photo files and account after a
// verified request. The founder's own session runs admin_delete_guest_account,
// which checks and deletes under one lock (the cascade removes every profile
// row); only then does the service role remove the photo files.
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  let sameOrigin = false;
  try {
    const url = new URL(origin ?? "");
    sameOrigin = url.origin === origin && url.host === request.headers.get("host") &&
      (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)));
  } catch { /* Malformed origins are refused before authentication. */ }
  if (!sameOrigin || request.headers.get("sec-fetch-site") === "cross-site" ||
    request.headers.get("content-type")?.split(";")[0] !== "application/json") return json({ error: "Request refused." }, 403);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || authorization.length > 8192) return json({ error: "Sign in again." }, 401);
  const founder = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } },
  });
  try {
    const { data: { user }, error } = await founder.auth.getUser(authorization.slice(7));
    if (error || !user || user.is_anonymous) return json({ error: "Sign in again." }, 401);
    const admin = await founder.rpc("am_i_admin");
    if (admin.error || admin.data !== true) return json({ error: "Founder access required." }, 403);
    let profileId: string | null;
    try { profileId = accountId((await readBoundedJson(request, 1024) as { profileId?: unknown } | null)?.profileId); }
    catch (error) { return json({ error: "Invalid request." }, error instanceof RequestBodyError ? error.status : 400); }
    if (!profileId) return json({ error: "Invalid profile reference." }, 400);

    const result = await founder.rpc("admin_delete_guest_account", { p_profile: profileId });
    if (result.error || !DELETION_VERDICTS.includes(result.data as DeletionVerdict)) throw new Error("delete_failed");
    const verdict = result.data as DeletionVerdict;
    if (verdict !== "deleted" && verdict !== "gone") return json({ error: DELETION_REFUSALS[verdict], reason: verdict }, 409);

    const service = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    try { await removePhotoFiles(service, profileId); }
    catch { return json({ error: "The account is deleted, but some photo files could not be removed. Press Delete again to finish." }, 502); }
    return json({ deleted: verdict === "deleted" ? "account" : "already_deleted" });
  } catch {
    // No raw Auth, Storage or database message in the response or the logs.
    return json({ error: "The deletion could not be confirmed. Try again: an account already deleted is reported as such." }, 502);
  }
}
