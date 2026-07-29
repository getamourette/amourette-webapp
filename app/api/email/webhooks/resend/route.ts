import { createServiceClient } from "@/lib/server/email-delivery";
import { verifySvixSignature } from "@/lib/resend-webhook";

type ResendEvent = {
  type?: string;
  created_at?: string;
  data?: { email_id?: string; to?: string[]; bounce?: { type?: string } };
};
export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await request.text();
  const eventId = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!eventId || !timestamp || !signature || !secret || !verifySvixSignature(payload, eventId, timestamp, signature, secret)) {
    return Response.json({ error: "invalid_signature" }, { status: 400 });
  }

  let event: ResendEvent;
  try { event = JSON.parse(payload) as ResendEvent; }
  catch { return Response.json({ error: "invalid_payload" }, { status: 400 }); }
  if (!event.type || !event.created_at || !event.data?.email_id) return Response.json({ error: "invalid_payload" }, { status: 400 });

  const eventType = event.type === "email.bounced" && event.data.bounce?.type === "transient"
    ? "email.soft_bounced" : event.type;
  const { error } = await createServiceClient().rpc("record_resend_email_event", {
    p_event_id: eventId, p_event_type: eventType, p_event_created_at: event.created_at,
    p_provider_message_id: event.data.email_id, p_recipient_email: event.data.to?.[0] ?? null,
  });
  if (error) return Response.json({ error: "storage_failed" }, { status: 500 });
  return Response.json({ received: true });
}
