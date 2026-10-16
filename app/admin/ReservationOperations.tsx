"use client";

import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import type { LaunchAudit, LaunchOverview, LaunchReservation, ReservationDetail } from "@/lib/launch-operations";
import { isValidEmail, isValidText, normalizeEmail } from "@/lib/input-validation";
import { formatVenueInstant, isoToVenueLocalInput, resolveVenueLocalDateTime } from "@/lib/venue-time";
import { WorkspaceDialog } from "./WorkspaceDialog";
import styles from "./ReservationOperations.module.css";

type Action = "owner" | "refund" | "retry" | "checkout" | "email" | "adopt" | "replace" | "cancelled" | "postponed";
const labels: Record<Action, string> = { owner: "Take responsibility for refund", refund: "Refund full deposit", retry: "Reconcile refund", checkout: "Reconcile payment",
  email: "Correct booking email", adopt: "Link Stripe refund", replace: "Replace failed refund", cancelled: "Cancel event and refund deposits", postponed: "Postpone event and refund deposits" };
const money = (amount: number, currency: string) => new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount / 100);
const status = (value: string | null) => value ? value.replaceAll("_", " ") : "Not recorded";
const filters = ["all", "confirmed", "holding", "cancelled", "expired", "paid", "unpaid", "verified", "no_show", "refund_due", "refunded", "attention"];

export function ReservationOperations({ nightId, startsAt, timezone, terminal, onBookingState, onNightChanged, onOpenArrivals }: {
  nightId: string; startsAt: string; timezone: string; terminal: boolean;
  onBookingState: (state: { configured: boolean; frozen: boolean }) => void; onNightChanged: () => void; onOpenArrivals: () => void;
}) {
  const [overview, setOverview] = useState<LaunchOverview | null>(null);
  const [rows, setRows] = useState<LaunchReservation[]>([]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [cursor, setCursor] = useState<string | undefined>();
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReservationDetail | null>(null);
  const [revision, setRevision] = useState(0);
  const [loadedQuery, setLoadedQuery] = useState("");
  const queryKey = JSON.stringify([nightId, search, filter, cursor, revision]);
  const loading = loadedQuery !== queryKey;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [configure, setConfigure] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [provider, setProvider] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [actionError, setActionError] = useState("");
  const [audit, setAudit] = useState<LaunchAudit[] | null>(null);
  const [auditMore, setAuditMore] = useState(false);
  const [auditBusy, setAuditBusy] = useState(false);
  const refresh = () => { setDetail(null); setRevision(value => value + 1); };
  const event = overview?.event;
  const frozen = !!event && Date.parse(overview!.now) >= Date.parse(event.registration_opens_at);
  const editable = !terminal && (overview ? Date.parse(overview.now) < Date.parse(startsAt) : false) && !event?.cancelled_at;

  useEffect(() => {
    let active = true;
    void supabase.rpc("admin_launch_overview", { p_night: nightId }).then(({ data, error }) => {
      if (!active) return;
      if (error || !data) { setError("Reservation operations could not load. Refresh to try again."); return; }
      const value = data as unknown as LaunchOverview;
      setOverview(value);
      onBookingState({ configured: !!value.event, frozen: !!value.event && Date.parse(value.now) >= Date.parse(value.event.registration_opens_at) });
    });
    return () => { active = false; };
  }, [nightId, revision, onBookingState]);
  useEffect(() => {
    let active = true;
    void supabase.rpc("admin_search_launch_reservations", { p_night: nightId, p_query: search, p_filter: filter, ...(cursor ? { p_after: cursor } : {}) }).then(({ data, error }) => {
      if (!active) return;
      setLoadedQuery(queryKey);
      if (error || !Array.isArray(data)) { setError("Reservations could not load. Refresh to try again."); return; }
      setRows(data as unknown as LaunchReservation[]);
    });
    return () => { active = false; };
  }, [nightId, search, filter, cursor, revision, queryKey]);
  useEffect(() => {
    let active = true;
    if (selected) void supabase.rpc("admin_launch_reservation", { p_id: selected }).then(({ data, error }) => {
      if (!active) return;
      const value = data as unknown as ReservationDetail | null;
      if (error || !value || value.night_id !== nightId) { setError("Reservation unavailable. Refresh the list and try again."); return; }
      setDetail(value);
    });
    return () => { active = false; };
  }, [selected, nightId, revision]);

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
      setAction(null); setAudit(null); refresh();
      setNotice(action === "owner" ? "You are now responsible for following up this refund." : action === "email" ? "Email corrected. Previous management access has expired; the arrival QR is unchanged. No email has been sent." :
        action === "adopt" ? "Stripe refund linked. Its current outcome is shown below." : "Action recorded. Refund processing is asynchronous; a queued request is not a completed refund.");
      if (organizer) onNightChanged();
    } catch (error) { setActionError(error instanceof Error ? error.message : "Action failed. Try again."); }
    finally { setBusy(false); }
  }
  async function loadAudit(more = false) {
    setAuditBusy(true);
    const { data, error } = await supabase.rpc("admin_launch_list", { p_night: nightId, p_kind: "audit", p_after: more ? audit?.at(-1)?.id ?? 0 : 0 });
    setAuditBusy(false);
    if (error || !Array.isArray(data)) { setError("History could not load. Try again."); return; }
    const next = data as unknown as LaunchAudit[];
    setAudit(previous => more ? [...previous ?? [], ...next] : next); setAuditMore(next.length === 100);
  }

  return <section className={styles.root} aria-label="Reservations and deposits">
    <header className={styles.heading}><div><h3>Reservations & deposits</h3><p>Manage bookings and follow each deposit through to its refund.</p></div><button disabled={busy} onClick={() => { setError(""); setAudit(null); refresh(); }}>Refresh</button></header>
    {event && <button type="button" onClick={onOpenArrivals}>Open arrivals</button>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {!overview ? <p role="status">Loading reservation settings…</p> : !event ? <div className={styles.setup}><p>Reservations are not configured for this night.</p>{editable && <button onClick={() => setConfigure(true)}>Set up reservations</button>}</div> : <>
      <div className={styles.settings}><div><strong>{overview.allocations} / {event.capacity} places allocated</strong><p>{money(event.deposit_minor, event.currency)} per person · {event.cancelled_at ? status(event.cancellation_reason) : `Registration opens ${formatVenueInstant(event.registration_opens_at, timezone)}`}</p><p>Booking closes {formatVenueInstant(new Date(Date.parse(startsAt) - 30 * 60_000).toISOString(), timezone)} · Free cancellation until {formatVenueInstant(new Date(Date.parse(startsAt) - 48 * 3600_000).toISOString(), timezone)}</p></div>{editable && <button onClick={() => setConfigure(true)}>{frozen ? "Edit capacity" : "Edit reservation settings"}</button>}</div>
      {frozen && <p className={styles.hint}>Registration has opened. Deposit, currency, policy and schedule are fixed for this event.</p>}
      {overview.finance.map(total => <div key={total.currency} className={styles.finance} aria-label={`${total.currency.toUpperCase()} deposit totals`}>
        {([["Charged", total.charged], ["Refunded", total.refunded], ["Refunds outstanding", total.outstanding], ["Held for attendance", total.held], ["Retained", total.retained]] as const).map(([label, amount]) => <div key={label}><span>{label}</span><strong>{money(amount, total.currency)}</strong></div>)}
        <p>{total.paid_count} paid reservations · {total.anomalies} needing review · {total.awaiting_funds} awaiting Stripe funds. These are deposit totals, before payment fees.</p>
        {total.oldest_unresolved_update && <p>Oldest queued or pending update: {formatVenueInstant(total.oldest_unresolved_update, timezone)}. Use Refresh to check progress.</p>}
        {total.awaiting_funds > 0 && <p className={styles.error}>Funding needed: check the available balance in Stripe and arrange funding with the payment operator. Existing refunds will resume; do not create another refund.</p>}
      </div>)}
      {selected ? <div className={styles.detail}>
        <button onClick={() => { setSelected(null); setError(""); }}>← Reservation list</button>
        {!detail ? <p role="status">Loading reservation…</p> : <>
          <h4>{detail.first_name}</h4><p>{detail.email}</p><p className={styles.reference}>Reservation {detail.id}</p>
          <dl className={styles.states}><div><dt>Booking</dt><dd>{status(detail.state)}</dd></div><div><dt>Payment</dt><dd>{status(detail.payment_state)} · {money(detail.amount_minor, detail.currency)}</dd></div><div><dt>Attendance</dt><dd>{status(detail.arrival)}</dd></div><div><dt>Refund</dt><dd>{detail.refund ? status(detail.refund.state) : "No refund requested"}</dd></div></dl>
          <p className={styles.hint}>Free cancellation deadline: {formatVenueInstant(detail.cancellation_deadline, timezone)}. {detail.cancelled_at && `Cancelled ${formatVenueInstant(detail.cancelled_at, timezone)}; ${detail.cancellation_refundable ? "eligible for refund" : "deposit retained under the cancellation policy"}.`}</p>
          {detail.refund && <div className={styles.refundInfo}><p className={styles.reference}>Follow-up owner: {detail.refund.review_owner ?? "Unassigned"}</p><p>Reason: {status(detail.refund.reason)} · {detail.refund.attempts} processing attempts</p><p>Last update: {formatVenueInstant(detail.refund.updated_at, timezone)}</p>{detail.refund.last_error && <p role="status">{detail.refund.last_error === "insufficient_funds" ? "Awaiting Stripe funds. Fund the existing refund; do not issue another." : `Review required: ${status(detail.refund.last_error)}.`}</p>}<p className={styles.reference}>Stripe refund: {detail.refund.provider_refund_id ?? "Not yet confirmed"}</p></div>}
          {detail.payment.payment_id && <a className={styles.stripeLink} href={`https://dashboard.stripe.com/test/payments/${encodeURIComponent(detail.payment.payment_id)}`} target="_blank" rel="noreferrer">View payment in Stripe sandbox ↗</a>}
          <div className={styles.actions}>
            {detail.refund && detail.refund.state !== "succeeded" && <button onClick={() => openAction("owner")}>Take responsibility for refund</button>}
            {detail.payment_state === "paid" && !detail.refund && <button onClick={() => openAction("refund")}>Refund full deposit</button>}
            {detail.refund && ["failed", "review_needed", "succeeded"].includes(detail.refund.state) && <button onClick={() => openAction("retry")}>Reconcile refund</button>}
            {detail.checkout_work?.state === "review_needed" && <button onClick={() => openAction("checkout")}>Reconcile payment</button>}
            {detail.payment_state === "paid" && <button onClick={() => openAction("email")}>Correct booking email</button>}
            {detail.payment_state === "paid" && !detail.refund?.provider_refund_id && <button onClick={() => openAction("adopt")}>Link Stripe refund</button>}
            {detail.refund?.state === "failed" && detail.refund.provider_refund_id && <button onClick={() => openAction("replace")}>Replace failed refund</button>}
          </div>
          {detail.failed_refund_attempts.length > 0 && <details><summary>Previous failed refund attempts ({detail.failed_refund_attempts.length})</summary>{detail.failed_refund_attempts.map(attempt => <p className={styles.reference} key={attempt.operation_id}>{attempt.provider_refund_id} · {attempt.verification_note} · {formatVenueInstant(attempt.verified_at, timezone)}</p>)}</details>}
        </>}
      </div> : <>
        <form className={styles.search} onSubmit={e => { e.preventDefault(); if (!isValidText(query, 254, false)) { setError("Search must be at most 254 characters."); return; } setCursor(undefined); setSearch(query.trim()); }}>
          <label>Find a reservation<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Email, name or reservation reference" /></label><button type="submit">Search</button>
          <label>Show<select value={filter} onChange={e => { setFilter(e.target.value); setCursor(undefined); }}>{filters.map(value => <option value={value} key={value}>{status(value)}</option>)}</select></label>
        </form>
        {loading ? <p role="status">Loading reservations…</p> : rows.length === 0 ? <p className={styles.empty}>{search || filter !== "all" ? "No reservations match this search." : "No reservations yet."}</p> : <div className={styles.list}>
          {rows.map(row => <button className={styles.row} key={row.id} onClick={() => { setDetail(null); setSelected(row.id); }}><span><strong>{row.first_name}</strong><small>{row.email}</small></span><span>Booking <b>{status(row.state)}</b></span><span>Payment <b>{status(row.payment_state)}</b></span><span>Attendance <b>{status(row.arrival)}</b></span><span>Refund <b>{row.refund_state ? status(row.refund_state) : "Not requested"}</b></span></button>)}
        </div>}
        <div className={styles.pagination}>{cursor && <button onClick={() => setCursor(undefined)}>First page</button>}{rows.length === 100 && !loading && <button onClick={() => setCursor(rows.at(-1)!.id)}>Next 100 reservations</button>}</div>
      </>}
      <details className={styles.history} onToggle={e => { if (e.currentTarget.open && audit === null && !auditBusy) void loadAudit(); }}><summary>Event activity and audit history</summary>
        {audit?.map(item => <div key={item.id}><strong>{status(item.action)}</strong><time>{formatVenueInstant(item.created_at, timezone)}</time><p className={styles.reference}>{item.reservation_id ? `Reservation ${item.reservation_id}` : "Event"} · {item.actor_id ? `Founder ${item.actor_id}` : "Automatic process"}</p><p className={styles.reference}>{Object.entries(item.detail).map(([key, value]) => `${status(key)}: ${String(value)}`).join(" · ")}</p></div>)}
        {audit?.length === 0 && <p>No activity yet.</p>}{auditBusy && <p role="status">Loading history…</p>}{auditMore && <button disabled={auditBusy} onClick={() => void loadAudit(true)}>Load more history</button>}
      </details>
      {!event.cancelled_at && <div className={styles.organizer}><h4>Organizer cancellation or postponement</h4><p>Refund every paid deposit, including deposits retained after a late cancellation. A postponed date requires a new night and new bookings.</p><div className={styles.actions}><button onClick={() => openAction("cancelled")}>Cancel event and refund deposits</button><button onClick={() => openAction("postponed")}>Postpone event and refund deposits</button></div></div>}
    </>}
    {configure && overview && <Configuration overview={overview} timezone={timezone} nightId={nightId} frozen={frozen} onClose={() => setConfigure(false)} onSaved={() => { setConfigure(false); refresh(); }} />}
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
  </section>;
}

function Configuration({ overview, nightId, timezone, frozen, onClose, onSaved }: {
  overview: LaunchOverview; nightId: string; timezone: string; frozen: boolean; onClose: () => void; onSaved: () => void;
}) {
  const event = overview.event;
  const [opens, setOpens] = useState(event ? isoToVenueLocalInput(event.registration_opens_at, timezone) : "");
  const [capacity, setCapacity] = useState(String(event?.capacity ?? 50));
  const [amount, setAmount] = useState(((event?.deposit_minor ?? 1000) / 100).toFixed(2));
  const [currency, setCurrency] = useState(event?.currency ?? (timezone === "America/New_York" ? "usd" : "eur"));
  const [policy, setPolicy] = useState(event?.policy_version ?? "launch-v1");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    const resolved = resolveVenueLocalDateTime(opens, timezone);
    if (!resolved.ok) { setError(resolved.message); return; }
    if (!/^\d{1,6}$/.test(capacity) || Number(capacity) < Math.max(1, overview.allocations) || Number(capacity) > 100000) { setError(`Capacity must be ${Math.max(1, overview.allocations)}–100,000 and cover all allocated places.`); return; }
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || Number(amount) > 999999.99) { setError("Enter a deposit from 0.01 to 999,999.99 with at most two decimal places."); return; }
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(policy)) { setError("Enter a policy version of 1–80 letters, digits, dots, underscores or hyphens."); return; }
    setBusy(true); setError("");
    const result = await supabase.rpc("admin_configure_launch_event", { p_night: nightId, p_opens: frozen ? event!.registration_opens_at : resolved.iso,
      p_capacity: Number(capacity), p_amount: Math.round(Number(amount) * 100), p_currency: currency, p_policy: policy });
    setBusy(false);
    if (result.error) { setError("Settings were refused. Check the opening time, current allocations and whether registration has already opened. Your draft has been kept."); return; }
    onSaved();
  }
  return <WorkspaceDialog title={event ? "Reservation settings" : "Set up reservations"} busy={busy} onClose={onClose}><form className={styles.form} onSubmit={save}>
    <p>Times are in {timezone}. Registration closes 30 minutes before entry opens.</p>
    <label>Registration opens<input type="datetime-local" value={opens} disabled={frozen} onChange={e => setOpens(e.target.value)} required /></label>
    <label>Reservation capacity<input inputMode="numeric" value={capacity} onChange={e => setCapacity(e.target.value)} required /></label>
    <label>Deposit amount<input inputMode="decimal" value={amount} disabled={frozen} onChange={e => setAmount(e.target.value)} required /></label>
    <label>Currency<select value={currency} disabled={frozen} onChange={e => setCurrency(e.target.value as "eur" | "usd")}><option value="eur">EUR</option><option value="usd">USD</option></select></label>
    <label>Policy version<input value={policy} disabled={frozen} onChange={e => setPolicy(e.target.value)} required /></label>
    <p className={styles.hint}>{frozen ? "Only capacity can change once registration opens." : "Opening registration freezes the deposit, currency, policy and event schedule."}</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}<button disabled={busy} type="submit">{busy ? "Saving…" : "Save reservation settings"}</button>
  </form></WorkspaceDialog>;
}
