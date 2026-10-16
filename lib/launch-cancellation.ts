// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { isRecord } from "./input-validation.ts";
// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { parseReservation, type Reservation } from "./booking.ts";
export type Cancellation = { reservation: Reservation; now: string; timezone: string; refundable: boolean; can_cancel: boolean; confirmation_required: boolean };
export function cancellationInput(value: unknown): { p_confirm: boolean; p_accept_retained: boolean } {
  if (!isRecord(value) || (value.action !== "preview" && value.action !== "confirm") ||
    typeof value.accept_retained !== "boolean" || (value.action === "preview" && value.accept_retained) ||
    Object.keys(value).length !== 2 || Object.keys(value).some(k => !["action", "accept_retained"].includes(k))) throw new Error("invalid_cancellation");
  return { p_confirm: value.action === "confirm", p_accept_retained: value.accept_retained };
}
export function parseCancellation(value: unknown): Cancellation {
  if (!isRecord(value) || typeof value.now !== "string" || !Number.isFinite(Date.parse(value.now)) ||
    typeof value.timezone !== "string" || typeof value.refundable !== "boolean" ||
    typeof value.can_cancel !== "boolean" || typeof value.confirmation_required !== "boolean") throw new Error("invalid_cancellation");
  new Intl.DateTimeFormat("en", { timeZone: value.timezone });
  return { ...value, reservation: parseReservation(value.reservation) } as Cancellation;
}
