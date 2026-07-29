import "server-only";
import { createClient } from "@supabase/supabase-js";
import { renderWelcomeEmail } from "@/emails/WelcomeEmail";
import type { Database } from "@/lib/database.types";
import type { Locale } from "@/lib/strings";
import { createEmailPreferenceLinks } from "@/lib/server/email-links";
import { isRetryableResendStatus, retryAt } from "@/lib/email-transport-policy";

export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

export function emailDeliveryEnabled() {
  return process.env.EMAIL_DELIVERY_ENABLED === "true" &&
    process.env.VERCEL_ENV === "production" && Boolean(process.env.RESEND_API_KEY);
}

export async function deliverEmail(deliveryId: string): Promise<"sent" | "failed" | "unknown" | "disabled"> {
  if (!emailDeliveryEnabled()) return "disabled";
  const service = createServiceClient();
  const { data: delivery, error } = await service.from("email_deliveries")
    .select("id,kind,recipient_email,locale,status,attempt_count")
    .eq("id", deliveryId).single();
  if (error) throw error;
  if (!delivery || !["queued", "failed"].includes(delivery.status)) return "disabled";

  const { data: suppression } = await service.from("email_suppressions")
    .select("email").eq("email", delivery.recipient_email).maybeSingle();
  if (suppression) {
    await service.from("email_deliveries").update({ status: "suppressed", last_error_code: "suppressed_before_send" }).eq("id", delivery.id);
    return "failed";
  }

  await service.from("email_deliveries").update({ status: "sending", attempt_count: delivery.attempt_count + 1 }).eq("id", delivery.id);
  const links = await createEmailPreferenceLinks(service, delivery.recipient_email);
  if (delivery.kind !== "welcome") throw new Error(`Unsupported email kind: ${delivery.kind}`);
  const message = renderWelcomeEmail({ locale: delivery.locale as Locale, preferencesUrl: links.preferencesUrl });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": delivery.id },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "Amourette <hello@updates.getamourette.com>",
        to: [delivery.recipient_email], subject: message.subject, html: message.html, text: message.text,
        headers: links.headers,
      }),
    });
    clearTimeout(timeout);
    if (!response.ok) {
      const retryable = isRetryableResendStatus(response.status);
      await service.from("email_deliveries").update({
        status: "failed", last_error_code: `resend_http_${response.status}`,
        next_attempt_at: retryable ? retryAt(delivery.attempt_count) : "9999-12-31T00:00:00.000Z",
      }).eq("id", delivery.id);
      if (retryable && delivery.attempt_count < 2) return deliverEmail(delivery.id);
      return "failed";
    }
    const result = await response.json() as { id?: string };
    if (!result.id) throw new Error("Resend response did not include an id");
    await service.from("email_deliveries").update({ status: "sent", provider_message_id: result.id, sent_at: new Date().toISOString(), last_error_code: null }).eq("id", delivery.id);
    return "sent";
  } catch (error) {
    clearTimeout(timeout);
    // Once a request has left our process, a timeout/network failure is
    // ambiguous. Retrying could duplicate mail, so it requires verification.
    await service.from("email_deliveries").update({ status: "unknown", last_error_code: error instanceof Error ? error.name : "network_error" }).eq("id", delivery.id);
    return "unknown";
  }
}
