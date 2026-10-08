import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { CAMPAIGN_PREFERENCE_URL, parseCampaignCommand, type CampaignNight } from "@/lib/email-campaigns";
import { readBoundedJson, RequestBodyError } from "@/lib/server/request-body";
import { createServiceClient, emailDeliveryEnabled } from "@/lib/server/email-delivery";
import { renderUpcomingNightsEmail } from "@/emails/UpcomingNightsEmail";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });

async function founder(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  const client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return null;
  const { data: allowed, error: gateError } = await client.rpc("am_i_admin");
  return !gateError && allowed ? user.id : null;
}

function failure(message: string) {
  const known = ["nights_changed", "audience_changed", "empty_audience", "campaign_not_found", "preview_rate_limit"];
  return reply({ error: known.includes(message) ? message : "campaign_unavailable" }, message === "preview_rate_limit" ? 429 : known.includes(message) ? 409 : 503);
}

export async function GET(request: Request) {
  try {
    const actor = await founder(request);
    if (!actor) return reply({ error: "unauthorized" }, 401);
    const params = new URL(request.url).searchParams;
    const raw = params.get("offset") ?? "0";
    const offset = Number(raw);
    if ([...params.keys()].some(key => key !== "offset") || params.getAll("offset").length > 1 ||
        !/^\d{1,6}$/.test(raw) || offset > 100000 || offset % 20 !== 0) return reply({ error: "invalid_request" }, 400);
    const { data, error } = await createServiceClient().rpc("admin_email_campaign_dashboard", { p_actor: actor, p_offset: offset });
    if (error) return failure(error.message);
    return reply({ ...data as Record<string, Json>, sendingEnabled: emailDeliveryEnabled() });
  } catch { return failure("campaign_unavailable"); }
}

export async function POST(request: Request) {
  try {
    const actor = await founder(request);
    if (!actor) return reply({ error: "unauthorized" }, 401);
    const command = parseCampaignCommand(await readBoundedJson(request, 4096));
    if (!command) return reply({ error: "invalid_request" }, 400);
    const service = createServiceClient();
    // Preview origins share the database with production. Do not enqueue mail there.
    if ((command.action === "confirm" || command.action === "retry") && !emailDeliveryEnabled()) {
      return reply({ error: "sending_disabled" }, 409);
    }
    if (command.action === "preview") {
      const context = await service.rpc("admin_email_campaign_context", { p_actor: actor, p_night_ids: command.nightIds });
      if (context.error) return failure(context.error.message);
      const { nights } = context.data as { nights: CampaignNight[] };
      const [en, fr, es] = await Promise.all((["en", "fr", "es"] as const).map(locale =>
        renderUpcomingNightsEmail({ locale, nights, preferencesUrl: CAMPAIGN_PREFERENCE_URL })));
      const result = await service.rpc("admin_prepare_email_campaign", {
        p_actor: actor, p_night_ids: command.nightIds, p_nights: nights, p_messages: { en, fr, es },
      });
      return result.error ? failure(result.error.message) : reply(result.data);
    }
    if (command.action === "review") {
      const result = await service.rpc("admin_review_email_campaign", { p_actor: actor, p_campaign_id: command.campaignId });
      return result.error ? failure(result.error.message) : reply(result.data);
    }
    if (command.action === "confirm") {
      const result = await service.rpc("admin_confirm_email_campaign", {
        p_actor: actor, p_campaign_id: command.campaignId, p_expected_audience: command.audience,
      });
      return result.error ? failure(result.error.message) : reply(result.data);
    }
    const result = await service.rpc("admin_retry_email_campaign", { p_actor: actor, p_campaign_id: command.campaignId });
    return result.error ? failure(result.error.message) : reply({ retried: result.data });
  } catch (error) {
    if (error instanceof RequestBodyError) return reply({ error: "invalid_request" }, error.status);
    return failure("campaign_unavailable");
  }
}
