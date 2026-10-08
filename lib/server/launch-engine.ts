import type Stripe from "stripe";
import type { Database } from "../database.types";
import type { CheckoutAttempt, RefundClaim } from "../launch-contract";
// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { checkoutParams, findCheckout, reconcileRefund, REPLAY_WINDOW_MS, verifySession } from "./launch-provider.ts";

type Functions = Database["public"]["Functions"];
export type LaunchRpc = <N extends keyof Functions>(name: N, args: Functions[N]["Args"]) => Promise<Functions[N]["Returns"]>;

function requiresReview(error: unknown): boolean {
  const e = error as { type?: string; code?: string; message?: string };
  if (e.code === "idempotency_key_in_use") return false;
  if (e.type) return !["StripeConnectionError", "StripeAPIError", "StripeRateLimitError"].includes(e.type);
  if (e.code && /^(22|23|42)/.test(e.code)) return true;
  return ["stripe_account_mismatch", "checkout_replay_horizon", "checkout_scan_limit", "duplicate_provider_checkout",
    "checkout_evidence_mismatch", "payment_evidence_missing", "payment_evidence_mismatch", "refund_scan_limit",
    "duplicate_provider_refund", "unrecognized_provider_refund", "refund_replay_horizon", "refund_evidence_mismatch"].includes(e.message ?? "");
}

export async function applySession(rpc: LaunchRpc, stripe: Stripe, a: CheckoutAttempt, s: Stripe.Checkout.Session) {
  verifySession(a, s);
  await rpc("bind_launch_checkout", { p_id: a.id, p_checkout: s.id });
  if (s.status === "complete" && s.payment_status === "paid") {
    const id = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
    if (!id) throw new Error("payment_evidence_missing");
    const p = await stripe.paymentIntents.retrieve(id);
    if (p.livemode || p.status !== "succeeded" || p.amount_received !== a.amount_minor ||
      p.currency !== a.currency || p.metadata.reservation_id !== a.id || p.metadata.integration !== "amourette_launch_v1") {
      throw new Error("payment_evidence_mismatch");
    }
    await rpc("record_launch_payment", { p_id: a.id, p_checkout: s.id, p_payment: id, p_amount: a.amount_minor, p_currency: a.currency });
    return "done" as const;
  }
  if (s.status === "expired" && s.payment_status === "unpaid") {
    // An attached in-flight intent is not terminal-unpaid proof.
    const id = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
    if (id) {
      const p = await stripe.paymentIntents.retrieve(id);
      if (p.livemode || p.status !== "canceled") return "pending" as const;
    }
    await rpc("release_launch_hold", { p_id: a.id, p_checkout: s.id, p_evidence: s.id });
    return "done" as const;
  }
  return "pending" as const;
}

export async function processCheckout(rpc: LaunchRpc, stripe: Stripe, account: string, id?: string) {
  const a = await rpc("claim_launch_checkout", id ? { p_id: id } : {}) as CheckoutAttempt | null;
  if (!a) return false;
  let state: "pending" | "done" | "review_needed" = "pending";
  let errorCode: string | undefined;
  let creatingFirst = false;
  try {
    if (a.account_id !== account) throw new Error("stripe_account_mismatch");
    let s: Stripe.Checkout.Session | null = a.checkout_id ? await stripe.checkout.sessions.retrieve(a.checkout_id) : null;
    if (!s && a.first_requested_at) s = await findCheckout(stripe, a);
    if (!s) {
      if (a.first_requested_at && Date.now() - Date.parse(a.first_requested_at) >= REPLAY_WINDOW_MS) {
        throw new Error("checkout_replay_horizon");
      }
      const configuration = await stripe.accounts.retrieve(null);
      if (configuration.id !== account) throw new Error("stripe_account_mismatch");
      if (configuration.charges_enabled !== true || configuration.capabilities?.card_payments !== "active") {
        throw new Error("stripe_cards_unavailable");
      }
      creatingFirst = a.claims === 1 && a.first_requested_at === null;
      await rpc("start_launch_checkout_request", { p_id: a.id, p_claim: a.claim_id });
      s = await stripe.checkout.sessions.create(checkoutParams(a), { idempotencyKey: `launch_checkout_${a.id}` });
      creatingFirst = false;
    }
    verifySession(a, s);
    await rpc("bind_launch_checkout", { p_id: a.id, p_checkout: s.id });
    // Fetch current DB state too: cancellation may have committed during creation.
    const current = await rpc("inspect_launch_checkout", { p_id: a.id }) as CheckoutAttempt;
    if (s.status === "open" && (current.state !== "holding" || current.cancelled || Date.now() >= Date.parse(a.hold_until))) {
      try { s = await stripe.checkout.sessions.expire(s.id); }
      catch { s = await stripe.checkout.sessions.retrieve(s.id); }
    }
    state = await applySession(rpc, stripe, current, s);
  } catch (error) {
    const e = error as { type?: string; statusCode?: number; requestId?: string; param?: string; message?: string };
    // Only documented input validation on the first, unretried request proves
    // no provider operation began. SDK automatic retries are disabled.
    if (creatingFirst && e.type === "StripeInvalidRequestError" && e.statusCode === 400 &&
      e.param === "expires_at" && e.requestId && /^req_[A-Za-z0-9]+$/.test(e.requestId)) {
      await rpc("reject_launch_checkout_creation", { p_id: a.id, p_claim: a.claim_id, p_evidence: e.requestId });
      state = "done"; errorCode = "stripe_expiration_rejected";
    } else {
      const transient = !requiresReview(error);
      state = transient ? "pending" : "review_needed";
      errorCode = e.message === "stripe_cards_unavailable" ? "stripe_cards_unavailable" :
        transient ? "provider_uncertain" : "checkout_reconciliation_required";
    }
  }
  await rpc("finish_launch_checkout", { p_id: a.id, p_claim: a.claim_id, p_state: state, ...(errorCode ? { p_error: errorCode } : {}) });
  return true;
}

export async function processRefund(rpc: LaunchRpc, stripe: Stripe, account: string) {
  const f = await rpc("claim_launch_refund", { p_lease_seconds: 120 }) as RefundClaim | null;
  if (!f) return false;
  let state: "pending" | "succeeded" | "failed" | "review_needed" = "pending";
  let provider = f.provider_refund_id;
  let errorCode: string | undefined;
  try {
    if (f.account_id !== account) throw new Error("stripe_account_mismatch");
    const refund = await reconcileRefund(stripe, f);
    provider = refund.id;
    state = refund.status === "succeeded" ? "succeeded" :
      refund.status === "failed" || refund.status === "canceled" ? "failed" :
      refund.status === "pending" ? "pending" : "review_needed";
    if (state === "failed") errorCode = "provider_terminal_failure";
  } catch (error) {
    const transient = !requiresReview(error);
    state = transient ? "pending" : "review_needed";
    errorCode = transient ? "provider_uncertain" : "refund_reconciliation_required";
  }
  await rpc("complete_launch_refund", { p_id: f.id, p_claim: f.claim_id, p_state: state,
    p_provider_id: provider, ...(errorCode ? { p_error: errorCode } : {}) });
  return true;
}

// Signed events are wake-up evidence. Retrieve current provider state instead of
// applying potentially stale snapshots; the SQL transitions remain idempotent.
export async function handleLaunchEvent(rpc: LaunchRpc, stripe: Stripe, account: string, event: Stripe.Event) {
  if (event.livemode || event.account) throw new Error("stripe_event_account_mismatch");
  if (!["checkout.session.completed", "checkout.session.expired", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed"].includes(event.type)) return;
  const snapshot = event.data.object as Stripe.Checkout.Session;
  if (snapshot.metadata?.integration !== "amourette_launch_v1") return;
  const id = snapshot.metadata.reservation_id;
  if (!id || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) throw new Error("invalid_event_reservation");
  const a = await rpc("inspect_launch_checkout", { p_id: id }) as CheckoutAttempt | null;
  if (!a || a.account_id !== account) throw new Error("unknown_provider_attempt");
  const s = await stripe.checkout.sessions.retrieve(snapshot.id);
  await applySession(rpc, stripe, a, s);
}
