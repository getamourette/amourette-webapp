import type { Locale } from "./strings";

// One wording for the event page, the reservation details and the confirmation mail (#439).
const copy = {
  en: { until: "until {date}", over: "no longer possible for this evening" },
  fr: { until: "jusqu’au {date}", over: "plus possible pour cette soirée" },
  es: { until: "hasta el {date}", over: "ya no es posible para esta noche" },
} satisfies Record<Locale, { until: string; over: string }>;

// The deadline instant itself is still free: the policy refunds "at or before" it.
export const freeCancellationOver = (now: string, deadline: string) => Date.parse(now) > Date.parse(deadline);

// Follows the "Free cancellation" label. A passed deadline is never printed as a date.
export const freeCancellationText = (locale: Locale, over: boolean, date: string) =>
  over ? copy[locale].over : copy[locale].until.replace("{date}", () => date);
