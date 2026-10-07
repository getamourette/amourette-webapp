import Stripe from "stripe";
import type { CheckoutAttempt, RefundClaim } from "../launch-contract";

export const STRIPE_VERSION = "2026-09-30.endive";
export const REPLAY_WINDOW_MS = 23 * 60 * 60 * 1000;
export function createLaunchStripe(): Stripe {
  // Production activation is a separate founder-gated task. Fail closed even if
  // someone accidentally supplies a live key to a preview or local process.
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith("sk_test_")) throw new Error("stripe_sandbox_unconfigured");
  return new Stripe(key, { apiVersion: STRIPE_VERSION, maxNetworkRetries: 0, timeout: 15000 });
}

export async function launchProvider(stripe = createLaunchStripe()) {
  const account = await stripe.accounts.retrieve(null);
  // Existing financial obligations still need retrieval and refunds when new
  // charges are disabled. Eligibility is checked only before Checkout creation.
  return { stripe, account: account.id };
}

export function checkoutParams(a: CheckoutAttempt): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "payment", allowed_payment_method_types: ["card"], adaptive_pricing: { enabled: false },
    customer_email: a.email, locale: a.locale, client_reference_id: a.id,
    expires_at: Math.floor(Date.parse(a.hold_until) / 1000),
    line_items: [{ price_data: { currency: a.currency, unit_amount: a.amount_minor,
      product_data: { name: "Amourette refundable reservation deposit" } }, quantity: 1 }],
    metadata: { integration: "amourette_launch_v1", reservation_id: a.id },
    payment_intent_data: { metadata: { integration: "amourette_launch_v1", reservation_id: a.id } },
    // No management/arrival credentials or client-provided redirect destinations.
    success_url: `${a.origin}/api/launch/return`, cancel_url: `${a.origin}/api/launch/return`,
  };
}

export function verifySession(a: CheckoutAttempt, s: Stripe.Checkout.Session): void {
  if (s.livemode || s.mode !== "payment" || s.client_reference_id !== a.id ||
    s.metadata?.integration !== "amourette_launch_v1" || s.metadata?.reservation_id !== a.id ||
    s.amount_total !== a.amount_minor || s.currency !== a.currency ||
    s.expires_at !== Math.floor(Date.parse(a.hold_until) / 1000) ||
    s.expires_at > Date.parse(a.starts_at) / 1000 ||
    s.payment_method_types.length !== 1 || s.payment_method_types[0] !== "card" ||
    (a.checkout_id !== null && a.checkout_id !== s.id)) throw new Error("checkout_evidence_mismatch");
}

export async function findCheckout(stripe: Stripe, a: CheckoutAttempt): Promise<Stripe.Checkout.Session | null> {
  let found: Stripe.Checkout.Session | null = null;
  let count = 0;
  // List, not eventually consistent search. Pagination must finish before an
  // absence is considered; even absence never authorizes releasing capacity.
  for await (const s of stripe.checkout.sessions.list({ created: { gte: Math.floor(Date.parse(a.created_at) / 1000) - 60,
    lte: Math.floor(Date.parse(a.hold_until) / 1000) }, limit: 100 })) {
    if (++count > 1000) throw new Error("checkout_scan_limit");
    if (s.metadata?.integration === "amourette_launch_v1" && s.metadata?.reservation_id === a.id) {
      if (found) throw new Error("duplicate_provider_checkout");
      verifySession(a, s); found = s;
    }
  }
  return found;
}

export function verifyRefund(f: RefundClaim, r: Stripe.Refund): void {
  const payment = typeof r.payment_intent === "string" ? r.payment_intent : r.payment_intent?.id;
  if (payment !== f.payment_id || r.amount !== f.amount_minor || r.currency !== f.currency ||
    r.metadata?.operation_id !== f.operation_id || r.metadata?.refund_id !== f.id ||
    (f.provider_refund_id && f.provider_refund_id !== r.id)) throw new Error("refund_evidence_mismatch");
}

export async function reconcileRefund(stripe: Stripe, f: RefundClaim, now = Date.now()): Promise<Stripe.Refund> {
  let refund: Stripe.Refund | undefined;
  if (f.provider_refund_id) refund = await stripe.refunds.retrieve(f.provider_refund_id);
  else if (f.reconcile_first) {
    let count = 0;
    for await (const candidate of stripe.refunds.list({ payment_intent: f.payment_id, limit: 100 })) {
      if (++count > 1000) throw new Error("refund_scan_limit");
      if (candidate.metadata?.operation_id === f.operation_id) {
        if (refund) throw new Error("duplicate_provider_refund");
        refund = candidate;
      } else if (!["failed", "canceled"].includes(candidate.status ?? "")) {
        // Includes Dashboard/manual refunds. Never issue a second full refund
        // or silently adopt an unrelated operation.
        throw new Error("unrecognized_provider_refund");
      }
    }
  }
  if (!refund) {
    if (now - Date.parse(f.first_requested_at) >= REPLAY_WINDOW_MS) throw new Error("refund_replay_horizon");
    refund = await stripe.refunds.create({ payment_intent: f.payment_id, amount: f.amount_minor,
      metadata: { integration: "amourette_launch_v1", operation_id: f.operation_id, refund_id: f.id } },
    { idempotencyKey: f.operation_id });
  }
  verifyRefund(f, refund);
  return refund;
}
