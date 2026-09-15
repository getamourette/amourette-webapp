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
  const { data, error } = await service.rpc("claim_email_delivery", { p_delivery_id: deliveryId });
  if (error) throw error;
  if (!data) return "disabled";
  const delivery = data as {
    id: string; kind: string; recipient_email: string; locale: Locale; attempt_count: number;
  };
  let requestStarted = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const links = await createEmailPreferenceLinks(service, delivery.recipient_email);
    if (delivery.kind !== "welcome") throw new Error(`Unsupported email kind: ${delivery.kind}`);
    const message = await renderWelcomeEmail({ locale: delivery.locale, preferencesUrl: links.preferencesUrl });
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 10_000);
    requestStarted = true;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": delivery.id },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "Amourette <hello@updates.getamourette.com>",
        reply_to: process.env.RESEND_REPLY_TO_EMAIL || "hello@getamourette.com",
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
      return "failed";
    }
    const result = await response.json() as { id?: string };
    if (!result.id) throw new Error("Resend response did not include an id");
    const { error: sentError } = await service.from("email_deliveries").update({ status: "sent", provider_message_id: result.id, sent_at: new Date().toISOString(), last_error_code: null }).eq("id", delivery.id);
    if (sentError) throw sentError;
    return "sent";
  } catch (error) {
    if (timeout) clearTimeout(timeout);
    const status = requestStarted ? "unknown" : "failed";
    await service.from("email_deliveries").update({
      status,
      last_error_code: error instanceof Error ? error.name : "delivery_setup_error",
      next_attempt_at: requestStarted ? "9999-12-31T00:00:00.000Z" : retryAt(delivery.attempt_count),
    }).eq("id", delivery.id);
    return status;
  }
}
