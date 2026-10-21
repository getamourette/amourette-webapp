"use client";
import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import type { ReservationDetail } from "@/lib/launch-operations";
import { isValidEmail, isValidText, normalizeEmail } from "@/lib/input-validation";
import { WorkspaceDialog } from "./WorkspaceDialog";
import { money } from "./reservation-format";
import styles from "./ReservationOperations.module.css";
type Action = "owner" | "refund" | "retry" | "checkout" | "email" | "adopt" | "replace" | "cancelled" | "postponed";
const labels: Record<Action, string> = { owner: "Take responsibility for refund", refund: "Refund full deposit", retry: "Reconcile refund", checkout: "Reconcile payment",
  email: "Correct booking email", adopt: "Link Stripe refund", replace: "Replace failed refund", cancelled: "Cancel event and refund deposits", postponed: "Postpone event and refund deposits" };

export function useReservationAction({ nightId, detail, refresh, onNightChanged, onNotice }: {
  nightId: string; detail: ReservationDetail | null; refresh: () => void; onNightChanged: () => void; onNotice?: (notice: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [provider, setProvider] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [actionError, setActionError] = useState("");
  function openAction(value: Action) {
    setAction(value); setNote(""); setEmail(detail?.email ?? ""); setProvider(detail?.refund?.provider_refund_id ?? "");
    setConfirmed(false); setActionError(""); setNotice("");
  }
  async function submitAction(e: FormEvent) {
    e.preventDefault(); if (!action || busy) return;
    const organizer = action === "cancelled" || action === "postponed";
    if (!confirmed || (!organizer && !isValidText(note, 500))) { setActionError("Confirm the action and enter a reason of 1–500 characters."); return; }
    if (!organizer && !detail) return;
    if (action === "email" && !isValidEmail(email)) { setActionError("Enter a valid email address."); return; }
    if ((action === "adopt" || action === "replace") && !/^re_[A-Za-z0-9]{1,252}$/.test(provider)) { setActionError("Enter the Stripe refund reference starting with re_."); return; }
    setBusy(true); setActionError("");
    try {
      let result: { error: { message: string } | null } = { error: null };
      if (organizer) result = await supabase.rpc("admin_cancel_launch_event", { p_night: nightId, p_reason: action });
      else if (action === "owner") result = await supabase.rpc("admin_claim_launch_refund", { p_id: detail!.refund!.id, p_note: note.trim() });
      else if (action === "refund") result = await supabase.rpc("admin_refund_launch_reservation", { p_id: detail!.id, p_note: note.trim() });
      else if (action === "retry") result = await supabase.rpc("admin_retry_launch_refund", { p_id: detail!.refund!.id, p_note: note.trim() });
      else if (action === "checkout") result = await supabase.rpc("admin_retry_launch_checkout", { p_id: detail!.id, p_note: note.trim() });
      else if (action === "email") result = await supabase.rpc("admin_correct_launch_email", { p_id: detail!.id, p_email: normalizeEmail(email), p_note: note.trim() });
      else {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Sign in again before recovering a refund.");
        const response = await fetch("/api/admin/launch/refunds", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ reservation: detail!.id, operation: detail!.refund?.operation_id ?? null, action, provider, note: note.trim() }) });
        if (!response.ok) throw new Error("Stripe recovery could not be verified. Refresh and check the payment, refund and processing state in Stripe.");
      }
      if (result.error) throw new Error("This action could not be completed. Refresh and check the current reservation state before trying again.");
      setAction(null); refresh();
      const message = action === "owner" ? "You are now responsible for following up this refund." : action === "email" ? "Email corrected. Previous management access has expired; the arrival QR is unchanged. No email has been sent." :
        action === "adopt" ? "Stripe refund linked. Its current outcome is shown below." : "Action recorded. Refund processing is asynchronous; a queued request is not a completed refund.";
      setNotice(message); onNotice?.(message);
      if (organizer) onNightChanged();
    } catch (error) { setActionError(error instanceof Error ? error.message : "Action failed. Try again."); }
    finally { setBusy(false); }
  }
  const dialog = <>
    {action && <WorkspaceDialog title={labels[action]} busy={busy} onClose={() => setAction(null)}><form className={styles.form} onSubmit={submitAction}>
      {action === "cancelled" || action === "postponed" ? <p>This permanently closes this event, invalidates arrival QRs and queues full refunds for all paid deposits not already refunded. Refunds complete asynchronously.</p> : <>
        <p><strong>{detail?.first_name}</strong> · {detail?.email}<br />{detail && money(detail.amount_minor, detail.currency)}</p>
        {action === "owner" && <p>Take responsibility for funding or investigating this refund. This records your ownership without changing its financial outcome.</p>}
        {action === "refund" && <p>Return the entire deposit as a founder exception. Attendance will remain unchanged.</p>}
        {action === "retry" && <p>Reconcile the existing refund with Stripe using the same operation. This does not authorize a second refund.</p>}
        {action === "checkout" && <p>Reconcile the original payment attempt. Capacity stays held until Stripe provides a definite outcome.</p>}
        {action === "email" && <><p>Verify ownership using the booking and payment first. Existing management access expires; the arrival QR stays valid. This action does not send an email.</p><label>Correct email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label></>}
        {(action === "adopt" || action === "replace") && <><p>{action === "adopt" ? "Link a full refund already issued in Stripe. We verify the payment, amount, currency and current outcome. No new refund will be issued by this action." : "Authorize one replacement only after Stripe confirms terminal failure and returned funds. Pending, partial, disputed or uncertain refunds cannot be replaced."}</p><label>Stripe refund reference<input value={provider} onChange={e => setProvider(e.target.value)} placeholder="re_…" required /></label></>}
        <label>Reason / verification note<textarea value={note} onChange={e => setNote(e.target.value)} rows={3} required aria-describedby="refund-note-limit" /></label><p id="refund-note-limit" className={styles.hint}>{Array.from(note.trim()).length} / 500 characters</p>
      </>}
      <label className={styles.confirm}><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I have checked the event and reservation details and confirm this action.</label>
      {actionError && <p role="alert" className={styles.error}>{actionError}</p>}<button disabled={busy || !confirmed} type="submit">{busy ? "Processing…" : labels[action]}</button>
    </form></WorkspaceDialog>}
  </>;
  return { busy, notice, openAction, dialog };
}
