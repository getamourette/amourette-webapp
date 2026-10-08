import { bookingInput, type CheckoutAttempt } from "@/lib/launch-contract";
import { isRecord, isUuid } from "@/lib/input-validation";
import { openCredential, sealCredential } from "@/lib/server/launch-secrets";
import { processCheckout } from "@/lib/server/launch-engine";
import { verifySession } from "@/lib/server/launch-provider";
import { allowLaunchRequest, launchOrigin, launchProvider, launchRpc, privateJson } from "@/lib/server/launch-service";
import { readBoundedJson, RequestBodyError } from "@/lib/server/request-body";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.size !== 1 || !isUuid(params.get("night"))) return privateJson({ error: "invalid_request" }, 400);
  try {
    const rpc = launchRpc();
    if (!await allowLaunchRequest(request, rpc, false)) return privateJson({ error: "request_refused" }, 429);
    return privateJson(await rpc("launch_event_availability", { p_night: params.get("night")! }));
  } catch { return privateJson({ error: "event_unavailable" }, 503); }
}

export async function POST(request: Request) {
  const rpc = launchRpc();
  try {
    if (!await allowLaunchRequest(request, rpc, true)) return privateJson({ error: "request_refused" }, 429);
    const body = await readBoundedJson(request, 4096);
    if (!isRecord(body) || typeof body.action !== "string" || !["create", "resume", "status"].includes(body.action) ||
      Object.keys(body).some(k => !["action", "booking"].includes(k)) || (body.action !== "create" && "booking" in body)) {
      return privateJson({ error: "invalid_request" }, 400);
    }
    let credential;
    try { credential = openCredential(request.headers.get("authorization")?.replace(/^Bearer /, ""), "access"); }
    catch { return privateJson({ error: "invalid_access" }, 401); }
    let input;
    if (body.action === "create") {
      try { input = bookingInput(body.booking); }
      catch { return privateJson({ error: "invalid_booking" }, 400); }
    }
    if (body.action === "status") {
      return privateJson(await rpc("get_launch_reservation", { p_id: credential.id, p_secret: credential.management }));
    }
    const { stripe, account } = await launchProvider();
    if (input) {
      const result = await rpc("prepare_launch_checkout", { p_id: credential.id, p_night: input.night,
        p_email: input.email, p_name: input.name, p_locale: input.locale, p_policy: input.policy, p_late_ack: input.late_ack,
        p_management_secret: credential.management, p_arrival_secret: credential.arrival,
        p_envelope: sealCredential(credential, "delivery"), p_account: account, p_origin: launchOrigin() });
      if (isRecord(result) && result.access_required) return privateJson({ error: "reservation_unavailable", recovery: "email_delivery_required" }, 409);
    }
    // Email, request UUID and Stripe return parameters never substitute for this.
    await rpc("get_launch_reservation", { p_id: credential.id, p_secret: credential.management });
    await processCheckout(rpc, stripe, account, credential.id);
    const status = await rpc("get_launch_reservation", { p_id: credential.id, p_secret: credential.management });
    const a = await rpc("inspect_launch_checkout", { p_id: credential.id }) as CheckoutAttempt | null;
    let checkoutUrl: string | null = null;
    if (a?.checkout_id && a.account_id === account && a.state === "holding" && !a.cancelled && Date.now() < Date.parse(a.hold_until)) {
      const session = await stripe.checkout.sessions.retrieve(a.checkout_id);
      verifySession(a, session);
      if (session.status === "open" && session.url && new URL(session.url).origin === "https://checkout.stripe.com") checkoutUrl = session.url;
    }
    return privateJson({ reservation: status, checkout_url: checkoutUrl, checkout_state: a?.checkout_state ?? "review_needed" });
  } catch (error) {
    if (error instanceof RequestBodyError) return privateJson({ error: "invalid_request" }, error.status);
    const message = (error as { message?: string }).message;
    if (message === "registration closed" || message === "event full") return privateJson({ error: "reservation_unavailable" }, 409);
    if (message === "reservation access denied") return privateJson({ error: "invalid_access" }, 401);
    if (["reservation policy acceptance required", "late cancellation acknowledgement required", "reservation identifier reused"].includes(message ?? "")) {
      return privateJson({ error: "booking_refused" }, 409);
    }
    return privateJson({ error: "checkout_pending", retry: "resume_with_same_access" }, 503);
  }
}
