import { isRecord } from "@/lib/input-validation";
import { readBoundedJson, RequestBodyError } from "@/lib/server/request-body";
import { createServiceClient, deliverEmail, emailDeliveryEnabled } from "@/lib/server/email-delivery";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const expected = process.env.EMAIL_WORKER_SECRET;
  const supplied = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!expected || supplied !== expected) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!emailDeliveryEnabled()) return Response.json({ processed: 0, disabled: true });

  let limit = 25;
  try {
    const body = await readBoundedJson(request, 1024);
    if (isRecord(body) && typeof body.limit === "number" && Number.isFinite(body.limit)) limit = Math.min(Math.max(Math.trunc(body.limit), 1), 100);
  } catch (error) {
    if (error instanceof RequestBodyError && error.status === 413) return Response.json({ error: "invalid_request" }, { status: 413 });
    // Preserve the worker's default for absent or malformed operational options.
  }

  const service = createServiceClient();
  const { error: staleError } = await service.rpc("mark_stale_email_deliveries_unknown");
  if (staleError) return Response.json({ error: "recovery_failed" }, { status: 500 });
  const { data: ids, error } = await service.rpc("list_claimable_email_delivery_ids", { p_limit: limit });
  if (error) return Response.json({ error: "claim_failed" }, { status: 500 });
  const results = await Promise.allSettled((ids ?? []).map((id) => deliverEmail(id)));
  return Response.json({ processed: results.length });
}
