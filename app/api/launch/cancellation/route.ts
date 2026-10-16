import { cancellationInput } from "@/lib/launch-cancellation";
import { openCredential } from "@/lib/server/launch-secrets";
import { allowLaunchRequest, launchRpc, privateJson } from "@/lib/server/launch-service";
import { readBoundedJson, RequestBodyError } from "@/lib/server/request-body";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = await readBoundedJson(request, 1024);
    let input;
    try { input = cancellationInput(body); if (new URL(request.url).search) throw new Error(); }
    catch { return privateJson({ error: "invalid_request" }, 400); }
    const rpc = launchRpc();
    if (!await allowLaunchRequest(request, rpc, true, !input.p_confirm)) return privateJson({ error: "request_refused" }, 429);
    let credential;
    try {
      const header = request.headers.get("authorization");
      if (!header?.startsWith("Bearer ")) throw new Error();
      credential = openCredential(header.slice(7), "access");
    } catch { return privateJson({ error: "invalid_access" }, 401); }
    return privateJson(await rpc("manage_launch_cancellation", { p_id: credential.id, p_secret: credential.management, ...input }));
  } catch (error) {
    if (error instanceof RequestBodyError) return privateJson({ error: "invalid_request" }, error.status);
    const message = (error as { message?: string }).message;
    if (["reservation access denied", "reservation unavailable"].includes(message ?? "")) return privateJson({ error: "invalid_access" }, 401);
    if (message === "reservation can no longer be cancelled") return privateJson({ error: "cancellation_unavailable" }, 409);
    return privateJson({ error: "cancellation_unknown" }, 503);
  }
}
