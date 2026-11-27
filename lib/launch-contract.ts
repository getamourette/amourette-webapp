// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { isRecord, isUuid, isValidEmail, isValidText, normalizeEmail } from "./input-validation.ts";
// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { isGender, type Gender } from "./profile.ts";

// Where the reservation link was posted (#561), read from the `via` URL parameter.
// A closed set: anything else is recorded as absent, never refused.
export const BOOKING_CHANNELS = ["street", "instagram", "venue_flyer", "venue_story"] as const;
export type BookingChannel = typeof BOOKING_CHANNELS[number];
export function bookingChannel(value: unknown): BookingChannel | null {
  return typeof value === "string" && (BOOKING_CHANNELS as readonly string[]).includes(value) ? value as BookingChannel : null;
}
export type BookingInput = {
  night: string; email: string; name: string; locale: "en" | "fr" | "es";
  policy: string; late_ack: boolean;
  // Same vocabulary as the in-venue profile; only used for founder balance totals (#354).
  gender: Gender;
  // Present only for a known channel; attribution never decides whether a booking is accepted.
  channel?: BookingChannel;
};
export function bookingInput(value: unknown): BookingInput {
  if (!isRecord(value) || !isUuid(value.night) || !isValidEmail(value.email) ||
    !isValidText(value.name, 30) || (typeof value.locale !== "string" || !["en", "fr", "es"].includes(value.locale)) ||
    typeof value.policy !== "string" || !/^[A-Za-z0-9._-]{1,80}$/.test(value.policy) ||
    typeof value.late_ack !== "boolean" || !isGender(value.gender) ||
    Object.keys(value).some(k => !["night", "email", "name", "locale", "policy", "late_ack", "gender", "channel"].includes(k))) {
    throw new Error("invalid_booking");
  }
  const channel = bookingChannel(value.channel);
  return { night: value.night.toLowerCase(), email: normalizeEmail(value.email), name: value.name.trim(),
    locale: value.locale as BookingInput["locale"], policy: value.policy, late_ack: value.late_ack, gender: value.gender,
    ...(channel ? { channel } : {}) };
}

// One IPv6 subscriber controls a whole /64, so address budgets key on that prefix.
// IPv4 and anything unrecognized are kept as given.
export function launchAddressKey(address: string): string {
  const value = address.trim().toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (mapped) return mapped[1];
  if (!value.includes(":") || !/^[0-9a-f:]+$/.test(value)) return value;
  const [head, tail, extra] = value.split("::");
  const left = head ? head.split(":") : [], right = tail ? tail.split(":") : [];
  if (extra !== undefined || left.length + right.length > (tail === undefined ? 8 : 7)) return value;
  const groups = tail === undefined ? left : [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right];
  if (groups.length !== 8 || groups.some(g => !/^[0-9a-f]{1,4}$/.test(g))) return value;
  return `${groups.slice(0, 4).map(g => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

export type CheckoutAttempt = {
  id: string; email: string; locale: "en" | "fr" | "es"; amount_minor: number; currency: "eur" | "usd";
  hold_until: string; starts_at: string; ends_at: string; created_at: string;
  state: string; checkout_state: "pending" | "done" | "review_needed"; payment_state: string; checkout_id: string | null;
  account_id: string; origin: string; claim_id: string; claims: number;
  first_requested_at: string | null; cancelled: boolean; expire_requested?: boolean;
};
export type RefundClaim = {
  id: string; reservation_id: string; operation_id: string; claim_id: string;
  amount_minor: number; currency: "eur" | "usd"; payment_id: string;
  provider_source?: "integration" | "external";
  provider_refund_id: string | null; reconcile_first: boolean; first_requested_at: string;
  account_id: string;
};
