// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { isRecord, isUuid, isValidEmail, isValidText } from "./input-validation.ts";
import type { Locale } from "./strings";

export const launchMailKinds = ["confirmed_access", "recovery", "participant_cancelled", "event_cancelled", "event_postponed", "refund_succeeded", "corrected_summary"] as const;
export type LaunchMailKind = typeof launchMailKinds[number];
export function isLaunchMailKind(value: unknown): value is LaunchMailKind {
  return typeof value === "string" && launchMailKinds.some(kind => kind === value);
}
export type LaunchMailContext = {
  reservation_id: string; night_id: string; kind: LaunchMailKind; recipient: string; locale: Locale; origin: string;
  version: string; payload_envelope: string | null; venue_name: string; city: string | null; address: string | null; timezone: string;
  starts_at: string; ends_at: string; cancellation_deadline: string; before_deadline: boolean;
  state: "holding" | "confirmed" | "cancelled" | "expired"; cancellation_refundable: boolean | null;
  event_reason: "cancelled" | "postponed" | null; amount_minor: number; currency: "eur" | "usd";
  refund_state: "queued" | "pending" | "succeeded" | "failed" | "review_needed" | null;
  refund_eligible: boolean; qr_eligible: boolean;
};
export function parseLaunchMailContext(value: unknown): LaunchMailContext {
  if (!isRecord(value) || typeof value.version !== "string" || !/^[a-f0-9]{64}$/.test(value.version) || !isUuid(value.reservation_id) || !isUuid(value.night_id) || !isLaunchMailKind(value.kind) ||
    !isValidEmail(value.recipient) || (typeof value.locale !== "string" || !["en", "fr", "es"].includes(value.locale)) ||
    typeof value.origin !== "string" || value.origin.length > 255 || !/^https?:\/\/[A-Za-z0-9.:-]+$/.test(value.origin) ||
    !(value.payload_envelope === null || (typeof value.payload_envelope === "string" && value.payload_envelope.length <= 262144 && /^v1\.[A-Za-z0-9_-]{100,}$/.test(value.payload_envelope))) ||
    !isValidText(value.venue_name, 120) || !(value.city === null || isValidText(value.city, 120)) ||
    !(value.address === null || isValidText(value.address, 300)) || typeof value.timezone !== "string" ||
    ![value.starts_at, value.ends_at, value.cancellation_deadline].every(v => typeof v === "string" && Number.isFinite(Date.parse(v))) ||
    typeof value.before_deadline !== "boolean" || (typeof value.state !== "string" || !["holding", "confirmed", "cancelled", "expired"].includes(value.state)) ||
    !(value.cancellation_refundable === null || typeof value.cancellation_refundable === "boolean") ||
    ![null, "cancelled", "postponed"].includes(value.event_reason as string | null) ||
    typeof value.amount_minor !== "number" || !Number.isInteger(value.amount_minor) || value.amount_minor < 1 || value.amount_minor > 99999999 ||
    (typeof value.currency !== "string" || !["eur", "usd"].includes(value.currency)) || ![null, "queued", "pending", "succeeded", "failed", "review_needed"].includes(value.refund_state as string | null) ||
    typeof value.refund_eligible !== "boolean" || typeof value.qr_eligible !== "boolean") throw new Error("invalid_mail_context");
  try { new Intl.DateTimeFormat("en", { timeZone: value.timezone }).format(); } catch { throw new Error("invalid_mail_context"); }
  return value as LaunchMailContext;
}
