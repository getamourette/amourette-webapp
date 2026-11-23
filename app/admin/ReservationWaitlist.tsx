"use client";
import { useEffect, useRef, useState } from "react";
import { productionEventUrl } from "@/lib/admin-dashboard";
import { supabase } from "@/lib/supabase";
import { parseWaitlist, type WaitlistEntry } from "@/lib/launch-waitlist";
import { formatVenueInstant } from "@/lib/venue-time";
import styles from "./ReservationOperations.module.css";

// Every state has a fixed button slot. A button never moves or turns into
// another action after a change, so a repeated click at the same spot lands
// on the now-disabled current state instead of changing the entry again.
const followUps = [["waiting", "Return to Waiting"], ["contacted", "Mark Contacted"], ["closed", "Close entry"]] as const;
type Feedback = { id: number; text: string; error: boolean };

// The night page does not remount this panel on window focus: founders switch
// to the mailbox and back between actions, and a remount emptied the list,
// scrolled the page and moved rows under the next click (#404). The list loads
// when the tab opens and on "Refresh waitlist"; stale rows are refused by the
// server's expected-state guard.
async function fetchWaitlist(nightId: string, after: number) {
  const result = await supabase.rpc("admin_launch_list", { p_night: nightId, p_kind: "waitlist", p_after: after });
  if (result.error) throw result.error;
  const next = parseWaitlist(result.data);
  if (next.length && next[0].id <= after) throw new Error("invalid_waitlist");
  return next;
}

export function ReservationWaitlist({ nightId, timezone, readOnly = false }: { nightId: string; timezone: string; readOnly?: boolean }) {
  const [rows, setRows] = useState<WaitlistEntry[]>([]); const [loaded, setLoaded] = useState(false);
  // The first page is requested as soon as the tab opens.
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const lock = useRef(true);
  const [more, setMore] = useState(false); const [error, setError] = useState("");
  const [notice, setNotice] = useState(""); const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const busy = loading || saving;
  async function load(append = false) {
    if (lock.current) return; lock.current = true; setLoading(true); setError(""); setNotice("");
    try {
      const next = await fetchWaitlist(nightId, append ? rows.at(-1)?.id ?? 0 : 0);
      setRows(previous => append ? [...previous, ...next] : next); setMore(next.length === 100); setLoaded(true); setUncertain(false); setFeedback(null);
    } catch { setError("Waitlist could not load. Refresh before changing follow-up."); setUncertain(true); }
    finally { lock.current = false; setLoading(false); }
  }
  useEffect(() => {
    let active = true;
    fetchWaitlist(nightId, 0).then(next => {
      if (!active) return;
      setRows(next); setMore(next.length === 100); setLoaded(true);
    }, () => {
      if (!active) return;
      setError("Waitlist could not load. Refresh before changing follow-up."); setUncertain(true);
    }).finally(() => { if (active) { lock.current = false; setLoading(false); } });
    return () => { active = false; };
  }, [nightId]);
  async function update(row: WaitlistEntry, state: WaitlistEntry["state"]) {
    if (lock.current || uncertain || row.state === state) return; lock.current = true; setSaving(true); setError(""); setNotice(""); setFeedback(null);
    try {
      const result = await supabase.rpc("admin_follow_up_launch_waitlist", { p_night: nightId, p_id: row.id, p_expected: row.state, p_state: state });
      if (result.error) throw result.error;
      setRows(previous => previous.map(item => item.id === row.id ? { ...item, state } : item));
      setFeedback({ id: row.id, text: "Follow-up recorded. No email sent, no place allocated.", error: false });
    } catch { setUncertain(true); setFeedback({ id: row.id, text: "The outcome is uncertain or another founder changed this entry. Refresh before trying again.", error: true }); }
    finally { lock.current = false; setSaving(false); }
  }
  return <section aria-label="Manual waitlist" className={`${styles.root} ${styles.history}`}>
    <h3>Manual waitlist</h3>
    <p>Contact waiting guests in signup order from hello@getamourette.com. Copy their email into that mailbox and share the ordinary event link. Opening an email draft does not send it or mark anyone contacted.</p>
    <p>No place is held or guaranteed. Guests pay only when booking; registration closes 30 minutes before entry opens. If someone does not reply, founders decide when to contact the next person.</p>
    <p>Mark Contacted after sending. Close after booking, refusal or abandonment; booking is checked manually. Return an entry to Waiting if needed; its original signup order is preserved.</p>
    <p className={styles.reference}>Booking link: <a href={productionEventUrl(nightId)} target="_blank" rel="noreferrer">{productionEventUrl(nightId)}</a> <button onClick={() => { void navigator.clipboard.writeText(productionEventUrl(nightId)).then(() => setNotice("Booking link copied."), () => setError("Copy the event link from its page address.")); }}>Copy booking link</button></p>
    <button disabled={busy} onClick={() => void load()}>Refresh waitlist</button>
    {loading && <p role="status">Loading waitlist…</p>}{error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status">{notice}</p>}
    {loaded && !rows.length && <p>No waitlist signups yet.</p>}
    <ol className={styles.list}>{rows.map(row => <li className={styles.detail} key={row.id}>
      <strong className={styles.reference}>{row.email}</strong><p>Status: {row.state}</p><p>{row.locale.toUpperCase()} · Signed up {formatVenueInstant(row.created_at, timezone)}</p>
      <div className={styles.actions}>
        <a className={styles.stripeLink} href={`mailto:${row.email}?subject=${encodeURIComponent("Amourette reservation availability")}`}>Open email draft</a>
        {!readOnly && followUps.map(([state, label]) => <button disabled={busy || uncertain || state === row.state} key={state} onClick={() => void update(row, state)}>{label}</button>)}
      </div>
      {/* A reserved slot: the message appears without pushing later rows under the next click. */}
      {!readOnly && <p role={feedback?.id === row.id && feedback.error ? "alert" : "status"} className={`${styles.followUp} ${feedback?.id === row.id && feedback.error ? styles.error : ""}`}>{feedback?.id === row.id ? feedback.text : ""}</p>}
    </li>)}</ol>
    {more && <button disabled={busy || uncertain} onClick={() => void load(true)}>Load next 100 waitlist entries</button>}
  </section>;
}
