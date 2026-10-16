import { isRecord, isUuid, isValidEmail, normalizeEmail } from "@/lib/input-validation";
import { isLocale } from "@/lib/strings";
import { allowLaunchRequest, launchRpc, privateJson } from "@/lib/server/launch-service";
import { readBoundedJson, RequestBodyError } from "@/lib/server/request-body";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const rpc = launchRpc();
    if (!await allowLaunchRequest(request, rpc, true)) return privateJson({ error: "request_refused" }, 429);
    const body = await readBoundedJson(request, 2048);
    if (new URL(request.url).search || !isRecord(body) || Object.keys(body).length !== 3 || !isUuid(body.night) || !isValidEmail(body.email) || (typeof body.locale !== "string" || !isLocale(body.locale))) return privateJson({ error: "invalid_request" }, 400);
    await rpc("join_launch_waitlist", { p_night: body.night, p_email: normalizeEmail(body.email), p_locale: body.locale });
    return privateJson({ accepted: true });
  } catch (error) {
    if (error instanceof RequestBodyError) return privateJson({ error: "invalid_request" }, error.status);
    if ((error as { message?: string }).message === "waitlist unavailable") return privateJson({ error: "waitlist_unavailable" }, 409);
    return privateJson({ error: "waitlist_unavailable" }, 503);
  }
}
