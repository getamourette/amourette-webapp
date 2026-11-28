// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { bookingChannel } from "./launch-contract.ts";
import type { BookingEvent } from "./booking";
import type { Locale } from "./strings";

// #603: the landing's booking button goes to the next upcoming night, and relays
// the posted link it was opened from. `via` follows the contract of the event
// page (#561): one value from the closed set, anything else (missing, unknown,
// repeated) is dropped without feedback. Nothing is stored.
export function landingBookingHref(night: string, search: string): string {
  const values = new URLSearchParams(search).getAll("via");
  const channel = values.length === 1 ? bookingChannel(values[0]) : null;
  return `/events/${night}${channel ? `?via=${channel}` : ""}`;
}

// "10 €", "€10": whole amounts without decimals, in the venue's currency.
export function landingAmount(amountMinor: number, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(locale, {
    style: "currency", currency: currency.toUpperCase(),
    minimumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
  }).format(amountMinor / 100);
}

const capitalize = (value: string, locale: Locale) => value.charAt(0).toLocaleUpperCase(locale) + value.slice(1);

// The ticket prints the weekday on its own line: ["Jeudi", "10 décembre"].
export function landingDate(at: string, timezone: string, locale: Locale): [string, string] {
  const date = new Date(at);
  const weekday = new Intl.DateTimeFormat(locale, { timeZone: timezone, weekday: "long" }).format(date);
  const day = new Intl.DateTimeFormat(locale, { timeZone: timezone, day: "numeric", month: "long" }).format(date);
  return [capitalize(weekday, locale), day];
}

// Venue wall-clock time, short enough for the ticket's narrow cell:
// "19 h 30" (fr), "7:30 pm" (en), "19:30" (es).
export function landingTime(at: string, timezone: string, locale: Locale): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at));
  const hour = Number(parts.find(p => p.type === "hour")?.value);
  const minute = parts.find(p => p.type === "minute")?.value ?? "00";
  if (locale === "fr") return minute === "00" ? `${hour}\u00a0h` : `${hour}\u00a0h\u00a0${minute}`;
  if (locale === "en") return `${hour % 12 || 12}${minute === "00" ? "" : `:${minute}`}\u00a0${hour < 12 ? "am" : "pm"}`;
  return `${hour}:${minute}`;
}

export type LandingNight = Pick<BookingEvent, "night_id" | "venue_name" | "city" | "address" | "timezone" | "starts_at" | "ends_at" | "amount_minor" | "currency">;

// "50 rue Léon Frot, Paris 11e": the address, then the city unless the address already ends with it.
export function landingPlace(night: Pick<LandingNight, "address" | "city">): string {
  const { address, city } = night;
  if (!address) return city ?? "";
  if (!city || address.toLocaleLowerCase().includes(city.toLocaleLowerCase())) return address;
  return `${address}, ${city}`;
}
