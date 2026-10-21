"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { creationNotice } from "@/lib/admin-night-creation";
import { availableNightTabs, nightTimeline, parseNightTab, productionEventUrl, registrationClosesAt, type NightTab } from "@/lib/admin-dashboard";
import { formatWorkspaceDate, isNightScheduleLocked, isTerminalNight, workspaceNightStatus, workspaceNightTiming } from "@/lib/admin-venue-workspace";
import type { Venue, Night } from "./workspace-types";
import { useLaunchEvent } from "./useLaunchEvent";
import { NightScheduleDialog } from "./NightScheduleDialog";
import { ReservationSettings } from "./ReservationSettings";
import { ReservationOperations } from "./ReservationOperations";
import { ReservationWaitlist } from "./ReservationWaitlist";
import { ReservationActivity } from "./ReservationActivity";
import { OrganizerOperations } from "./OrganizerOperations";
import { ArrivalOperations } from "./ArrivalOperations";
import { NightReportPanel } from "./NightReport";
import { RoomControls, RoomConfirmation, useRoomActions, type RoomAction } from "./RoomActions";
import { WorkspaceDialog } from "./WorkspaceDialog";
import consoleStyles from "./NightsHome.module.css";
import styles from "./NightPage.module.css";

type NightVenue = Pick<Venue, "id" | "name" | "city" | "timezone">;
type OverlapNight = Pick<Night, "id" | "venue_id" | "waiting_opens_at" | "closes_at">;
const tabLabels: Record<NightTab, string> = { overview: "Overview", reservations: "Reservations", waitlist: "Waitlist", arrivals: "Arrivals", activity: "Activity", report: "Report" };

export function NightPage({ nightId }: { nightId: string }) {
  const params = useSearchParams();
  const [night, setNight] = useState<Night | null>(null);
  const [venue, setVenue] = useState<NightVenue | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [countError, setCountError] = useState("");
  const [overlap, setOverlap] = useState<{ venueId: string; nights: OverlapNight[] } | null>(null);
  const [overlapError, setOverlapError] = useState("");
  const [overlapAttempt, setOverlapAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const tablist = useRef<HTMLDivElement>(null);
  const [moreTabs, setMoreTabs] = useState(false);
  const request = useRef(0);
  const countRequest = useRef(0);
  const launch = useLaunchEvent(nightId);
  const load = useCallback(async () => {
    const version = ++request.current;
    const nightResult = await supabase.from("venue_nights")
      .select("id,venue_id,waiting_opens_at,guaranteed_launch_at,closes_at,launch_threshold,opened_at,terminal_at,terminal_reason,status")
      .eq("id", nightId).limit(1);
    if (version !== request.current) return;
    if (nightResult.error) {
      setLoadError("Could not refresh the workspace. Displayed information may be out of date.");
      setLoading(false); return;
    }
    const nextNight = nightResult.data?.find(row => row.id === nightId) ?? null;
    const venueResult = nextNight ? await supabase.from("venues")
      .select("id,name,city,timezone").eq("id", nextNight.venue_id).limit(1) : null;
    if (version !== request.current) return;
    setNight(nextNight);
    if (!venueResult?.error) setVenue(venueResult?.data?.find(row => row.id === nextNight?.venue_id) ?? null);
    else setVenue(previous => previous?.id === nextNight?.venue_id ? previous : null);
    setLoadError(venueResult?.error ? "Could not refresh the workspace. Displayed information may be out of date." : "");
    setNow(Date.now()); setLoading(false);
  }, [nightId]);
  const loadCount = useCallback(async () => {
    const version = ++countRequest.current;
    // This existing RPC has no night argument; retain only the selected count.
    const result = await supabase.rpc("admin_venue_night_participant_counts");
    if (version !== countRequest.current) return;
    if (!result.error) setCount(result.data?.find(row => row.venue_night_id === nightId)?.participant_count ?? 0);
    setCountError(result.error ? "Could not refresh attendance. Displayed information may be out of date." : "");
    setNow(Date.now());
  }, [nightId]);
  useEffect(() => {
    const refreshData = () => { void load(); void loadCount(); };
    void (async () => { await Promise.all([load(), loadCount()]); })();
    const requests = request;
    const countRequests = countRequest;
    const channel = supabase.channel(`admin-night-${nightId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "venue_nights", filter: `id=eq.${nightId}` }, refreshData)
      .subscribe(status => { if (status === "SUBSCRIBED") refreshData(); });
    // Presence changes independently of the schedule. Only its count and the
    // local clock need periodic refresh; night/venue rows use scoped realtime.
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void loadCount(); }, 15_000);
    const onVisible = () => { if (document.visibilityState === "visible") refreshData(); };
    window.addEventListener("focus", refreshData); document.addEventListener("visibilitychange", onVisible);
    return () => { requests.current++; countRequests.current++; void supabase.removeChannel(channel); window.clearInterval(timer); window.removeEventListener("focus", refreshData); document.removeEventListener("visibilitychange", onVisible); };
  }, [load, loadCount, nightId]);

  const venueId = venue?.id;
  useEffect(() => {
    if (!editing || !venueId) return;
    let active = true;
    void supabase.from("venue_nights").select("id,venue_id,waiting_opens_at,closes_at")
      .eq("venue_id", venueId).neq("id", nightId).then(({ data, error }) => {
        if (!active) return;
        if (error) { setOverlapError("Could not load this venue’s other nights. Try again before editing the schedule."); return; }
        setOverlap({ venueId, nights: (data ?? []).filter(row => row.venue_id === venueId && row.id !== nightId) });
        setOverlapError("");
      });
    return () => { active = false; };
  }, [editing, venueId, nightId, overlapAttempt]);

  const event = launch.overview?.event;
  const created = creationNotice(params.get("scheduled"), params.get("reservationError"));
  const terminal = Boolean(night && isTerminalNight(night, now)) || Boolean(event?.cancelled_at);
  const frozen = Boolean(event && Math.max(now, Date.parse(launch.overview!.now)) >= Date.parse(event.registration_opens_at));
  const tab = parseNightTab(params.get("tab"), !!event, terminal);
  const tabs = availableNightTabs(!!event, terminal);
  useEffect(() => {
    const element = tablist.current;
    if (!element) return;
    const updateFade = () => setMoreTabs(element.scrollWidth - element.clientWidth - element.scrollLeft > 1);
    const revealSelected = () => {
      const selected = element.querySelector<HTMLElement>('[aria-selected="true"]');
      if (selected) {
        const frame = element.getBoundingClientRect();
        const target = selected.getBoundingClientRect();
        // Scroll only the tab strip, preserving the page's vertical position.
        if (target.left < frame.left) element.scrollLeft += target.left - frame.left - 4;
        else if (target.right > frame.right - 24) element.scrollLeft += target.right - frame.right + 24;
      }
      updateFade();
    };
    const initial = window.requestAnimationFrame(revealSelected);
    const observer = new ResizeObserver(revealSelected);
    observer.observe(element);
    for (const button of element.children) observer.observe(button);
    element.addEventListener("scroll", updateFade, { passive: true });
    return () => { window.cancelAnimationFrame(initial); observer.disconnect(); element.removeEventListener("scroll", updateFade); };
  }, [tab, tabs.length, loading, night?.id, venue?.id]);

  function selectTab(next: NightTab) {
    const url = new URL(window.location.href); url.searchParams.set("tab", next);
    window.history.pushState(null, "", url);
  }
  function refresh() { launch.refresh(); void load(); void loadCount(); }
  const room = useRoomActions({ night, terminal, canCancel: !event && !!launch.overview, refresh, onNotice: setNotice });
  function confirmAction(value: RoomAction) { setEditing(false); setError(""); room.confirm(value); }
  async function copyLink() {
    try { await navigator.clipboard.writeText(productionEventUrl(nightId)); setNotice("Booking link copied."); setError(""); }
    catch { setError("The link could not be copied. Select and copy the URL below."); }
  }
  async function downloadQr() {
    try {
      const url = await QRCode.toDataURL(productionEventUrl(nightId), { width: 360, margin: 2, color: { dark: "#111827", light: "#FFFFFF" } });
      const link = document.createElement("a"); link.href = url; link.download = `${nightId}-booking-qr.png`; link.click();
    } catch { setError("The QR code could not be generated. Close this panel and try again."); }
  }
  if (loading) return <p role="status">Loading night…</p>;
  if (!night || !venue) return <div className={consoleStyles.empty}><h1>Night unavailable</h1><p>{loadError || "This night could not be found or is no longer accessible."}</p><button className={consoleStyles.button} onClick={refresh}>Try again</button><Link className={consoleStyles.button} href="/admin">Back to Nights</Link></div>;
  const timing = workspaceNightTiming(night, venue.timezone, now);
  const status = workspaceNightStatus(night, now);
  const locked = isNightScheduleLocked(night, now);
  const bookingClosed = terminal || now >= Date.parse(registrationClosesAt(night.waiting_opens_at));
  const button = consoleStyles.button;
  return <div className={styles.page}>
    <nav aria-label="Night navigation" className={styles.breadcrumb}><Link href="/admin">Nights</Link><span aria-hidden="true">/</span><Link href={`/admin/venues/${venue.id}`}>{venue.name}</Link><span aria-current="page">· {timing.date}</span></nav>
    <header className={consoleStyles.header}>
      <div><div className={styles.title}><h1>{timing.date}</h1><span className={consoleStyles.chip} data-status={status}>{status}</span><button className={styles.refresh} aria-label="Refresh night" title="Refresh night" onClick={refresh}><RefreshCw size={16} aria-hidden="true" /></button></div><p>{venue.name} · {venue.city ?? venue.timezone} · {timing.hours}</p><p>All times in {venue.timezone}</p></div>
      <div className={styles.actions}>
        {event && !event.cancelled_at && night.terminal_reason !== "cancelled" && <button className={button} onClick={() => void copyLink()}>Copy booking link</button>}
        {launch.overview && !terminal && !locked && !frozen && <button className={button} onClick={() => { setOverlap(null); setOverlapError(""); setEditing(true); }}>Edit schedule</button>}
        {event && !terminal && <button className={`${button} ${consoleStyles.primary}`} onClick={() => selectTab("arrivals")}>Open arrivals</button>}
      </div>
    </header>
    {loadError && <p role="alert" className={consoleStyles.error}>{loadError}</p>}
    {countError && <p role="alert" className={consoleStyles.error}>{countError}</p>}
    {launch.error && <p role="alert" className={consoleStyles.error}>{launch.error}</p>}
    {error && <p role="alert" className={consoleStyles.error}>{error}</p>}
    {created && (!created.partial || !event) && <p role={created.partial ? "alert" : "status"} className={created.partial ? consoleStyles.error : styles.notice}>{created.message}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    <dl className={styles.metrics} aria-label="Key figures">
      {event && <div><dt>Allocated</dt><dd>{launch.overview!.allocations} / {event.capacity}</dd><small>Confirmed bookings and payment holds</small></div>}
      <div><dt>{event ? "Checked in now" : "Checked in"}</dt><dd>{count ?? "…"}</dd></div>
      <div><dt>{event ? "Registration closes" : "Closes at"}</dt><dd>{event ? formatWorkspaceDate(registrationClosesAt(night.waiting_opens_at), venue.timezone, now, true) : timing.closing}</dd></div>
    </dl>
    <div className={styles.tabFrame} data-overflow-right={moreTabs}>
    <div ref={tablist} role="tablist" aria-label="Night sections" className={styles.tabs} onKeyDown={e => {
      const index = tabs.indexOf(tab);
      const next = e.key === "ArrowRight" ? tabs[(index + 1) % tabs.length] : e.key === "ArrowLeft" ? tabs[(index + tabs.length - 1) % tabs.length] : e.key === "Home" ? tabs[0] : e.key === "End" ? tabs.at(-1) : null;
      if (next) { e.preventDefault(); selectTab(next); document.getElementById(`night-tab-${next}`)?.focus({ preventScroll: true }); }
    }}>
      {tabs.map(value => <button key={value} id={`night-tab-${value}`} role="tab" aria-selected={value === tab} aria-controls={`night-panel-${value}`} tabIndex={value === tab ? 0 : -1} onClick={() => selectTab(value)}>{tabLabels[value]}</button>)}
    </div>
    </div>
    {tabs.filter(value => value !== tab).map(value => <div key={value} role="tabpanel" id={`night-panel-${value}`} aria-labelledby={`night-tab-${value}`} hidden />)}
    <div role="tabpanel" id={`night-panel-${tab}`} aria-labelledby={`night-tab-${tab}`} tabIndex={0}>
      {tab === "overview" && <div className={styles.column}>
        <div className={styles.grid}>
          <div className={styles.column}>
            <section className={styles.card} aria-label="Night schedule"><h2>How the night unfolds</h2>
              <ol className={styles.timeline}>{nightTimeline(night, event?.registration_opens_at ?? null, now).map(step => <li key={step.label} data-done={step.done}><div><strong>{step.label}</strong>{step.done && <span className={styles.muted}> · Done</span>}<p>{step.detail}</p><time dateTime={step.at}>{formatWorkspaceDate(step.at, venue.timezone, now, true)}</time></div></li>)}</ol>
              {locked && <p className={styles.muted}>{terminal ? "This night is part of venue history. Its schedule and status cannot be changed." : "Entry has opened. The schedule can no longer be edited."}</p>}
            </section>
            <RoomControls night={night} terminal={terminal} actions={room} />
          </div>
          <div className={styles.column}>
            <ReservationSettings now={now} overview={launch.overview} startsAt={night.waiting_opens_at} timezone={venue.timezone} nightId={nightId} terminal={terminal} frozen={frozen} refresh={launch.refresh} />
            {event && <section className={styles.card} aria-label="Booking page"><h2>Booking page{bookingClosed ? " · Closed" : ""}</h2><p>{productionEventUrl(nightId)}</p><p className={styles.muted}>This always points to production at getamourette.com, including from a preview.</p><div className={styles.actions}><button className={button} onClick={() => void copyLink()}>Copy link</button><a className={button} href={productionEventUrl(nightId)} target="_blank" rel="noreferrer">Open page ↗</a><button className={button} onClick={() => void downloadQr()}>Download QR</button></div></section>}
            <section className={styles.card} aria-label="Venue"><h2>{venue.name}</h2><p className={styles.muted}>Same QR for every night at this venue</p><Link className={button} href={`/admin/venues/${venue.id}`}>Venue & QR</Link></section>
          </div>
        </div>
        {!terminal && <div className={styles.danger}>{event ? <OrganizerOperations onNotice={setNotice} nightId={nightId} refresh={launch.refresh} onNightChanged={() => void load()} /> : launch.overview && !locked && <section className={styles.card} aria-label="Cancel night"><h2>Danger zone</h2><p>Close this date permanently. The venue and its other nights stay available.</p><button className={button} onClick={() => confirmAction("cancel")}>Cancel scheduled night</button></section>}</div>}
      </div>}
      {tab === "reservations" && <ReservationOperations nightId={nightId} timezone={venue.timezone} revision={launch.revision} onRefresh={launch.refresh} onNightChanged={() => void load()} />}
      {tab === "waitlist" && <ReservationWaitlist key={`${nightId}-${launch.revision}`} nightId={nightId} timezone={venue.timezone} readOnly={terminal} />}
      {tab === "activity" && <ReservationActivity key={`${nightId}-${launch.revision}`} nightId={nightId} timezone={venue.timezone} />}
      {tab === "arrivals" && (now < Date.parse(night.waiting_opens_at) && !terminal ? <section className={styles.card}><h2>Arrivals open on the night</h2><p>Arrival verification starts when entry opens at {formatWorkspaceDate(night.waiting_opens_at, venue.timezone, now, true)}. Scan each guest’s personal QR at the door to record attendance and request their deposit refund.</p></section> : <ArrivalOperations embedded onRefresh={launch.refresh} nightId={nightId} venueName={venue.name} timezone={venue.timezone} onClose={() => selectTab("reservations")} />)}
      {tab === "report" && <NightReportPanel venueNightId={nightId} />}
    </div>
    {editing && (!overlap || overlap.venueId !== venue.id) && <WorkspaceDialog title="Edit scheduled night" busy={false} onClose={() => setEditing(false)}>
      {overlapError ? <p role="alert">{overlapError} <button className={button} onClick={() => { setOverlapError(""); setOverlapAttempt(value => value + 1); }}>Try again</button></p> : <p role="status">Loading this venue’s schedule…</p>}
    </WorkspaceDialog>}
    {editing && overlap?.venueId === venue.id && <NightScheduleDialog venue={venue} nights={[night]} overlapNights={overlap.nights} nightId={nightId} loadedAt={now} frozen={frozen || terminal} onClose={() => setEditing(false)} onSaved={message => { setEditing(false); setNotice(message); refresh(); }} onAction={terminal ? undefined : confirmAction} onCancelNight={!event ? () => confirmAction("cancel") : undefined} />}
    <RoomConfirmation actions={room} terminal={terminal} cancellationText={`${formatWorkspaceDate(night.waiting_opens_at, venue.timezone, now, true)} at ${venue.name} will be cancelled permanently. If this night has paid reservations, cancellation queues full deposit refunds. This does not mean bank processing has completed. The venue and its other nights stay unchanged.`} />
  </div>;
}
