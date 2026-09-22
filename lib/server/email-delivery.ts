import "server-only";
import { createClient } from "@supabase/supabase-js";
import { renderWelcomeEmail } from "@/emails/WelcomeEmail";
import type { Database } from "@/lib/database.types";
import type { Locale } from "@/lib/strings";
import { createEmailPreferenceLinks } from "@/lib/server/email-links";
import { isRetryableResendStatus, retryAt } from "@/lib/email-transport-policy";
import { CAMPAIGN_PREFERENCE_URL, isCampaignMessage } from "@/lib/email-campaigns";

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

export async function deliverEmail(deliveryId: string): Promise<"sent" | "failed" | "unknown" | "disabled" | "skipped"> {
  if (!emailDeliveryEnabled()) return "disabled";
  const service = createServiceClient();
  const { data, error } = await service.rpc("claim_email_delivery", { p_delivery_id: deliveryId });
  if (error) throw error;
  if (!data) return "disabled";
  const delivery = data as {
    id: string; kind: string; recipient_email: string; locale: Locale; attempt_count: number; message?: unknown;
  };
  let requestStarted = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const links = await createEmailPreferenceLinks(service, delivery.recipient_email);
    const message = delivery.kind === "welcome"
      ? await renderWelcomeEmail({ locale: delivery.locale, preferencesUrl: links.preferencesUrl })
      : delivery.kind === "upcoming_nights" && isCampaignMessage(delivery.message)
        ? { subject: delivery.message.subject,
          html: delivery.message.html.replaceAll(CAMPAIGN_PREFERENCE_URL, links.preferencesUrl.replaceAll("&", "&amp;")),
          text: delivery.message.text.replaceAll(CAMPAIGN_PREFERENCE_URL, links.preferencesUrl) }
        : null;
    if (!message) throw new Error("Invalid email message");
    const { data: authorized, error: authorizationError } = await service.rpc("authorize_email_transport", { p_delivery_id: delivery.id });
    if (authorizationError) throw authorizationError;
    if (!authorized) return "skipped";
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 10_000);
    requestStarted = true;
    // Campaigns only retry definite refusals. Their attempt keys permit a fresh
    // unsubscribe token without conflicting with an earlier refused payload.
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": delivery.kind === "upcoming_nights" ? `${delivery.id}:${delivery.attempt_count}` : delivery.id },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "Amourette <hello@updates.getamourette.com>",
        to: [delivery.recipient_email], subject: message.subject, html: message.html, text: message.text,
        headers: links.headers,
      }),
    });
    clearTimeout(timeout);
    if (!response.ok) {
      // A server error, timeout or idempotency conflict may follow acceptance.
      // Campaigns never assume these prove non-delivery or retry with a new key.
      if (delivery.kind === "upcoming_nights" && (response.status < 400 || response.status >= 500 || response.status === 408 || response.status === 409)) {
        await service.from("email_deliveries").update({ status: "unknown", last_error_code: `resend_http_${response.status}`,
          next_attempt_at: "9999-12-31T00:00:00.000Z" }).eq("id", delivery.id).eq("status", "sending");
        return "unknown";
      }
      const retryable = isRetryableResendStatus(response.status);
      await service.from("email_deliveries").update({
        status: "failed", last_error_code: `resend_http_${response.status}`,
        next_attempt_at: retryable ? retryAt(delivery.attempt_count) : "9999-12-31T00:00:00.000Z",
      }).eq("id", delivery.id).eq("status", "sending");
      return "failed";
    }
    const result = await response.json() as { id?: string };
    if (!result.id) throw new Error("Resend response did not include an id");
    const { error: sentError } = await service.from("email_deliveries").update({ status: "sent", provider_message_id: result.id, sent_at: new Date().toISOString(), last_error_code: null }).eq("id", delivery.id).eq("status", "sending");
    if (sentError) throw sentError;
    return "sent";
  } catch {
    if (timeout) clearTimeout(timeout);
    const status = requestStarted ? "unknown" : "failed";
    await service.from("email_deliveries").update({
      status,
      last_error_code: requestStarted ? "transport_ambiguous" : "delivery_setup_error",
      next_attempt_at: requestStarted ? "9999-12-31T00:00:00.000Z" : retryAt(delivery.attempt_count),
    }).eq("id", delivery.id).eq("status", "sending");
    return status;
  }
}
