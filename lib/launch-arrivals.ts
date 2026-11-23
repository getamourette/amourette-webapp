// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { isRecord, isUuid, isValidText, isValidEmail } from "./input-validation.ts";

const availabilities = ["open", "not_started", "ended", "cancelled", "event_cancelled", "unpaid", "revoked"] as const;
export type ArrivalAvailability = typeof availabilities[number];
export type ArrivalHistory = { id: number; action: "arrival_verified" | "arrival_corrected"; actor_id: string | null;
  created_at: string; detail: Record<string, unknown> };
export type StaffArrival = {
  id: string; night_id: string; first_name: string; email: string;
  state: string; payment_state: string; arrival: "verified" | "no_show" | null;
  verified_at: string | null; verified_by: string | null; method: "qr" | "manual" | null; note: string | null;
  revision: number; refund_state: string | null; availability: ArrivalAvailability; can_correct: boolean; history: ArrivalHistory[];
};
export type ArrivalSummary = { now: string; starts_at: string; ends_at: string; ended: boolean; cancelled: boolean;
  verified: number; remaining: number; absent: number; cancelled_count: number };
export type ArrivalSearchRow = Pick<StaffArrival, "id" | "night_id" | "first_name" | "email" | "state" | "arrival">;
const instant = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const outcome = (value: unknown) => value === null || value === "verified" || value === "no_show";
const bookingState = (value: unknown) => typeof value === "string" && ["holding", "confirmed", "cancelled", "expired"].includes(value);
export function isArrivalCode(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}
export function readStaffArrival(value: unknown, night: string): StaffArrival {
  if (!isRecord(value) || !isUuid(value.id) || value.night_id !== night || !isValidText(value.first_name, 30) || !isValidEmail(value.email) ||
    !bookingState(value.state) || !["pending", "unpaid", "paid"].some(item => item === value.payment_state) || !outcome(value.arrival) ||
    !(value.verified_at === null || instant(value.verified_at)) || !(value.verified_by === null || isUuid(value.verified_by)) ||
    !(value.method === null || value.method === "qr" || value.method === "manual") || !(value.note === null || isValidText(value.note, 500)) ||
    !count(value.revision) || value.revision > 2147483647 || typeof value.can_correct !== "boolean" || !availabilities.some(item => item === value.availability) ||
    !(value.refund_state === null || ["queued", "pending", "succeeded", "failed", "review_needed"].some(item => item === value.refund_state)) ||
    !Array.isArray(value.history) || value.history.length > 20 || !value.history.every(item => isRecord(item) && count(item.id) &&
      (item.action === "arrival_verified" || item.action === "arrival_corrected") && instant(item.created_at) &&
      (item.actor_id === null || isUuid(item.actor_id)) && isRecord(item.detail))) throw new Error("Invalid arrival response");
  return value as StaffArrival;
}
export function readArrivalSummary(value: unknown): ArrivalSummary {
  if (!isRecord(value) || !instant(value.now) || !instant(value.starts_at) || !instant(value.ends_at) ||
    typeof value.ended !== "boolean" || typeof value.cancelled !== "boolean" ||
    ![value.verified, value.remaining, value.absent, value.cancelled_count].every(count)) throw new Error("Invalid arrival summary");
  return value as ArrivalSummary;
}
export function readArrivalSearch(value: unknown, night: string): ArrivalSearchRow[] {
  if (!Array.isArray(value) || value.length > 100 || !value.every(row => isRecord(row) && isUuid(row.id) && row.night_id === night &&
    isValidText(row.first_name, 30) && isValidEmail(row.email) && bookingState(row.state) && outcome(row.arrival))) throw new Error("Invalid search response");
  return value as ArrivalSearchRow[];
}
export const arrivalAvailabilityText: Record<ArrivalAvailability, string> = {
  open: "Confirm only after verifying this guest is here. Being refused entry by the bar does not prevent a refund.",
  not_started: "Arrival confirmation opens 60 minutes before the scheduled event start.",
  ended: "Arrivals are closed. A founder can correct a missed arrival with verified attendance evidence.",
  cancelled: "This reservation was cancelled. Its QR cannot confirm arrival.",
  event_cancelled: "This event was cancelled or postponed. Arrivals cannot be confirmed.",
  unpaid: "This reservation has no confirmed place and payment. Arrival cannot be confirmed.",
  revoked: "This arrival code is no longer valid. Check the reservation before proceeding.",
};
export function arrivalRefundText(state: string | null) {
  if (state === "succeeded") return "Refund processed. Bank credit can take several business days.";
  if (state === "queued" || state === "pending") return "Refund requested. Bank credit is not yet confirmed.";
  if (state === "failed" || state === "review_needed") return "Refund needs founder follow-up in Reservations & deposits.";
  return "No refund requested yet.";
}
// Scan refusals (#403). The server refuses an unknown or other-night code with this
// exact message; every other failure means the lookup itself did not complete.
export function isArrivalRefusal(error: unknown) {
  return isRecord(error) && error.message === "arrival credential unavailable";
}
export const arrivalLookupFailedText = "Connection problem: this reservation could not be checked. No arrival was confirmed. Check your connection, then scan again or use manual lookup.";
export const arrivalNotFoundText = "No reservation for this night matches. No arrival was confirmed. Ask for the guest’s confirmation QR or use manual lookup.";
// `date` is the other night's entry time, already formatted in the venue timezone.
export function arrivalOtherNightText(availability: ArrivalAvailability, date: string) {
  const reason = availability === "cancelled" ? `Cancelled booking, and it was for another night: ${date}.`
    : availability === "ended" ? `This booking was for a night that has ended: ${date}.`
    : availability === "event_cancelled" ? `This booking was for another night, which was cancelled or postponed: ${date}.`
    : availability === "unpaid" || availability === "revoked" ? `This QR is not valid, and it was issued for another night: ${date}.`
    : `Booked for another night: ${date}.`;
  return `${reason} No arrival was confirmed tonight.`;
}
// Nearest nights first: a guest at the wrong door most often booked an adjacent date.
export const otherNightLookupLimit = 12;
export function nearestOtherNights<T extends { id: string; waiting_opens_at: string }>(nights: T[], night: string): T[] {
  const anchor = Date.parse(nights.find(item => item.id === night)?.waiting_opens_at ?? "");
  const distance = (item: T) => Number.isFinite(anchor) ? Math.abs(Date.parse(item.waiting_opens_at) - anchor) : 0;
  return nights.filter(item => item.id !== night).sort((a, b) => distance(a) - distance(b)).slice(0, otherNightLookupLimit);
}
