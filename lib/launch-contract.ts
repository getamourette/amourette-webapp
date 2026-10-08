// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { isRecord, isUuid, isValidEmail, isValidText, normalizeEmail } from "./input-validation.ts";

export type BookingInput = {
  night: string; email: string; name: string; locale: "en" | "fr" | "es";
  policy: string; late_ack: boolean;
};
export function bookingInput(value: unknown): BookingInput {
  if (!isRecord(value) || !isUuid(value.night) || !isValidEmail(value.email) ||
    !isValidText(value.name, 30) || (typeof value.locale !== "string" || !["en", "fr", "es"].includes(value.locale)) ||
    typeof value.policy !== "string" || !/^[A-Za-z0-9._-]{1,80}$/.test(value.policy) ||
    typeof value.late_ack !== "boolean" ||
    Object.keys(value).some(k => !["night", "email", "name", "locale", "policy", "late_ack"].includes(k))) {
    throw new Error("invalid_booking");
  }
  return { night: value.night.toLowerCase(), email: normalizeEmail(value.email), name: value.name.trim(),
    locale: value.locale as BookingInput["locale"], policy: value.policy, late_ack: value.late_ack };
}

export type CheckoutAttempt = {
  id: string; email: string; locale: "en" | "fr" | "es"; amount_minor: number; currency: "eur" | "usd";
  hold_until: string; starts_at: string; ends_at: string; created_at: string;
  state: string; checkout_state: "pending" | "done" | "review_needed"; payment_state: string; checkout_id: string | null;
  account_id: string; origin: string; claim_id: string; claims: number;
  first_requested_at: string | null; cancelled: boolean;
};
export type RefundClaim = {
  id: string; reservation_id: string; operation_id: string; claim_id: string;
  amount_minor: number; currency: "eur" | "usd"; payment_id: string;
  provider_refund_id: string | null; reconcile_first: boolean; first_requested_at: string;
  account_id: string;
};
