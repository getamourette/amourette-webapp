import "server-only";
import { randomBytes } from "node:crypto";
import { renderReservationAccessEmail } from "@/emails/ReservationAccessEmail";
import { isRecord, isUuid, isValidEmail, normalizeEmail } from "@/lib/input-validation";
import { isLocale } from "@/lib/strings";
import { isRetryableResendStatus } from "@/lib/email-transport-policy";
import { openAccessProof, sealAccessProof } from "./launch-secrets";
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
  if (!isRecord(job) || !isUuid(job.id) || !isUuid(job.claim) || !isValidEmail(job.recipient) || (typeof job.locale !== "string" || !isLocale(job.locale)) || job.origin !== launchOrigin()) throw new Error("invalid_mail_claim");
  const id = job.id, claim = job.claim;
  const finish = (state: string, provider: string | null = null) => rpc("finish_launch_access_mail", { p_id: id, p_claim: claim, p_state: state, p_provider: provider });
  try {
    const token = randomBytes(32).toString("hex");
    const bound = await rpc("bind_launch_access_mail", { p_id: id, p_claim: claim, p_token: token, p_envelope: sealAccessProof({ token }) });
    if (!isRecord(bound) || typeof bound.expires_at !== "string") throw new Error("invalid_mail_binding");
    const proof = openAccessProof(bound.token_envelope);
    const url = `${job.origin}/reservations/access#${id}.${proof.token}`;
    const message = await renderReservationAccessEmail(job.locale, url, bound.expires_at);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `launch-access/${id}` },
      body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL || "Amourette <hello@updates.getamourette.com>",
        reply_to: process.env.RESEND_REPLY_TO_EMAIL || "hello@getamourette.com", to: [job.recipient], ...message }),
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
