// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { isRecord, isUuid, isValidText } from "./input-validation.ts";

export type RefundRecoveryInput = {
  reservation: string; operation: string | null; action: "adopt" | "replace";
  provider: string; note: string;
};
export function refundRecoveryInput(value: unknown): RefundRecoveryInput {
  if (!isRecord(value) || !isUuid(value.reservation) ||
    (value.operation !== null && !isUuid(value.operation)) ||
    (value.action !== "adopt" && value.action !== "replace") ||
    (value.action === "replace" && value.operation === null) ||
    typeof value.provider !== "string" || !/^re_[A-Za-z0-9]{1,252}$/.test(value.provider) ||
    !isValidText(value.note, 500) || Object.keys(value).some(k => !["reservation", "operation", "action", "provider", "note"].includes(k))) {
    throw new Error("invalid_refund_recovery");
  }
  return { reservation: value.reservation.toLowerCase(), operation: value.operation?.toLowerCase() ?? null,
    action: value.action, provider: value.provider, note: value.note.trim() };
}
export type RecoveryEvidence = {
  reservation_id: string; payment_id: string; amount_minor: number; currency: "eur" | "usd"; account_id: string;
  refund: { id: string; operation_id: string; provider_refund_id: string | null; state: string } | null;
};
export type LaunchReservation = {
  id: string; night_id: string; email: string; first_name: string; locale: string;
  state: "holding" | "confirmed" | "cancelled" | "expired"; hold_until: string; policy_version: string; accepted_at: string;
  starts_at: string; ends_at: string; cancellation_deadline: string; cancelled_at: string | null; cancellation_refundable: boolean | null;
  amount_minor: number; currency: "eur" | "usd"; payment_state: "pending" | "unpaid" | "paid";
  arrival: "verified" | "no_show" | null; verified_at: string | null; refund_state: string | null;
};
export type ReservationDetail = LaunchReservation & {
  payment: { payment_id: string | null; checkout_id: string | null; paid_at: string | null };
  refund: { id: string; operation_id: string; provider_refund_id: string | null; state: string; reason: string;
    attempts: number; last_error: string | null; updated_at: string; lease_until: string | null; provider_source: string; review_owner: string | null } | null;
  checkout_work: { state: string; attempts: number; last_error: string | null; account_id: string } | null;
  failed_refund_attempts: { operation_id: string; provider_refund_id: string; evidence: string; verification_note: string; verified_at: string }[];
};
export type LaunchOverview = {
  now: string; allocations: number;
  event: { night_id: string; registration_opens_at: string; capacity: number; deposit_minor: number; currency: "eur" | "usd";
    policy_version: string; cancelled_at: string | null; cancellation_reason: string | null } | null;
  finance: { currency: string; paid_count: number; charged: number; refunded: number; outstanding: number; retained: number;
    held: number; anomalies: number; awaiting_funds: number; oldest_unresolved_update: string | null }[];
};
export type LaunchAudit = { id: number; reservation_id: string | null; action: string; actor_id: string | null;
  detail: Record<string, unknown>; created_at: string };
