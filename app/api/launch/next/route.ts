import { allowLaunchRequest, launchRpc, privateJson } from "@/lib/server/launch-service";

export const runtime = "nodejs";

// #603: the next night open for booking, for the landing page's button. The
// same public payload as GET /api/launch/checkout?night=..., or `null` when no
// night is open, in which case the page offers the waitlist.
export async function GET(request: Request) {
  if (new URL(request.url).searchParams.size !== 0) return privateJson({ error: "invalid_request" }, 400);
  try {
    const rpc = launchRpc();
    if (!await allowLaunchRequest(request, rpc, "availability")) return privateJson({ error: "request_refused" }, 429);
    return privateJson({ event: await rpc("launch_next_booking_event", {}) });
  } catch { return privateJson({ error: "event_unavailable" }, 503); }
}
