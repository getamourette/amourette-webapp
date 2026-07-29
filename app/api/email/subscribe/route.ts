import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { EMAIL_CONSENT_VERSIONS, EMAIL_SUBSCRIPTION_SOURCES, isValidEmail, normalizeEmail } from "@/lib/email-subscriptions";
import type { Locale } from "@/lib/strings";
import { createServiceClient, deliverEmail } from "@/lib/server/email-delivery";

type SubscribeResult = { already_subscribed?: boolean; email?: string; delivery_id?: string };
export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return Response.json({ error: "unauthorized" }, { status: 401 });

  let input: { email?: unknown; locale?: unknown; source?: unknown };
  try { input = await request.json() as typeof input; }
  catch { return Response.json({ error: "invalid_request" }, { status: 400 }); }

  const email = typeof input.email === "string" ? normalizeEmail(input.email) : "";
  const locale = input.locale;
  const source = input.source;
  if (!isValidEmail(email) || !["en", "fr", "es"].includes(locale as string) ||
      !EMAIL_SUBSCRIPTION_SOURCES.includes(source as never)) {
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
    p_email: email, p_locale: locale as Locale, p_source: source as string,
    p_consent_version: EMAIL_CONSENT_VERSIONS[source as keyof typeof EMAIL_CONSENT_VERSIONS],
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
