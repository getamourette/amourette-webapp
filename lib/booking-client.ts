import { isRecord } from "./input-validation";
export class BookingError extends Error { constructor(public code: string, public status: number) { super(code); } }
// These responses can only come from creation refusals before allocation.
// A timeout, authorization failure or conflicting existing ID is not proof of absence.
export function isUnallocatedBookingRefusal(error: unknown): boolean {
  return error instanceof BookingError && error.status === 409 &&
    ["booking_refused", "reservation_unavailable"].includes(error.code);
}
export async function bookingRequest(path: string, body?: unknown, access?: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`/api/launch/${path}`, { method: body === undefined ? "GET" : "POST", cache: "no-store", signal,
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(access ? { Authorization: `Bearer ${access}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result: unknown = await response.json();
  if (!response.ok) throw new BookingError(isRecord(result) && typeof result.error === "string" ? result.error : "unavailable", response.status);
  return result;
}
export function checkoutDestination(value: unknown): string | null {
  if (!isRecord(value) || typeof value.checkout_url !== "string") return null;
  const url = new URL(value.checkout_url);
  return url.origin === "https://checkout.stripe.com" && !url.username && !url.password ? url.href : null;
}
