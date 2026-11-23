export const money = (amount: number, currency: string) => new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount / 100);
export const status = (value: string | null) => value ? value.replaceAll("_", " ") : "Not recorded";
// A Checkout session identifier carries its mode (`cs_live_` / `cs_test_`), so the
// Dashboard link follows the payment itself rather than a client-side setting.
export const stripePaymentUrl = (paymentId: string, checkoutId: string | null) =>
  `https://dashboard.stripe.com/${checkoutId?.startsWith("cs_live_") ? "" : "test/"}payments/${encodeURIComponent(paymentId)}`;
