import { createServiceClient, deliverEmail, emailDeliveryEnabled } from "@/lib/server/email-delivery";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const expected = process.env.EMAIL_WORKER_SECRET;
  const supplied = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!expected || supplied !== expected) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!emailDeliveryEnabled()) return Response.json({ processed: 0, disabled: true });

  let limit = 25;
  try {
    const body = await request.json() as { limit?: unknown };
    if (typeof body.limit === "number") limit = Math.min(Math.max(Math.trunc(body.limit), 1), 100);
  } catch { /* default batch size */ }

  const service = createServiceClient();
  const { error: staleError } = await service.rpc("mark_stale_email_deliveries_unknown");
  if (staleError) return Response.json({ error: "recovery_failed" }, { status: 500 });
  const { data: ids, error } = await service.rpc("list_claimable_email_delivery_ids", { p_limit: limit });
  if (error) return Response.json({ error: "claim_failed" }, { status: 500 });
  const results = await Promise.allSettled((ids ?? []).map((id) => deliverEmail(id)));
  return Response.json({ processed: results.length });
}
