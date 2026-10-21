"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { LaunchReservation, ReservationDetail } from "@/lib/launch-operations";
import { isValidText } from "@/lib/input-validation";
import { formatVenueInstant } from "@/lib/venue-time";
import { useReservationAction } from "./useReservationAction";
import { money, status } from "./reservation-format";
import styles from "./ReservationOperations.module.css";
const filters = ["all", "confirmed", "holding", "cancelled", "expired", "paid", "unpaid", "verified", "no_show", "refund_due", "refunded", "attention"];

export function ReservationOperations({ nightId, timezone, revision, onRefresh, onNightChanged }: {
  nightId: string; timezone: string; revision: number; onRefresh: () => void; onNightChanged: () => void;
}) {
  const [rows, setRows] = useState<LaunchReservation[]>([]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [cursor, setCursor] = useState<string | undefined>();
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReservationDetail | null>(null);
  const [loadedQuery, setLoadedQuery] = useState("");
  const queryKey = JSON.stringify([nightId, search, filter, cursor, revision]);
  const loading = loadedQuery !== queryKey;
  const [error, setError] = useState("");
  const refresh = () => { setDetail(null); onRefresh(); };
  const { busy, notice, openAction, dialog } = useReservationAction({ nightId, detail, refresh, onNightChanged });
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

  return <section className={styles.root} aria-label="Reservations and deposits">
    <header className={styles.heading}><div><h3>Reservations & deposits</h3><p>Manage bookings and follow each deposit through to its refund.</p></div><button disabled={busy} onClick={() => { setError(""); refresh(); }}>Refresh</button></header>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
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
    {dialog}
  </section>;
}
