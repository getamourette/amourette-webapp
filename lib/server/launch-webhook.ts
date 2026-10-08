import type Stripe from "stripe";
import type { LaunchRpc } from "./launch-engine";
// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { handleLaunchEvent } from "./launch-engine.ts";
// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { readBoundedBody, RequestBodyError } from "./request-body.ts";

export async function receiveLaunchWebhook(request: Request, stripe: Stripe, rpc: LaunchRpc,
  account: () => Promise<string>, secret: string | undefined): Promise<Response> {
  const reply = (body: unknown, status: number) => Response.json(body, { status,
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  let event;
  try {
    const signature = request.headers.get("stripe-signature");
    if (!secret?.startsWith("whsec_") || !signature || signature.length > 4096) return reply({ error: "invalid_signature" }, 400);
    const bytes = await readBoundedBody(request, 256 * 1024);
    event = stripe.webhooks.constructEvent(Buffer.from(bytes), signature, secret, 300);
  } catch (error) { return reply({ error: "invalid_webhook" }, error instanceof RequestBodyError ? error.status : 400); }
  try {
    await handleLaunchEvent(rpc, stripe, await account(), event);
    return reply({ received: true }, 200);
  } catch { return reply({ error: "reconciliation_pending" }, 503); }
}
