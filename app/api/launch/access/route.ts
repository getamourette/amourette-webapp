import { isRecord, isUuid, isValidEmail, normalizeEmail } from "@/lib/input-validation";
import { readBoundedJson, RequestBodyError } from "@/lib/server/request-body";
import { allowLaunchRequest, launchOrigin, launchRpc, privateJson } from "@/lib/server/launch-service";
import { exchangeAccess } from "@/lib/server/launch-access";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const rpc = launchRpc();
    if (!await allowLaunchRequest(request, rpc, true)) return privateJson({ error: "request_refused" }, 429);
    const body = await readBoundedJson(request, 2048);
    if (new URL(request.url).search || !isRecord(body)) return privateJson({ error: "invalid_request" }, 400);
    if (body.action === "request" && Object.keys(body).length === 3 && isUuid(body.night) && isValidEmail(body.email)) {
      await rpc("request_launch_access", { p_night: body.night, p_email: normalizeEmail(body.email), p_origin: launchOrigin() });
      return privateJson({ accepted: true }, 202);
    }
    if (body.action === "exchange" && Object.keys(body).length === 3 && isUuid(body.id) && typeof body.token === "string" && /^[a-f0-9]{64}$/.test(body.token)) {
      return privateJson(await exchangeAccess(rpc, body.id, body.token));
    }
    return privateJson({ error: "invalid_request" }, 400);
  } catch (error) {
    if (error instanceof RequestBodyError) return privateJson({ error: "invalid_request" }, error.status);
    if ((error as { message?: string }).message === "reservation access denied") return privateJson({ error: "invalid_access" }, 401);
    return privateJson({ error: "access_unavailable" }, 503);
  }
}
