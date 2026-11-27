import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { isRecord } from "@/lib/input-validation";
import { parseSurveyFragment, parseSurveyInput } from "@/lib/launch-survey";
import { deliverEmail } from "@/lib/server/email-delivery";
import { allowLaunchRequest, launchRpc, privateJson } from "@/lib/server/launch-service";
import { readBoundedJson, RequestBodyError } from "@/lib/server/request-body";
export const runtime = "nodejs";

// #559: the next-day survey page reads its link and submits one answer here.
// The link and token come from the email's URL fragment; the database checks
// them. Only the next-night opt-in needs the browser's own Supabase session,
// whose user id is verified here, never taken from the body.
export async function POST(request: Request) {
  try {
    const body = await readBoundedJson(request, 1024);
    if (new URL(request.url).search || !isRecord(body) || !["read", "submit"].includes(body.action as string)) return privateJson({ error: "invalid_request" }, 400);
    const rpc = launchRpc();
    if (!await allowLaunchRequest(request, rpc, "survey")) return privateJson({ error: "request_refused" }, 429);
    if (body.action === "read") {
      const link = parseSurveyFragment(`${body.link}.${body.token}`);
      if (!link || Object.keys(body).length !== 3) return privateJson({ error: "invalid_request" }, 400);
      return privateJson(await rpc("read_launch_survey", { p_link: link.link, p_token: link.token }));
    }
    let input;
    try { const { action: _action, ...rest } = body; void _action; input = parseSurveyInput(rest); }
    catch { return privateJson({ error: "invalid_request" }, 400); }
    let user: string | null = null;
    if (input.next_night) {
      const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
      const auth = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } });
      const { data } = token ? await auth.auth.getUser(token) : { data: { user: null } };
      if (!data.user) return privateJson({ error: "unauthorized" }, 401);
      user = data.user.id;
    }
    const result = await rpc("submit_launch_survey", { p_link: input.link, p_token: input.token, p_matched: input.answers.matched,
      p_talked: input.answers.talked, p_at_ease: input.answers.at_ease, p_heard: input.answers.heard, p_next_night: input.next_night, p_user: user });
    if (!isRecord(result) || !["recorded", "answered", "expired", "invalid"].includes(result.status as string)) throw new Error("invalid_survey_result");
    // The consent is committed; the durable email worker owns delivery if this fails.
    if (typeof result.delivery_id === "string") { try { await deliverEmail(result.delivery_id); } catch { /* retried by the outbox */ } }
    return privateJson({ status: result.status });
  } catch (error) {
    if (error instanceof RequestBodyError) return privateJson({ error: "invalid_request" }, error.status);
    return privateJson({ error: "survey_unavailable" }, 503);
  }
}
