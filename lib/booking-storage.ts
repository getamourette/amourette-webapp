import { browserLocale, isLocale, type Locale } from "./strings";
import { bookingInput } from "./launch-contract";
import { isStoredBooking, type StoredBooking } from "./booking";
import { isUuid } from "./input-validation";
const prefix = "amourette-reservation:";
export function storeBooking(value: StoredBooking) {
  if (!isStoredBooking(value)) throw new Error("storage_unavailable");
  const raw = JSON.stringify(value);
  sessionStorage.setItem(prefix + value.id, raw);
  if (sessionStorage.getItem(prefix + value.id) !== raw) throw new Error("storage_unavailable");
}
export function readBooking(id: string): StoredBooking | null {
  if (!isUuid(id)) return null;
  try {
    const raw = sessionStorage.getItem(prefix + id);
    if (!raw || raw.length > 8192) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredBooking(parsed) || parsed.id !== id) { sessionStorage.removeItem(prefix + id); return null; }
    if ("booking" in parsed) parsed.booking = bookingInput(parsed.booking);
    return parsed;
  } catch { return null; }
}
export function bookingForNight(night: string): StoredBooking | null {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(prefix)) {
        const value = readBooking(key.slice(prefix.length));
        if (value?.booking?.night === night) return value;
      }
    }
  } catch { /* Recovery by email remains available. */ }
  return null;
}
export function clearBooking(id: string) { try { sessionStorage.removeItem(prefix + id); } catch { /* No further storage effects. */ } }

export function bookingLocale(): Locale {
  try { const value = sessionStorage.getItem("amourette-booking-language"); if (isLocale(value)) return value; } catch { /* Use browser language. */ }
  return browserLocale();
}
export function rememberBookingLocale(locale: Locale) {
  try { sessionStorage.setItem("amourette-booking-language", locale); } catch { /* Language still changes in memory. */ }
}
