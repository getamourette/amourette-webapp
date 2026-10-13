import type Stripe from "stripe";
import type { RecoveryEvidence, RefundRecoveryInput } from "../launch-operations";
import type { LaunchRpc } from "./launch-engine";

// Retrieval only: this path never issues a Stripe refund. The worker remains the
// only creator, with the durable operation UUID as its idempotency key.
export async function recoverLaunchRefund(rpc: LaunchRpc, stripe: Stripe, account: string,
  actor: string, input: RefundRecoveryInput) {
  const evidence = await rpc("inspect_launch_refund_recovery", { p_id: input.reservation }) as RecoveryEvidence | null;
  if (!evidence || evidence.account_id !== account) throw new Error("recovery_evidence_mismatch");
  const payment = await stripe.paymentIntents.retrieve(evidence.payment_id, { expand: ["latest_charge"] });
  const charge = payment.latest_charge;
  if (payment.livemode || payment.status !== "succeeded" || payment.amount_received !== evidence.amount_minor ||
    payment.currency !== evidence.currency || payment.metadata.integration !== "amourette_launch_v1" ||
    payment.metadata.reservation_id !== input.reservation || !charge || typeof charge === "string" ||
    charge.disputed || charge.amount !== evidence.amount_minor || charge.currency !== evidence.currency) {
    throw new Error("recovery_evidence_mismatch");
  }
  let candidate: Stripe.Refund | undefined;
  let count = 0;
  for await (const refund of stripe.refunds.list({ payment_intent: evidence.payment_id, limit: 100 })) {
    if (++count > 1000) throw new Error("recovery_scan_limit");
    if (refund.id === input.provider) candidate = refund;
    else if (!["failed", "canceled"].includes(refund.status ?? "")) throw new Error("recovery_ambiguous");
  }
  if (!candidate) throw new Error("recovery_evidence_mismatch");
  // Re-read the selected refund after the complete list. A stale pending snapshot
  // is never used to authorize replacement or overwrite a terminal failure.
  candidate = await stripe.refunds.retrieve(candidate.id);
  const paymentId = typeof candidate.payment_intent === "string" ? candidate.payment_intent : candidate.payment_intent?.id;
  if (paymentId !== evidence.payment_id || candidate.amount !== evidence.amount_minor || candidate.currency !== evidence.currency) {
    throw new Error("recovery_evidence_mismatch");
  }
  if (input.action === "adopt") {
    if (!["pending", "succeeded"].includes(candidate.status ?? "") ||
      (evidence.refund?.provider_refund_id && evidence.refund.provider_refund_id !== candidate.id) ||
      (candidate.metadata?.operation_id && candidate.metadata.operation_id !== evidence.refund?.operation_id)) {
      throw new Error("recovery_ambiguous");
    }
    await rpc("adopt_launch_refund", { p_id: input.reservation, p_operation: input.operation,
      p_provider: candidate.id, p_state: candidate.status!, p_actor: actor, p_note: input.note });
  } else {
    if (!evidence.refund || evidence.refund.operation_id !== input.operation || evidence.refund.provider_refund_id !== candidate.id ||
      !["failed", "canceled"].includes(candidate.status ?? "") || candidate.failure_reason === "charge_for_pending_refund_disputed" ||
      !candidate.failure_balance_transaction || charge.amount_refunded !== 0) throw new Error("recovery_failure_unverified");
    const balanceId = typeof candidate.failure_balance_transaction === "string" ? candidate.failure_balance_transaction : candidate.failure_balance_transaction.id;
    const balance = await stripe.balanceTransactions.retrieve(balanceId);
    const source = typeof balance.source === "string" ? balance.source : balance.source?.id;
    // Settlement currency may differ from charge currency. The provider's linked
    // positive reversal is the evidence; never compare converted minor amounts.
    if (source !== candidate.id || balance.amount <= 0 || balance.type !== "refund_failure") throw new Error("recovery_failure_unverified");
    await rpc("replace_launch_refund", { p_id: evidence.refund.id, p_operation: input.operation!,
      p_provider_id: candidate.id, p_evidence: balance.id, p_note: input.note, p_actor: actor });
  }
}
