import "server-only";
import { randomBytes } from "node:crypto";
import { renderReservationAccessEmail } from "@/emails/ReservationAccessEmail";
import { renderReservationLifecycleEmail } from "@/emails/ReservationLifecycleEmail";
import { isLaunchMailKind, parseLaunchMailContext } from "@/lib/launch-mail";
import { getLaunchArrivalEmailAsset } from "./launch-arrival";
import { isRecord, isUuid, isValidEmail, normalizeEmail } from "@/lib/input-validation";
import { isLocale } from "@/lib/strings";
import { isRetryableResendStatus } from "@/lib/email-transport-policy";
import { openAccessProof, sealAccessProof, openMailPayload, sealMailPayload } from "./launch-secrets";
import type { LaunchRpc } from "./launch-engine";
import { launchOrigin } from "./launch-service";

export function launchEmailRecipients(): string[] | null | false {
  if (process.env.LAUNCH_EMAIL_ENABLED !== "true" || !process.env.RESEND_API_KEY) return false;
  // Account/domain click and open tracking must be disabled for credential mail.
  if (process.env.LAUNCH_EMAIL_TRACKING_DISABLED !== "true") return false;
  if (process.env.VERCEL_ENV === "production") return null;
  const recipients = (process.env.LAUNCH_EMAIL_TEST_RECIPIENTS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  return recipients.length > 0 && recipients.length <= 10 && recipients.every(isValidEmail) ? recipients.map(normalizeEmail) : false;
}

export async function processAccessEmail(rpc: LaunchRpc): Promise<boolean> {
  const recipients = launchEmailRecipients();
  if (recipients === false) return false;
  const job = await rpc("claim_launch_access_mail", { p_origin: launchOrigin(), p_recipients: recipients });
  if (job === null) return false;
  if (!isRecord(job) || !isUuid(job.id) || !isUuid(job.reservation_id) || !isUuid(job.claim) || !isLaunchMailKind(job.kind) || !isValidEmail(job.recipient) || (typeof job.locale !== "string" || !isLocale(job.locale)) || job.origin !== launchOrigin()) throw new Error("invalid_mail_claim");
  const id = job.id, claim = job.claim;
  const finish = (state: string, provider: string | null = null) => rpc("finish_launch_access_mail", { p_id: id, p_claim: claim, p_state: state, p_provider: provider });
  try {
    const value = await rpc("read_launch_mail_context", { p_id: id, p_claim: claim });
    if (value === null) return true;
    const context = parseLaunchMailContext(value);
    if (context.reservation_id !== job.reservation_id || context.kind !== job.kind || context.recipient !== job.recipient ||
      context.locale !== job.locale || context.origin !== job.origin) throw new Error("invalid_mail_context");
    let envelope = context.payload_envelope;
    if (envelope === null) {
      const access = ["confirmed_access", "recovery", "corrected_summary"].includes(job.kind);
      let url = `${job.origin}/events/${context.night_id}`, expires: string | null = null;
      if (access) {
        const token = randomBytes(32).toString("hex");
        const bound = await rpc("bind_launch_access_mail", { p_id: id, p_claim: claim, p_token: token, p_envelope: sealAccessProof({ token }) });
        if (!isRecord(bound) || typeof bound.expires_at !== "string" || !Number.isFinite(Date.parse(bound.expires_at))) throw new Error("invalid_mail_binding");
        const proof = openAccessProof(bound.token_envelope);
        url = `${job.origin}/reservations/access#${id}.${proof.token}`;
        expires = bound.expires_at;
      }
      const qr = (job.kind === "confirmed_access" || job.kind === "corrected_summary") && context.qr_eligible;
      const asset = qr ? await getLaunchArrivalEmailAsset(rpc, context.reservation_id) : null;
      if (asset && (asset.recipient !== job.recipient || asset.locale !== job.locale || asset.night_id !== context.night_id)) throw new Error("invalid_qr_recipient");
      const message = job.kind === "recovery" && expires
        ? await renderReservationAccessEmail(job.locale, url, expires)
        : await renderReservationLifecycleEmail(context, url, expires, qr);
      const body = JSON.stringify({ from: process.env.RESEND_FROM_EMAIL || "Amourette <hello@updates.getamourette.com>",
        reply_to: process.env.RESEND_REPLY_TO_EMAIL || "hello@getamourette.com", to: [job.recipient], ...message,
        ...(asset ? { attachments: [{ filename: asset.filename, content: asset.content.toString("base64"), content_type: asset.contentType, content_id: "reservation-qr" }] } : {}),
      });
      envelope = await rpc("bind_launch_mail_payload", { p_id: id, p_claim: claim, p_envelope: sealMailPayload(body), p_version: context.version });
    }
    const body = openMailPayload(envelope);
    // Check recipient, suppression, credential and authoritative lifecycle again
    // after rendering. A state change during an external request remains possible.
    if (await rpc("read_launch_mail_context", { p_id: id, p_claim: claim }) === null) return true;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `launch-access/${id}` },
      body,
    });
    if (!response.ok) {
      await finish(isRetryableResendStatus(response.status) || response.status === 409 ? "failed" : "unknown");
      return true;
    }
    const result: unknown = await response.json();
    if (!isRecord(result) || typeof result.id !== "string" || !/^[A-Za-z0-9_-]{1,255}$/.test(result.id)) throw new Error("invalid_mail_response");
    await finish("sent", result.id);
  } catch {
    // Same idempotency key and immutable bound link on every retry; the database
    // stops uncertain operations before the provider's 24-hour replay horizon.
    await finish("failed");
  }
  return true;
}

export async function processAccessEmails(rpc: LaunchRpc, limit: number): Promise<number> {
  let attempted = 0;
  const deadline = Date.now() + 35000;
  while (attempted < limit && Date.now() < deadline) {
    if (!await processAccessEmail(rpc)) break;
    attempted++;
    // Keep operational mail below two send requests per second.
    if (attempted < limit) await new Promise(resolve => setTimeout(resolve, 600));
  }
  return attempted;
}
