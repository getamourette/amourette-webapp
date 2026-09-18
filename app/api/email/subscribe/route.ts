import { isRecord } from "@/lib/input-validation";
import { readBoundedJson, RequestBodyError } from "@/lib/server/request-body";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { EMAIL_CONSENT_VERSIONS, isEmailSubscriptionSource, isValidEmail, normalizeEmail } from "@/lib/email-subscriptions";
import { isLocale } from "@/lib/strings";
import { createServiceClient, deliverEmail } from "@/lib/server/email-delivery";

type SubscribeResult = { already_subscribed?: boolean; email?: string; delivery_id?: string };
export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });

  let input: unknown;
  try { input = await readBoundedJson(request); }
  catch (error) { return Response.json({ error: "invalid_request" }, { status: error instanceof RequestBodyError ? error.status : 400 }); }
  if (!isRecord(input)) return Response.json({ error: "invalid_request" }, { status: 400 });

  const email = typeof input.email === "string" ? normalizeEmail(input.email) : "";
  const locale = input.locale;
  const source = input.source;
  if (!isValidEmail(input.email) || typeof locale !== "string" || !isLocale(locale) || !isEmailSubscriptionSource(source)) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }

  const authClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await createServiceClient().rpc("subscribe_to_marketing_email", {
    p_user_id: user.id,
    p_email: email, p_locale: locale, p_source: source,
    p_consent_version: EMAIL_CONSENT_VERSIONS[source],
  });
  if (error) return Response.json({ error: "subscription_failed" }, { status: 500 });
  const result = data as SubscribeResult;

  // Consent is already committed. Transport failures intentionally do not turn
  // this response into a failed subscription or expose delivery details.
  if (result.delivery_id) {
    try { await deliverEmail(result.delivery_id); } catch { /* the durable worker owns recovery */ }
  }
  return Response.json({ alreadySubscribed: result.already_subscribed === true, email: result.email });
}
