export const money = (amount: number, currency: string) => new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount / 100);
export const status = (value: string | null) => value ? value.replaceAll("_", " ") : "Not recorded";
// Outcome colour of a reservation state, so the door reads it at a glance (#407).
export type StatusTone = "good" | "wait" | "bad" | "neutral";
const tones: Record<string, StatusTone> = { confirmed: "good", paid: "good", verified: "good", succeeded: "good",
  holding: "wait", pending: "wait", queued: "wait", no_show: "bad", failed: "bad", review_needed: "bad" };
export const statusTone = (value: string | null): StatusTone => (value && tones[value]) || "neutral";
// A Checkout session identifier carries its mode (`cs_live_` / `cs_test_`), so the
// Dashboard link follows the payment itself rather than a client-side setting.
export const stripePaymentUrl = (paymentId: string, checkoutId: string | null) =>
  `https://dashboard.stripe.com/${checkoutId?.startsWith("cs_live_") ? "" : "test/"}payments/${encodeURIComponent(paymentId)}`;
