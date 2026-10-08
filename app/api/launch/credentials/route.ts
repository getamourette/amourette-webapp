import { issueCredential } from "@/lib/server/launch-secrets";
import { allowLaunchRequest, launchRpc, privateJson } from "@/lib/server/launch-service";
import { readBoundedJson, RequestBodyError } from "@/lib/server/request-body";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (!await allowLaunchRequest(request, launchRpc(), true)) return privateJson({ error: "request_refused" }, 429);
    const body = await readBoundedJson(request, 1024);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) return privateJson({ error: "invalid_request" }, 400);
    // #184 retains this opaque capability before submitting a booking, so a lost
    // Checkout response can be resumed without email-based authorization.
    return privateJson(issueCredential());
  } catch (error) { return privateJson({ error: "credentials_unavailable" }, error instanceof RequestBodyError ? error.status : 503); }
}
