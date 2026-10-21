// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { resolveVenueLocalDateTime } from "./venue-time.ts";

export type ReservationDraft = { opens: string; capacity: string; amount: string; currency: string; policy: string };
export const registrationFutureError = "Registration must open in the future.";
export const registrationCutoffError = "Registration must open before booking closes, 30 minutes before entry.";

export function registrationOpeningRefusal(message: string) {
  if (message === "opening must not be in the past" || message === registrationFutureError) return registrationFutureError;
  if (message === "invalid registration schedule" || message === registrationCutoffError) return registrationCutoffError;
  return undefined;
}

export function validateReservationConfiguration(draft: ReservationDraft, timezone: string, allocations: number, timing?: { startsAt: string; now: number; frozen?: boolean }) {
  const errors: Partial<Record<keyof ReservationDraft, string>> = {};
  const resolved = resolveVenueLocalDateTime(draft.opens, timezone);
  if (!resolved.ok) errors.opens = resolved.message;
  else if (timing && !timing.frozen) {
    if (Date.parse(resolved.iso) <= timing.now) errors.opens = registrationFutureError;
    else if (Date.parse(resolved.iso) >= Date.parse(timing.startsAt) - 30 * 60_000) errors.opens = registrationCutoffError;
  }
  if (!/^\d{1,6}$/.test(draft.capacity) || Number(draft.capacity) < Math.max(1, allocations) || Number(draft.capacity) > 100000) errors.capacity = `Capacity must be ${Math.max(1, allocations)}–100,000 and cover all allocated places.`;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(draft.amount) || Number(draft.amount) <= 0 || Number(draft.amount) > 999999.99) errors.amount = "Enter a deposit from 0.01 to 999,999.99 with at most two decimal places.";
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(draft.policy)) errors.policy = "Enter a policy version of 1–80 letters, digits, dots, underscores or hyphens.";
  if (draft.currency !== "eur" && draft.currency !== "usd") errors.currency = "Choose EUR or USD.";
  const payload = resolved.ok && Object.keys(errors).length === 0 ? {
    p_opens: resolved.iso, p_capacity: Number(draft.capacity), p_amount: Math.round(Number(draft.amount) * 100), p_currency: draft.currency, p_policy: draft.policy,
  } : null;
  return { errors, payload };
}
