import { launchRpc, privateJson } from "@/lib/server/launch-service";
import { createLaunchStripe } from "@/lib/server/launch-provider";
import { receiveLaunchWebhook } from "@/lib/server/launch-webhook";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const stripe = createLaunchStripe();
    return await receiveLaunchWebhook(request, stripe, launchRpc(),
      async () => (await stripe.accounts.retrieve(null)).id, process.env.STRIPE_WEBHOOK_SECRET);
  } catch { return privateJson({ error: "reconciliation_pending" }, 503); }
}
