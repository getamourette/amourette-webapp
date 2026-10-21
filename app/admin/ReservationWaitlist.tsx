"use client";
import { useRef, useState } from "react";
import { productionEventUrl } from "@/lib/admin-dashboard";
import { supabase } from "@/lib/supabase";
import { parseWaitlist, type WaitlistEntry } from "@/lib/launch-waitlist";
import { formatVenueInstant } from "@/lib/venue-time";
import styles from "./ReservationOperations.module.css";

export function ReservationWaitlist({ nightId, timezone, readOnly = false }: { nightId: string; timezone: string; readOnly?: boolean }) {
  const [rows, setRows] = useState<WaitlistEntry[]>([]); const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [more, setMore] = useState(false); const [error, setError] = useState("");
  const [notice, setNotice] = useState(""); const [uncertain, setUncertain] = useState(false);
  async function load(append = false) {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try {
      const after = append ? rows.at(-1)?.id ?? 0 : 0;
      const result = await supabase.rpc("admin_launch_list", { p_night: nightId, p_kind: "waitlist", p_after: after });
      if (result.error) throw result.error;
      const next = parseWaitlist(result.data);
      if (next.length && next[0].id <= after) throw new Error("invalid_waitlist");
      setRows(previous => append ? [...previous, ...next] : next); setMore(next.length === 100); setLoaded(true); setUncertain(false);
    } catch { setError("Waitlist could not load. Refresh before changing follow-up."); setUncertain(true); }
    finally { lock.current = false; setBusy(false); }
  }
  async function update(row: WaitlistEntry, state: WaitlistEntry["state"]) {
    if (lock.current || uncertain) return; lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const result = await supabase.rpc("admin_follow_up_launch_waitlist", { p_night: nightId, p_id: row.id, p_expected: row.state, p_state: state });
      if (result.error) throw result.error;
      setRows(previous => previous.map(item => item.id === row.id ? { ...item, state } : item));
      setNotice("Follow-up recorded. No email was sent and no place was allocated.");
    } catch { setUncertain(true); setError("The outcome is uncertain or another founder changed this entry. Refresh before trying again."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <details open className={`${styles.root} ${styles.history}`} onToggle={e => { if (e.currentTarget.open && !loaded) void load(); }}>
    <summary>Manual waitlist</summary>
    <p>Contact waiting guests in signup order from hello@getamourette.com. Copy their email into that mailbox and share the ordinary event link. Opening an email draft does not send it or mark anyone contacted.</p>
    <p>No place is held or guaranteed. Guests pay only when booking; registration closes 30 minutes before entry opens. If someone does not reply, founders decide when to contact the next person.</p>
    <p>Mark Contacted after sending. Close after booking, refusal or abandonment; booking is checked manually. Return an entry to Waiting if needed; its original signup order is preserved.</p>
    <p className={styles.reference}>Booking link: <a href={productionEventUrl(nightId)} target="_blank" rel="noreferrer">{productionEventUrl(nightId)}</a> <button onClick={() => { void navigator.clipboard.writeText(productionEventUrl(nightId)).then(() => setNotice("Booking link copied."), () => setError("Copy the event link from its page address.")); }}>Copy booking link</button></p>
    <button disabled={busy} onClick={() => void load()}>Refresh waitlist</button>
    {busy && <p role="status">Loading waitlist…</p>}{error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status">{notice}</p>}
    {loaded && !rows.length && <p>No waitlist signups yet.</p>}
    <ol className={styles.list}>{rows.map(row => <li className={styles.detail} key={row.id}>
      <strong className={styles.reference}>{row.email}</strong><p>{row.state} · {row.locale.toUpperCase()} · Signed up {formatVenueInstant(row.created_at, timezone)}</p>
      <div className={styles.actions}>
        <a className={styles.stripeLink} href={`mailto:${row.email}?subject=${encodeURIComponent("Amourette reservation availability")}`}>Open email draft</a>
        {(["waiting", "contacted", "closed"] as const).filter(state => !readOnly && state !== row.state).map(state => <button disabled={busy || uncertain} key={state} onClick={() => void update(row, state)}>{state === "waiting" ? "Return to Waiting" : state === "contacted" ? "Mark Contacted" : "Close entry"}</button>)}
      </div>
    </li>)}</ol>
    {more && <button disabled={busy || uncertain} onClick={() => void load(true)}>Load next 100 waitlist entries</button>}
  </details>;
}
