// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { isRecord, isUuid, isValidEmail } from "./input-validation.ts";
import type { BookingInput } from "./launch-contract";
import type { Locale } from "./strings";

export const RESERVATION_POLICY_VERSION = "launch-v1";
// The public event carries no venue identifier: with it, anyone holding the event
// link could check in from home (#472). The guest page never needs it.
export type BookingEvent = {
  night_id: string; venue_name: string; city: string | null; address: string | null; timezone: string;
  now: string; opens_at: string; closes_at: string; starts_at: string; ends_at: string; cancellation_deadline: string;
  amount_minor: number; currency: "eur" | "usd"; policy_version: string; available: number;
  status: "not_open" | "open" | "closed" | "cancelled" | "ended"; walk_ins_possible: boolean; registration_open: boolean;
};
export type Reservation = {
  id: string; night_id: string; email: string; first_name: string; locale: Locale;
  state: "holding" | "confirmed" | "cancelled" | "expired"; payment_state: "pending" | "unpaid" | "paid";
  hold_until: string; starts_at: string; ends_at: string; cancellation_deadline: string;
  amount_minor: number; currency: "eur" | "usd"; refund_state: string | null; cancellation_refundable: boolean | null;
};
const instant = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
const moneyValid = (v: Record<string, unknown>) => Number.isInteger(v.amount_minor) && Number(v.amount_minor) > 0 && Number(v.amount_minor) <= 99999999 && ["eur", "usd"].includes(String(v.currency));
export function parseBookingEvent(v: unknown): BookingEvent {
  if (!isRecord(v) || !isUuid(v.night_id) || typeof v.venue_name !== "string" ||
    !(v.city === null || typeof v.city === "string") || !(v.address === null || typeof v.address === "string") ||
    typeof v.timezone !== "string" || !moneyValid(v) || typeof v.policy_version !== "string" ||
    !["now", "opens_at", "closes_at", "starts_at", "ends_at", "cancellation_deadline"].every(k => instant(v[k])) ||
    !Number.isInteger(v.available) || Number(v.available) < 0 || Number(v.available) > 100000 ||
    !["not_open", "open", "closed", "cancelled", "ended"].includes(String(v.status)) ||
    typeof v.walk_ins_possible !== "boolean" || typeof v.registration_open !== "boolean") throw new Error("event_unavailable");
  new Intl.DateTimeFormat("en", { timeZone: v.timezone });
  return v as BookingEvent;
}
export function parseReservation(v: unknown): Reservation {
  if (!isRecord(v) || !isUuid(v.id) || !isUuid(v.night_id) || !isValidEmail(v.email) || typeof v.first_name !== "string" ||
    !["en", "fr", "es"].includes(String(v.locale)) || !["holding", "confirmed", "cancelled", "expired"].includes(String(v.state)) ||
    !["pending", "unpaid", "paid"].includes(String(v.payment_state)) || !moneyValid(v) ||
    !["hold_until", "starts_at", "ends_at", "cancellation_deadline"].every(k => instant(v[k])) ||
    !(v.cancellation_refundable === null || typeof v.cancellation_refundable === "boolean") ||
    !(v.refund_state === null || ["queued", "pending", "succeeded", "failed", "review_needed"].includes(String(v.refund_state)))) throw new Error("reservation_unavailable");
  return v as Reservation;
}
export const depositLabel = (amount: number, currency: string, locale: Locale) => new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);
// Times are always the venue's. Its zone is named only on a device whose own clock reads differently (#405).
const wallClock = (at: Date, timeZone?: string) => new Intl.DateTimeFormat("en", { timeZone, dateStyle: "short", timeStyle: "short" }).format(at);
const zoneNote = { en: "{city} time", fr: "heure de {city}", es: "hora de {city}" };
export function venueZoneNote(at: string, timezone: string, locale: Locale, deviceTimezone?: string): string {
  const date = new Date(at);
  if (wallClock(date, timezone) === wallClock(date, deviceTimezone)) return "";
  return ` (${zoneNote[locale].replace("{city}", timezone.split("/").pop()!.replace(/_/g, " "))})`;
}
export const bookingTime = (at: string, timezone: string, locale: Locale, deviceTimezone?: string) =>
  new Intl.DateTimeFormat(locale, { timeZone: timezone, dateStyle: "full", timeStyle: "short" }).format(new Date(at)) + venueZoneNote(at, timezone, locale, deviceTimezone);
// One date, then both times: an evening ending after midnight still reads as a single evening.
export function bookingRange(start: string, end: string, timezone: string, locale: Locale, deviceTimezone?: string) {
  const time = new Intl.DateTimeFormat(locale, { timeZone: timezone, timeStyle: "short" });
  const day = new Intl.DateTimeFormat(locale, { timeZone: timezone, weekday: "long", day: "numeric", month: "long" }).format(new Date(start));
  return `${day} · ${time.format(new Date(start))} – ${time.format(new Date(end))}${venueZoneNote(start, timezone, locale, deviceTimezone)}`;
}
// Staff search matches any part of the identifier, so its first block is enough at the door.
export const bookingReference = (id: string) => id.slice(0, 8).toUpperCase();
// `paid` records that this tab has seen the reservation paid, so a later refusal never offers payment again (#476).
export type StoredBooking = { id: string; access: string; expires: number; booking?: BookingInput; paid?: true };
// The server decides how long access lasts (until the reserved night is over, #476); the tab only drops very old entries.
export const storedBookingLifetime = 365 * 86400000;
export function isStoredBooking(v: unknown): v is StoredBooking {
  return isRecord(v) && isUuid(v.id) && typeof v.access === "string" && /^v1\.[A-Za-z0-9_-]{100,1500}$/.test(v.access) &&
    typeof v.expires === "number" && Number.isSafeInteger(v.expires) && v.expires > Date.now() && v.expires <= Date.now() + storedBookingLifetime && (v.paid === undefined || v.paid === true);
}
