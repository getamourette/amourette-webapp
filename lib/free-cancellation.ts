import type { Locale } from "./strings";

// One wording for the event page, the reservation details and the confirmation mail (#439).
const copy = {
  en: { until: "until {date}", over: "no longer possible for this evening" },
  fr: { until: "jusqu’au {date}", over: "plus possible pour cette soirée" },
  es: { until: "hasta el {date}", over: "ya no es posible para esta noche" },
} satisfies Record<Locale, { until: string; over: string }>;

// The deadline instant itself is still free: the policy refunds "at or before" it.
export const freeCancellationOver = (now: string, deadline: string) => Date.parse(now) > Date.parse(deadline);

// The payment hold lasts 30 minutes (`prepare_launch_checkout`), so a guest who starts paying
// less than 30 minutes before the deadline can pay after it: the server then requires the
// late acknowledgement (#477), and the booking page asks for it from that moment.
export const paymentHoldMs = 30 * 60 * 1000;
export const lateAcknowledgementRequired = (now: string, deadline: string) => Date.parse(now) + paymentHoldMs > Date.parse(deadline);

// Follows the "Free cancellation" label. A passed deadline is never printed as a date.
export const freeCancellationText = (locale: Locale, over: boolean, date: string) =>
  over ? copy[locale].over : copy[locale].until.replace("{date}", () => date);
