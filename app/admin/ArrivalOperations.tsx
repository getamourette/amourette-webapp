"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, ArrowLeft, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isRecord, isValidText } from "@/lib/input-validation";
import { formatVenueInstant } from "@/lib/venue-time";
import { arrivalAvailabilityText, arrivalRefundText, isArrivalCode, readArrivalSearch, readArrivalSummary, readStaffArrival,
  type ArrivalSearchRow, type ArrivalSummary, type StaffArrival } from "@/lib/launch-arrivals";
import { ArrivalCamera } from "./ArrivalCamera";
import styles from "./ArrivalOperations.module.css";

function PreviousAttendance({ value, timezone }: { value: unknown; timezone: string }) {
  if (!isRecord(value) || !value.outcome) return null;
  return <div className={styles.previous}><p>Previous attendance: {value.outcome === "verified" ? "Verified" : "Absent"}</p>
    {typeof value.verified_at === "string" && Number.isFinite(Date.parse(value.verified_at)) && <p>Verified on {formatVenueInstant(value.verified_at, timezone)}</p>}
    {typeof value.verified_by === "string" && <p className={styles.reference}>Founder {value.verified_by}</p>}
    {typeof value.note === "string" && <p>Previous note: {value.note}</p>}
  </div>;
}

export function ArrivalOperations({ nightId, venueName, timezone, onClose, embedded = false, onRefresh }: {
  nightId: string; venueName: string; timezone: string; onClose: () => void; embedded?: boolean; onRefresh?: () => void;
}) {
  const [summary, setSummary] = useState<ArrivalSummary | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [camera, setCamera] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ArrivalSearchRow[] | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [searchError, setSearchError] = useState("");
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<StaffArrival | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [note, setNote] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const alive = useRef(true);
  const operation = useRef(false);
  const selectionRequest = useRef(0);
  const searchRequest = useRef(0);
  const summaryRequest = useRef(0);
  const screenHeading = useRef<HTMLHeadingElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);

  const refreshSummary = useCallback(async () => {
    const request = ++summaryRequest.current;
    try {
      const { data, error } = await supabase.rpc("admin_launch_arrival_summary", { p_night: nightId }).abortSignal(AbortSignal.timeout(15000));
      if (error) throw error;
      const value = readArrivalSummary(data);
      if (alive.current && request === summaryRequest.current) { setSummary(value); setSummaryError(""); }
    } catch { if (alive.current && request === summaryRequest.current) setSummaryError("Counts could not refresh. The last successful counts may be out of date."); }
  }, [nightId]);
  useEffect(() => {
    alive.current = true;
    if (!embedded) screenHeading.current?.focus();
    const initial = setTimeout(() => void refreshSummary(), 0);
    const interval = setInterval(() => { if (!document.hidden) void refreshSummary(); }, 15000);
    const foreground = () => { if (!document.hidden) void refreshSummary(); };
    document.addEventListener("visibilitychange", foreground);
    window.addEventListener("online", foreground);
    return () => { alive.current = false; clearTimeout(initial);
      clearInterval(interval); document.removeEventListener("visibilitychange", foreground); window.removeEventListener("online", foreground); };
  }, [refreshSummary, embedded]);
  useEffect(() => { if (selected && !loading) detailHeading.current?.focus(); }, [selected, loading]);

  const inspect = useCallback(async (source: { id: string } | { secret: string }) => {
    const { data, error } = await supabase.rpc("admin_inspect_launch_arrival", { p_night: nightId,
      ...("id" in source ? { p_id: source.id } : { p_secret: source.secret }) }).abortSignal(AbortSignal.timeout(15000));
    if (error) throw error;
    const value = readStaffArrival(data, nightId);
    if ("id" in source && value.id !== source.id) throw new Error("Wrong arrival record");
    return value;
  }, [nightId]);
  const choose = useCallback(async (source: { id: string } | { secret: string }) => {
    if (operation.current) return;
    const request = ++selectionRequest.current;
    setCamera(false); setSelected(null); setSecret(null); setError(""); setNotice(""); setUncertain(false);
    setCorrecting(false); setConfirmed(false); setNote("");
    if ("secret" in source && !isArrivalCode(source.secret)) { setLoading(false); setError("This is not a personal reservation QR. Use the guest’s confirmation QR or manual lookup."); return; }
    setLoading(true);
    try {
      const value = await inspect(source);
      if (!alive.current || request !== selectionRequest.current) return;
      setSelected(value); setSecret("secret" in source ? source.secret : null);
      if (value.arrival === "verified") setNotice("Already verified. The original verification is shown below; no new refund was requested.");
    } catch {
      if (alive.current && request === selectionRequest.current) setError("Reservation unavailable. Check your connection and the selected night, then scan again or use manual lookup. No arrival was confirmed by this lookup.");
    } finally { if (alive.current && request === selectionRequest.current) setLoading(false); }
  }, [inspect]);
  const scanned = useCallback((code: string) => { void choose({ secret: code }); }, [choose]);
  const stopCamera = useCallback(() => setCamera(false), []);
  const clearSelection = () => { selectionRequest.current++; setSelected(null); setSecret(null); setError(""); setNotice(""); setNote("");
    setCorrecting(false); setConfirmed(false); setUncertain(false); setLoading(false); };

  async function search(event?: FormEvent, after?: string) {
    event?.preventDefault();
    if (operation.current) return;
    if (!isValidText(query, 254, false)) { setSearchError("Use at most 254 characters for the name, email or reservation reference."); return; }
    const request = ++searchRequest.current;
    setSearching(true); setSearchError(""); setRows(null); setCamera(false);
    try {
      const { data, error } = await supabase.rpc("admin_search_launch_reservations", { p_night: nightId, p_query: query.trim(), p_filter: "all",
        ...(after ? { p_after: after } : {}) }).abortSignal(AbortSignal.timeout(15000));
      if (error) throw error;
      const value = readArrivalSearch(data, nightId);
      if (alive.current && request === searchRequest.current) { setRows(value); setCursor(after); }
    } catch { if (alive.current && request === searchRequest.current) setSearchError("Reservations could not load. Check your connection and try again."); }
    finally { if (alive.current && request === searchRequest.current) setSearching(false); }
  }
  async function reloadSelection() {
    if (!selected || operation.current) return;
    operation.current = true; setBusy(true); setError("");
    try {
      const value = await inspect({ id: selected.id });
      if (!alive.current) return;
      setSelected(value); setUncertain(false); setCorrecting(false); setConfirmed(false);
      setRows(previous => previous?.map(row => row.id === value.id ? { ...row, ...value } : row) ?? null);
      setNotice("Current server record loaded. Review it before taking another action.");
      void refreshSummary(); onRefresh?.();
    } catch { if (alive.current) { setUncertain(true); setError("The current record could not be checked. Reconnect and refresh the result before continuing."); } }
    finally { operation.current = false; if (alive.current) setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected || operation.current || uncertain) return;
    if ((correcting || !secret) && !isValidText(note, 500)) { setError("Add a verification note of 1–500 characters."); return; }
    if (correcting && !confirmed) return;
    operation.current = true; setBusy(true); setError(""); setNotice("");
    const id = selected.id;
    let commandSucceeded = false;
    try {
      if (correcting) {
        const { error } = await supabase.rpc("admin_correct_launch_arrival", { p_id: id, p_night: nightId,
          p_expected_revision: selected.revision, p_verified: selected.arrival !== "verified", p_note: note.trim() }).abortSignal(AbortSignal.timeout(15000));
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("admin_confirm_launch_arrival", { p_id: id, p_night: nightId, p_expected_revision: selected.revision,
          p_method: secret ? "qr" : "manual", p_secret: secret, p_note: secret ? null : note.trim() }).abortSignal(AbortSignal.timeout(15000));
        if (error) throw error;
      }
      commandSucceeded = true;
    } catch { /* A lost response may follow a committed action. Always read back. */ }
    try {
      const value = await inspect({ id });
      if (!alive.current) return;
      setSelected(value); setUncertain(false); setCorrecting(false); setConfirmed(false);
      setRows(previous => previous?.map(row => row.id === value.id ? { ...row, ...value } : row) ?? null);
      if (commandSucceeded) { setNote(""); setNotice(correcting ? "Attendance corrected. Any refund already requested continues unchanged." : "Arrival verified. The refund is handled separately; you can continue scanning."); }
      else setError("The action was refused or its response was lost. The current server record is shown below. Review it before trying again.");
    } catch {
      if (alive.current) { setUncertain(true); setError("The result could not be checked. This action may have completed. Reconnect and refresh the result before continuing."); }
    } finally { operation.current = false; if (alive.current) { setBusy(false); void refreshSummary(); onRefresh?.(); } }
  }

  const canVerify = selected?.availability === "open" && selected.arrival !== "verified";
  return <section className={styles.root} aria-label="Arrival verification">
    <header className={styles.heading}>
      <button type="button" disabled={busy} onClick={onClose}><ArrowLeft size={16} aria-hidden="true" /> Reservations & deposits</button>
      <p className={styles.eyebrow}>{venueName}</p><h3 ref={screenHeading} tabIndex={-1}>Arrivals</h3>
      {summary && <p>{formatVenueInstant(summary.starts_at, timezone)} · {timezone}<br />Until {formatVenueInstant(summary.ends_at, timezone)}</p>}
      <p>Verify guests here, including outside if the bar is full. This records attendance for their deposit refund.</p>
    </header>
    <div className={styles.counts} aria-label="Reservation attendance counts">
      <div><strong>{summary?.verified ?? "…"}</strong><span>Verified</span></div>
      <div><strong>{summary ? summary.ended ? summary.absent : summary.remaining : "…"}</strong><span>{summary?.ended ? "Absent" : "Remaining"}</span></div>
      <div><strong>{summary?.cancelled_count ?? "…"}</strong><span>Cancelled bookings</span></div>
    </div>
    {summary?.cancelled && <p className={styles.warning}>This event was cancelled or postponed.</p>}
    {summary?.ended && !summary.cancelled && <p className={styles.warning}>This event has ended. Use manual lookup for attendance history or a founder correction.</p>}
    {summaryError && <p role="alert" className={styles.error}>{summaryError}</p>}
    <div className={styles.refresh}><span>{summary ? `Counts checked ${formatVenueInstant(summary.now, timezone)}` : "Loading attendance counts…"}</span><button type="button" onClick={() => void refreshSummary()}><RefreshCw size={14} aria-hidden="true" /> Refresh counts</button></div>
    <div className={styles.tools}>
      <button ref={nextButton} type="button" className={styles.primary} disabled={busy || loading} onClick={() => { clearSelection(); setCamera(true); }}><Camera size={18} aria-hidden="true" /> Scan personal QR</button>
      <p>Scanning identifies the booking. You confirm arrival in the next step.</p>
    </div>
    {camera && <ArrivalCamera onCode={scanned} onStop={stopCamera} />}
    {loading && <p role="status">Checking reservation…</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {selected && <article className={styles.detail} aria-busy={busy}>
      <p className={styles.eyebrow}>{uncertain ? "Result needs checking" : selected.arrival === "verified" ? "Verified" : selected.availability === "open" ? "Check guest details" : "Reservation record"}</p>
      <h4 ref={detailHeading} tabIndex={-1}>{selected.first_name}</h4>
      <p className={styles.identity}>{selected.email}</p><p className={styles.reference}>Reservation {selected.id}</p>
      <dl className={styles.states}><div><dt>Attendance</dt><dd>{selected.arrival === "verified" ? "Verified" : selected.arrival === "no_show" ? "Absent" : "Not verified"}</dd></div>
        <div><dt>Reservation</dt><dd>{selected.state}</dd></div></dl>
      {selected.verified_at && <p>Verified on {formatVenueInstant(selected.verified_at, timezone)} · {selected.method === "qr" ? "QR scan" : "Manual verification"}</p>}
      {selected.verified_by && <p className={styles.reference}>Founder {selected.verified_by}</p>}
      {selected.note && <p>Verification note: {selected.note}</p>}
      <p className={styles.refund}>{arrivalRefundText(selected.refund_state)}</p>
      {(selected.arrival !== "verified" || selected.availability !== "open") && <p>{arrivalAvailabilityText[selected.availability]}</p>}
      {!uncertain && (canVerify || correcting) && <form onSubmit={submit} className={styles.form}>
        {correcting && <><h5>{selected.arrival === "verified" ? "Correct mistaken validation" : "Record missed arrival"}</h5>
          <p>{selected.arrival === "verified" ? "Remove this attendance verification. Any refund already requested will continue, even if still queued. Issued funds will not be collected back." : "Confirm that this guest actually attended. This updates attendance and requests any outstanding full refund. The record will show when you made this correction."}</p></>}
        {(correcting || !secret) && <div><label htmlFor="arrival-note">Verification note</label><textarea id="arrival-note" rows={3} value={note} disabled={busy} onChange={event => setNote(event.target.value)} aria-describedby="arrival-note-help" /></div>}
        {(correcting || !secret) && <p id="arrival-note-help" className={styles.hint}>1–500 characters. Explain how you verified this guest; a first name alone is insufficient.</p>}
        {correcting && <label className={styles.confirm}><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />I confirm this attendance correction and understand that existing refunds continue.</label>}
        <button type="submit" className={styles.primary} disabled={busy || (correcting && !confirmed)}>{busy ? "Checking result…" : correcting ? "Confirm correction" : "Confirm arrival"}</button>
        {correcting && <button type="button" disabled={busy} onClick={() => { setCorrecting(false); setConfirmed(false); }}>Keep current attendance</button>}
        {!correcting && <p className={styles.hint}>Confirms attendance and requests the full deposit refund. Admission and visible room presence are separate.</p>}
      </form>}
      {!uncertain && !correcting && selected.can_correct && <button type="button" disabled={busy} onClick={() => { setCorrecting(true); setConfirmed(false); setError(""); }}>{selected.arrival === "verified" ? "Correct mistaken validation" : "Correct a missed arrival"}</button>}
      <div className={styles.actions}><button type="button" disabled={busy} onClick={() => void reloadSelection()}>Refresh result</button><button type="button" disabled={busy} onClick={() => { clearSelection(); nextButton.current?.focus(); }}>Next guest</button></div>
      {selected.history.length > 0 && <details className={styles.history}><summary>Attendance history</summary>
        <p className={styles.hint}>Latest 20 actions. The full audit is in Reservations & deposits.</p>
        {selected.history.map(item => <div key={item.id}><strong>{item.action === "arrival_verified" ? "Arrival verified" : item.detail.verified === true ? "Missed arrival corrected" : "Mistaken validation corrected"}</strong>
          <p>{formatVenueInstant(item.created_at, timezone)}</p><p className={styles.reference}>Founder {item.actor_id ?? "no longer available"}</p>
          {typeof item.detail.note === "string" && <p>{item.detail.note}</p>}<PreviousAttendance value={item.detail.previous} timezone={timezone} /></div>)}
      </details>}
    </article>}
    <section className={styles.lookup} aria-label="Manual arrival lookup"><h4>No QR or phone?</h4><p>Find the booking, then check the guest’s email or reservation reference.</p>
      <form onSubmit={event => void search(event)} className={styles.form}><label>Name, email or reservation reference<input value={query} disabled={busy} onChange={event => { setQuery(event.target.value); searchRequest.current++; setSearching(false); setRows(null); setCursor(undefined); }} /></label>
        <button type="submit" disabled={busy || searching}>{searching ? "Searching…" : "Find guest"}</button></form>
      {searchError && <p role="alert" className={styles.error}>{searchError}</p>}
      {rows?.length === 0 && <p>No reservations match this search.</p>}
      {rows && <div className={styles.list}>{rows.map(row => <button type="button" key={row.id} disabled={busy || loading} className={styles.row} onClick={() => void choose({ id: row.id })}>
        <strong>{row.first_name}</strong><span>{row.email}</span><small>Reservation {row.id}</small><span>{row.state === "confirmed" ? row.arrival === "verified" ? "Verified" : row.arrival === "no_show" ? "Absent" : "Not verified" : row.state}</span></button>)}</div>}
      <div className={styles.actions}>{cursor && <button type="button" disabled={busy || searching} onClick={() => void search()}>First results</button>}{rows?.length === 100 && <button type="button" disabled={busy || searching} onClick={() => void search(undefined, rows.at(-1)!.id)}>Next 100 results</button>}</div>
    </section>
  </section>;
}
