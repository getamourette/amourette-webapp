import { isRecord } from "@/lib/input-validation";
import { getLaunchArrivalQr } from "@/lib/server/launch-arrival";
import { openCredential } from "@/lib/server/launch-secrets";
import { allowLaunchRequest, launchRpc, privateJson } from "@/lib/server/launch-service";
import { readBoundedJson, RequestBodyError } from "@/lib/server/request-body";

export const runtime = "nodejs";

// Read-only POST keeps bearer credentials out of URLs and intermediary caches.
export async function POST(request: Request) {
  try {
    const rpc = launchRpc();
    if (!await allowLaunchRequest(request, rpc, true)) return privateJson({ error: "request_refused" }, 429);
    const body = await readBoundedJson(request, 1024);
    if (new URL(request.url).search || !isRecord(body) || Object.keys(body).length !== 0) {
      return privateJson({ error: "invalid_request" }, 400);
    }
    const authorization = request.headers.get("authorization");
    let credential;
    try {
      if (!authorization?.startsWith("Bearer ")) throw new Error("invalid_access");
      credential = openCredential(authorization.slice(7), "access");
    } catch { return privateJson({ error: "invalid_access" }, 401); }
    return privateJson(await getLaunchArrivalQr(rpc, credential.id, credential.management));
  } catch (error) {
    if (error instanceof RequestBodyError) return privateJson({ error: "invalid_request" }, error.status);
    const message = (error as { message?: string }).message;
    if (message === "reservation access denied" || message === "reservation unavailable") {
      return privateJson({ error: "invalid_access" }, 401);
    }
    if (message === "arrival credential unavailable") return privateJson({ error: "arrival_unavailable" }, 409);
    return privateJson({ error: "arrival_unavailable" }, 503);
  }
}
