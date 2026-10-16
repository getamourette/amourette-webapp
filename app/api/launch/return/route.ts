import { isUuid } from "@/lib/input-validation";
import { launchOrigin } from "@/lib/server/launch-service";

// A browser return selects a screen, never authorizes access or confirms payment.
export function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("reservation");
  const path = isUuid(id) ? `/reservations/${id.toLowerCase()}` : "/reservations/access";
  return new Response(null, { status: 303, headers: { Location: `${launchOrigin()}${path}`,
    "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
