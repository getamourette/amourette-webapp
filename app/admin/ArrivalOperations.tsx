"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, ArrowLeft, RefreshCw, CircleCheck, CircleCheckBig, TriangleAlert, CircleX, CircleHelp, ScanLine, type LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isRecord, isValidText } from "@/lib/input-validation";
import { formatVenueInstant } from "@/lib/venue-time";
import { arrivalAvailabilityText, arrivalLookupOutcome, arrivalRefusalVerdict, arrivalVerdict, arrivalVerdictVibration, arrivalLookupText, arrivalNotFoundText, arrivalOtherNightText, arrivalRefundText, isArrivalCode,
  nearestOtherNights, otherNightLookupLimit, readNightDates, readArrivalSearch, readArrivalSummary, readStaffArrival,
  type ArrivalSearchRow, type ArrivalSummary, type ArrivalVerdict, type ArrivalVerdictTone, type StaffArrival } from "@/lib/launch-arrivals";
import { ArrivalCamera, type ArrivalSnapshot } from "./ArrivalCamera";
import styles from "./ArrivalOperations.module.css";

function PreviousAttendance({ value, timezone }: { value: unknown; timezone: string }) {
  if (!isRecord(value) || !value.outcome) return null;
  return <div className={styles.previous}><p>Previous attendance: {value.outcome === "verified" ? "Verified" : "Absent"}</p>
    {typeof value.verified_at === "string" && Number.isFinite(Date.parse(value.verified_at)) && <p>Verified on {formatVenueInstant(value.verified_at, timezone)}</p>}
    {typeof value.verified_by === "string" && <p className={styles.reference}>Founder {value.verified_by}</p>}
    {typeof value.note === "string" && <p>Previous note: {value.note}</p>}
  </div>;
}

// The door verdict (#520): colour, icon and one short line, readable at arm's length.
const verdictIcons: Record<ArrivalVerdictTone, LucideIcon> = { go: CircleCheck, done: CircleCheckBig, wait: TriangleAlert, stop: CircleX, unchecked: CircleHelp };
function Verdict({ verdict, line, titleRef }: { verdict: ArrivalVerdict; line?: React.ReactNode; titleRef?: React.Ref<HTMLParagraphElement> }) {
  const Icon = verdictIcons[verdict.tone];
  return <div className={`${styles.verdict} ${styles[verdict.tone]}`} data-verdict={verdict.tone}>
    <Icon size={44} strokeWidth={2.25} aria-hidden="true" />
    <div><p ref={titleRef} tabIndex={-1} className={styles.verdictTitle}>{verdict.title}</p>{line}</div>
  </div>;
}
// How long the frozen frame stays after a read; the lookup runs during it (#534).
const captureHold = 350;
function buzz(tone: ArrivalVerdictTone) { try { navigator.vibrate?.(arrivalVerdictVibration[tone]); } catch { /* unsupported */ } }

export function ArrivalOperations({ nightId, nightOpensAt, venueId, venueName, timezone, onClose, embedded = false, onRefresh, focusMode }: {
  nightId: string; nightOpensAt: string; venueId: string; venueName: string; timezone: string; onClose: () => void; embedded?: boolean; onRefresh?: () => void; focusMode?: "scan" | "lookup";
}) {
  const [summary, setSummary] = useState<ArrivalSummary | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [camera, setCamera] = useState(focusMode === "scan");
  const [lookup, setLookup] = useState(focusMode === "lookup");
  const lookupInput = useRef<HTMLInputElement>(null);
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
  // A code the server refused, or could not check, shown as a verdict (#520).
  const [refusal, setRefusal] = useState<(ArrivalVerdict & { text: string }) | null>(null);
  const [fromScan, setFromScan] = useState(false);
  const [justConfirmed, setJustConfirmed] = useState(false);
  // The read moment (#534): the frozen frame stays briefly while the lookup already runs.
  const [capture, setCapture] = useState<ArrivalSnapshot | null>(null);
  const [holding, setHolding] = useState(false);
  const captureTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [notice, setNotice] = useState("");
  const [note, setNote] = useState("");
  const [correcting, setCorrecting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  // Leaving an open, unconfirmed guest waits for an explicit Confirm or Skip (#474).
  const [leaving, setLeaving] = useState<{ run: () => void } | null>(null);
  const alive = useRef(true);
  const operation = useRef(false);
  const selectionRequest = useRef(0);
  const searchRequest = useRef(0);
  const summaryRequest = useRef(0);
  const screenHeading = useRef<HTMLHeadingElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const leavingHeading = useRef<HTMLHeadingElement>(null);
  const refusalTitle = useRef<HTMLParagraphElement>(null);

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
    if (!embedded || focusMode) screenHeading.current?.focus();
    const initial = setTimeout(() => void refreshSummary(), 0);
    const interval = setInterval(() => { if (!document.hidden) void refreshSummary(); }, 15000);
    const foreground = () => { if (!document.hidden) void refreshSummary(); };
    document.addEventListener("visibilitychange", foreground);
    window.addEventListener("online", foreground);
    window.addEventListener("focus", foreground);
    return () => { alive.current = false; clearTimeout(initial);
      clearInterval(interval); document.removeEventListener("visibilitychange", foreground); window.removeEventListener("online", foreground); window.removeEventListener("focus", foreground); };
  }, [refreshSummary, embedded, focusMode]);
  useEffect(() => { if (focusMode && lookup && !selected) lookupInput.current?.focus(); }, [focusMode, lookup, selected]);
  useEffect(() => { if (selected && !loading && !holding) detailHeading.current?.focus(); }, [selected, loading, holding]);
  useEffect(() => () => clearTimeout(captureTimer.current), []);
  useEffect(() => { if (refusal && !holding) refusalTitle.current?.focus(); }, [refusal, holding]);
  useEffect(() => { if (leaving) { leavingHeading.current?.focus(); leavingHeading.current?.scrollIntoView({ block: "nearest" }); } }, [leaving]);

  const inspect = useCallback(async (source: { id: string } | { secret: string }, night = nightId) => {
    const { data, error, status } = await supabase.rpc("admin_inspect_launch_arrival", { p_night: night,
      ...("id" in source ? { p_id: source.id } : { p_secret: source.secret }) }).abortSignal(AbortSignal.timeout(15000));
    if (error) throw { message: error.message, code: error.code, status };
    const value = readStaffArrival(data, night);
    if ("id" in source && value.id !== source.id) throw new Error("Wrong arrival record");
    return value;
  }, [nightId]);
  // A code refused for this night may belong to another night of the same venue (#403).
  // The founder may already open those nights, so the existing founder lookup is reused
  // per night; it only reads. "No match" is claimed only when every lookup answered.
  const otherNightReason = useCallback(async (code: string, current: () => boolean) => {
    const nights = (before: boolean) => supabase.from("venue_nights").select("id,waiting_opens_at").eq("venue_id", venueId).neq("id", nightId)
      [before ? "lt" : "gte"]("waiting_opens_at", nightOpensAt).order("waiting_opens_at", { ascending: !before })
      .limit(otherNightLookupLimit).abortSignal(AbortSignal.timeout(15000));
    const [earlier, later] = await Promise.all([nights(true), nights(false)]);
    const listed = [earlier, later].find(result => result.error);
    const refused = (reason: Parameters<typeof arrivalRefusalVerdict>[0], text: string) => ({ ...arrivalRefusalVerdict(reason), text });
    if (listed) { const outcome = listed.status === 0 ? "offline" : "failed"; return refused(outcome, arrivalLookupText[outcome]); }
    const candidates = nearestOtherNights([...readNightDates(earlier.data), ...readNightDates(later.data)], nightId, nightOpensAt);
    if (!current()) return null;
    // The first night that knows the code answers the door at once; the others are not awaited.
    const unanswered: ("offline" | "failed")[] = [];
    const match = await new Promise<{ night: typeof candidates[number]; value: StaffArrival } | null>(resolve => {
      let pending = candidates.length;
      if (!pending) resolve(null);
      for (const night of candidates) inspect({ secret: code }, night.id).then(value => resolve({ night, value }), failure => {
        const outcome = arrivalLookupOutcome(failure);
        if (outcome !== "refused") unanswered.push(outcome);
      }).finally(() => { if (--pending === 0) resolve(null); });
    });
    if (match) return refused(match.value.availability, arrivalOtherNightText(match.value.availability, formatVenueInstant(match.night.waiting_opens_at, timezone)));
    return unanswered.length ? refused(unanswered[0], arrivalLookupText[unanswered[0]]) : refused("unknown", arrivalNotFoundText);
  }, [inspect, nightId, nightOpensAt, venueId, timezone]);
  const choose = useCallback(async (source: { id: string } | { secret: string }) => {
    if (operation.current) return;
    const request = ++selectionRequest.current;
    const scan = "secret" in source;
    setCamera(false); setSelected(null); setSecret(null); setError(""); setNotice(""); setUncertain(false);
    setCorrecting(false); setConfirmed(false); setNote(""); setLeaving(null); setRefusal(null); setJustConfirmed(false); setFromScan(scan);
    // Only the scan that took the picture may show it (review on #537).
    if (!scan) { clearTimeout(captureTimer.current); setCapture(null); setHolding(false); }
    const refuse = (verdict: ArrivalVerdict & { text: string }) => { setRefusal(verdict); if (scan) buzz(verdict.tone); };
    if ("secret" in source && !isArrivalCode(source.secret)) { setLoading(false);
      refuse({ ...arrivalRefusalVerdict("not_reservation_qr"), text: "This is not a personal reservation QR. Use the guest’s confirmation QR or manual lookup." }); return; }
    setLoading(true);
    try {
      const value = await inspect(source);
      if (!alive.current || request !== selectionRequest.current) return;
      setSelected(value); setSecret("secret" in source ? source.secret : null);
      if (value.arrival === "verified") setNotice("Already verified. The original verification is shown below; no new refund was requested.");
      if (scan) buzz(arrivalVerdict(value, { justConfirmed: false, uncertain: false }).tone);
    } catch (failure) {
      const current = () => alive.current && request === selectionRequest.current;
      const outcome = arrivalLookupOutcome(failure);
      if (!current()) return;
      const reason = outcome !== "refused" ? { ...arrivalRefusalVerdict(outcome), text: arrivalLookupText[outcome] }
        : "secret" in source ? await otherNightReason(source.secret, current).catch(() => ({ ...arrivalRefusalVerdict("failed"), text: arrivalLookupText.failed }))
        : { ...arrivalRefusalVerdict("unknown"), text: arrivalNotFoundText };
      if (current() && reason) refuse(reason);
    } finally { if (alive.current && request === selectionRequest.current) setLoading(false); }
  }, [inspect, otherNightReason]);
  const scanned = useCallback((code: string, snapshot?: ArrivalSnapshot) => {
    clearTimeout(captureTimer.current);
    setCapture(snapshot ?? null); setHolding(!!snapshot);
    if (snapshot) captureTimer.current = setTimeout(() => setHolding(false), captureHold);
    void choose({ secret: code });
  }, [choose]);
  const stopCamera = useCallback(() => setCamera(false), []);
  const clearSelection = () => { selectionRequest.current++; clearTimeout(captureTimer.current); setCapture(null); setHolding(false); setSelected(null); setSecret(null); setError(""); setNotice(""); setNote(""); setRefusal(null); setJustConfirmed(false);
    setCorrecting(false); setConfirmed(false); setUncertain(false); setLoading(false); setLeaving(null); };
  // The frozen frame stays for the hold, and until the answer if it is slower.
  const frozen = !!capture && (holding || (loading && fromScan));
  const canVerify = selected?.availability === "open" && selected.arrival !== "verified";
  const leave = (run: () => void) => { if (canVerify && !uncertain) setLeaving({ run }); else run(); };

  async function search(event?: FormEvent, after?: string) {
    event?.preventDefault();
    if (operation.current) return;
    if (!isValidText(query, 254, false)) { setSearchError("Use at most 254 characters for the first name, email or reference."); return; }
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
      setSelected(value); setUncertain(false); setCorrecting(false); setConfirmed(false); setJustConfirmed(false);
      setRows(previous => previous?.map(row => row.id === value.id ? { ...row, ...value } : row) ?? null);
      setNotice("Current server record loaded. Review it before taking another action.");
      void refreshSummary(); onRefresh?.();
    } catch { if (alive.current) { setUncertain(true); setError("The current record could not be checked. Reconnect and refresh the result before continuing."); } }
    finally { operation.current = false; if (alive.current) setBusy(false); }
  }
  async function submit(event: FormEvent) { event.preventDefault(); await record(); }
  async function confirmAndLeave() {
    const pending = leaving, name = selected?.first_name;
    setLeaving(null);
    if (!pending || !(await record())) return;
    pending.run(); setNotice(`${name}: arrival verified. The refund is handled separately; you can continue scanning.`);
  }
  // Resolves true only when the command succeeded and the server record now shows the arrival.
  async function record(): Promise<boolean> {
    if (!selected || operation.current || uncertain) return false;
    if ((correcting || !secret) && !isValidText(note, 500)) { setError("Add a verification note of 1–500 characters."); noteInput.current?.focus(); return false; }
    if (correcting && !confirmed) return false;
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
      if (!alive.current) return false;
      setSelected(value); setUncertain(false); setCorrecting(false); setConfirmed(false);
      setRows(previous => previous?.map(row => row.id === value.id ? { ...row, ...value } : row) ?? null);
      const arrived = commandSucceeded && !correcting && value.arrival === "verified";
      setJustConfirmed(arrived); if (arrived) buzz("done");
      if (commandSucceeded) { setNote(""); setNotice(correcting ? "Attendance corrected. Any refund already requested continues unchanged." : "Arrival verified. The refund is handled separately; you can continue scanning."); }
      else setError("The action was refused or its response was lost. The current server record is shown below. Review it before trying again.");
      return arrived;
    } catch {
      if (alive.current) { setUncertain(true); setError("The result could not be checked. This action may have completed. Reconnect and refresh the result before continuing."); }
    } finally { operation.current = false; if (alive.current) { setBusy(false); void refreshSummary(); onRefresh?.(); } }
    return false;
  }

  return <section className={`${styles.root} ${focusMode ? styles.focused : ""}`} aria-label="Arrival verification" data-focused-arrivals={!!focusMode}>
    <header className={styles.heading}>
      <button type="button" disabled={busy} onClick={() => leave(onClose)}><ArrowLeft size={16} aria-hidden="true" /> {focusMode ? "Back to Tonight" : "Reservations & deposits"}</button>
      <p className={styles.eyebrow}>{venueName}</p><h3 ref={screenHeading} tabIndex={-1}>Arrivals</h3>
      {!focusMode && summary && <p>{formatVenueInstant(summary.starts_at, timezone)} · {timezone}<br />Until {formatVenueInstant(summary.ends_at, timezone)}</p>}
      {!focusMode && <p>Verify guests here, including outside if the bar is full. This records attendance for their deposit refund.</p>}
      {focusMode && summary && <p>{summary.verified} arrived · {summary.remaining} remaining</p>}
    </header>
    {!focusMode && <div className={styles.counts} aria-label="Reservation attendance counts">
      <div><strong>{summary?.verified ?? "…"}</strong><span>Verified</span></div>
      <div><strong>{summary ? summary.ended ? summary.absent : summary.remaining : "…"}</strong><span>{summary?.ended ? "Absent" : "Remaining"}</span></div>
      <div><strong>{summary?.cancelled_count ?? "…"}</strong><span>Cancelled bookings</span></div>
    </div>}
    {summary?.cancelled && <p className={styles.warning}>This event was cancelled or postponed.</p>}
    {summary?.ended && !summary.cancelled && <p className={styles.warning}>This event has ended. Use manual lookup for attendance history or a founder correction.</p>}
    {/* A failed action already says to reconnect; a second stacked alert only adds noise (#407). */}
    {summaryError && !error && <p role="alert" className={styles.error}>{summaryError}</p>}
    {!focusMode && <div className={styles.refresh}><span>{summary ? `Counts checked ${formatVenueInstant(summary.now, timezone)}` : "Loading attendance counts…"}</span><button type="button" onClick={() => void refreshSummary()}><RefreshCw size={14} aria-hidden="true" /> Refresh counts</button></div>}
    {frozen && capture && <><div className={styles.capture} data-capture style={{ aspectRatio: capture.aspect, width: `min(100%, ${Math.round(340 * capture.aspect)}px)` }} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- a local data: frame, not an optimisable asset */}
      <img src={capture.src} alt="" /><span className={styles.captureFrame} style={{ left: `${capture.box.left * 100}%`, top: `${capture.box.top * 100}%`,
        width: `${capture.box.width * 100}%`, height: `${capture.box.height * 100}%` }} /></div>
      <p className={styles.captureStatus}><strong>Code read</strong> · <span role="status">Checking reservation…</span></p></>}
    {loading && fromScan && !frozen && <div className={styles.reading} data-verdict="reading"><ScanLine size={44} strokeWidth={2.25} aria-hidden="true" />
      <div><p className={styles.verdictTitle}>Code read</p><p role="status">Checking reservation…</p></div></div>}
    {refusal && !loading && !frozen && <section className={styles.refusal} aria-label="Scan result">
      <Verdict verdict={refusal} titleRef={refusalTitle} line={<p role="alert">{refusal.text}</p>} /></section>}
    {(!focusMode || (!selected && !camera && !frozen)) && <div className={styles.tools}>
      <button ref={nextButton} type="button" className={styles.primary} disabled={busy || loading} onClick={() => leave(() => { clearSelection(); setLookup(false); setCamera(true); })}><Camera size={18} aria-hidden="true" /> Scan personal QR</button>
      <p>Scanning identifies the booking. You confirm arrival in the next step.</p>
    </div>}
    {focusMode && !selected && !lookup && !frozen && <button type="button" disabled={busy} onClick={() => { setCamera(false); setRefusal(null); setLookup(true); }}>Find a guest without QR</button>}
    {camera && <ArrivalCamera onCode={scanned} onStop={stopCamera} />}
    {loading && !fromScan && <p role="status">Checking reservation…</p>}
    {notice && !frozen && <p role="status" className={styles.notice}>{notice}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {selected && !frozen && <article className={styles.detail} aria-busy={busy}>
      <Verdict verdict={arrivalVerdict(selected, { justConfirmed, uncertain })} line={!justConfirmed && selected.arrival === "verified" && selected.verified_at
        ? <p>Checked in {formatVenueInstant(selected.verified_at, timezone)}</p> : undefined} />
      <h4 ref={detailHeading} tabIndex={-1}>{selected.first_name}</h4>
      <p className={styles.identity}>{selected.email}</p><p className={styles.reference}>Reservation {selected.id}</p>
      {!uncertain && (canVerify || correcting) && <form onSubmit={submit} className={styles.form}>
        {correcting && <><h5>{selected.arrival === "verified" ? "Correct mistaken validation" : "Record missed arrival"}</h5>
          <p>{selected.arrival === "verified" ? "Remove this attendance verification. Any refund already requested will continue, even if still queued. Issued funds will not be collected back." : "Confirm that this guest actually attended. This updates attendance and requests any outstanding full refund. The record will show when you made this correction."}</p></>}
        {(correcting || !secret) && <div><label htmlFor="arrival-note">Verification note</label><textarea ref={noteInput} id="arrival-note" rows={3} value={note} disabled={busy} onChange={event => setNote(event.target.value)} aria-describedby="arrival-note-help" /></div>}
        {(correcting || !secret) && <p id="arrival-note-help" className={styles.hint}>1–500 characters. Explain how you verified this guest; a first name alone is insufficient.</p>}
        {correcting && <label className={styles.confirm}><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />I confirm this attendance correction and understand that existing refunds continue.</label>}
        {!leaving && <button type="submit" className={styles.primary} disabled={busy || (correcting && !confirmed)}>{busy ? "Checking result…" : correcting ? "Confirm correction" : "Confirm arrival"}</button>}
        {!leaving && correcting && <button type="button" disabled={busy} onClick={() => { setCorrecting(false); setConfirmed(false); }}>Keep current attendance</button>}
        {!leaving && !correcting && <p className={styles.hint}>Confirms attendance and requests the full deposit refund. Admission and visible room presence are separate.</p>}
      </form>}
      {!leaving && !uncertain && !correcting && selected.can_correct && <button type="button" disabled={busy} onClick={() => { setCorrecting(true); setConfirmed(false); setError(""); }}>{selected.arrival === "verified" ? "Correct mistaken validation" : "Correct a missed arrival"}</button>}
      {leaving ? <section className={styles.leaving} aria-label="Arrival not confirmed"><h5 ref={leavingHeading} tabIndex={-1}>Arrival not confirmed</h5>
        <p>{selected.first_name} is not marked as arrived. If they are coming in, confirm now: a guest left unconfirmed is counted absent and the deposit is not refunded.</p>
        <div className={styles.actions}><button type="button" className={styles.primary} disabled={busy} onClick={() => void confirmAndLeave()}>Confirm arrival</button>
          <button type="button" disabled={busy} onClick={() => { const pending = leaving; setLeaving(null); pending.run(); }}>Skip, not arrived</button></div>
      </section>
      : <div className={styles.actions}><button type="button" disabled={busy} onClick={() => void reloadSelection()}>Refresh result</button><button type="button" className={canVerify ? undefined : styles.primary} disabled={busy} onClick={() => leave(() => { clearSelection(); if (focusMode) { setCamera(focusMode === "scan"); setLookup(focusMode === "lookup"); } nextButton.current?.focus(); })}>Next guest</button></div>}
      <dl className={styles.states}><div><dt>Attendance</dt><dd>{selected.arrival === "verified" ? "Verified" : selected.arrival === "no_show" ? "Absent" : "Not verified"}</dd></div>
        <div><dt>Reservation</dt><dd>{selected.state}</dd></div></dl>
      {selected.verified_at && <p>Verified on {formatVenueInstant(selected.verified_at, timezone)} · {selected.method === "qr" ? "QR scan" : "Manual verification"}</p>}
      {selected.verified_by && <p className={styles.reference}>Founder {selected.verified_by}</p>}
      {selected.note && <p>Verification note: {selected.note}</p>}
      <p className={styles.refund}>{arrivalRefundText(selected.refund_state)}</p>
      {(selected.arrival !== "verified" || selected.availability !== "open") && <p>{arrivalAvailabilityText[selected.availability]}</p>}
      {selected.history.length > 0 && <details className={styles.history}><summary>Attendance history</summary>
        <p className={styles.hint}>Latest 20 actions. The full audit is in Reservations & deposits.</p>
        {selected.history.map(item => <div key={item.id}><strong>{item.action === "arrival_verified" ? "Arrival verified" : item.detail.verified === true ? "Missed arrival corrected" : "Mistaken validation corrected"}</strong>
          <p>{formatVenueInstant(item.created_at, timezone)}</p><p className={styles.reference}>Founder {item.actor_id ?? "no longer available"}</p>
          {typeof item.detail.note === "string" && <p>{item.detail.note}</p>}<PreviousAttendance value={item.detail.previous} timezone={timezone} /></div>)}
      </details>}
    </article>}
    {(!focusMode || (lookup && !selected)) && <section className={styles.lookup} aria-label="Manual arrival lookup"><h4>No QR or phone?</h4><p>Find the booking, then check the guest’s email or reservation reference.</p>
      <form onSubmit={event => void search(event)} className={styles.form}><label>First name, email or reference<input ref={lookupInput} value={query} disabled={busy} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={event => { setQuery(event.target.value); searchRequest.current++; setSearching(false); setRows(null); setCursor(undefined); }} /></label>
        <button type="submit" disabled={busy || searching}>{searching ? "Searching…" : "Find guest"}</button></form>
      {searchError && <p role="alert" className={styles.error}>{searchError}</p>}
      {rows?.length === 0 && <p>No reservations match this search.</p>}
      {rows && <div className={styles.list}>{rows.map(row => <button type="button" key={row.id} disabled={busy || loading} className={styles.row} onClick={() => row.id === selected?.id ? void choose({ id: row.id }) : leave(() => void choose({ id: row.id }))}>
        <strong>{row.first_name}</strong><span>{row.email}</span><small>Reservation {row.id}</small><span>{row.state === "confirmed" ? row.arrival === "verified" ? "Verified" : row.arrival === "no_show" ? "Absent" : "Not verified" : row.state}</span></button>)}</div>}
      <div className={styles.actions}>{cursor && <button type="button" disabled={busy || searching} onClick={() => void search()}>First results</button>}{rows?.length === 100 && <button type="button" disabled={busy || searching} onClick={() => void search(undefined, rows.at(-1)!.id)}>Next 100 results</button>}</div>
    </section>}
  </section>;
}
