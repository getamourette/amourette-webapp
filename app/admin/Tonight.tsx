"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RefreshCw, ScanLine } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatWorkspaceDate, groupWorkspaceNights, isTerminalNight, selectTonightNight, workspaceNightStatus, workspaceNightTiming } from "@/lib/admin-venue-workspace";
import { readArrivalSummary, type ArrivalSummary } from "@/lib/launch-arrivals";
import type { Night, Venue } from "./workspace-types";
import { useLaunchEvent } from "./useLaunchEvent";
import { ArrivalOperations } from "./ArrivalOperations";
import { RoomControls, useRoomActions } from "./RoomActions";
import common from "./NightsHome.module.css";
import styles from "./Tonight.module.css";

type TonightVenue = Pick<Venue, "id" | "name" | "city" | "timezone" | "is_test_venue">;
type Snapshot = { version: number; venues: TonightVenue[]; nights: Night[]; counts: Record<string, number> };

function ActiveNight({ night, venue, count, now, refresh, snapshotVersion, latestRequest }: {
  snapshotVersion: number; latestRequest: () => number; night: Night; venue: TonightVenue; count: number; now: number; refresh: () => void;
}) {
  const launch = useLaunchEvent(night.id);
  const [mode, setMode] = useState<"scan" | "lookup" | null>(null);
  const [summary, setSummary] = useState<ArrivalSummary | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [notice, setNotice] = useState("");
  const configured = !!launch.overview?.event;
  const terminal = isTerminalNight(night, now) || !!launch.overview?.event?.cancelled_at;
  const refreshAll = () => { refresh(); launch.refresh(); };
  const room = useRoomActions({ night, terminal, snapshotVersion, latestRequest, refresh: refreshAll, onNotice: setNotice });

  useEffect(() => {
    if (!configured || mode) return;
    let active = true;
    let request = 0;
    async function load() {
      const version = ++request;
      try {
        const { data, error } = await supabase.rpc("admin_launch_arrival_summary", { p_night: night.id }).abortSignal(AbortSignal.timeout(15_000));
        if (error) throw error;
        const value = readArrivalSummary(data);
        if (active && version === request) { setSummary(value); setSummaryError(""); }
      } catch { if (active && version === request) setSummaryError("Counts could not refresh. The last successful counts may be out of date."); }
    }
    void load();
    const foreground = () => { if (!document.hidden) void load(); };
    const interval = window.setInterval(foreground, 15_000);
    window.addEventListener("focus", foreground); document.addEventListener("visibilitychange", foreground);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("focus", foreground); document.removeEventListener("visibilitychange", foreground); };
  }, [configured, night.id, mode, launch.revision]);

  const timing = workspaceNightTiming(night, venue.timezone, now);
  const status = workspaceNightStatus(room.night ?? night, now);
  if (mode && configured && !terminal) return <ArrivalOperations key={`${night.id}-${mode}`} embedded focusMode={mode} nightId={night.id} venueName={venue.name} timezone={venue.timezone}
    onRefresh={refresh} onClose={() => { setMode(null); refreshAll(); }} />;
  return <>
    <section className={styles.card} aria-label="Tonight’s night">
      <div className={styles.meta}><span className={common.chip} data-status={status}>{status === "Opening" ? "Opening…" : status}</span><span>Closes {timing.closing}</span></div>
      <h2>{venue.name}</h2><p>{timing.date}{venue.city ? ` · ${venue.city}` : ""}</p><p className={styles.timezone}>Times in {venue.timezone}{venue.is_test_venue ? " · Test venue" : ""}</p>
      <dl className={styles.counters} aria-label="Tonight counts">
        <div><dt>In the room</dt><dd>{count}</dd></div>
        {configured && <><div><dt>Arrived</dt><dd>{summary?.verified ?? "…"}</dd></div><div><dt>Remaining</dt><dd>{summary?.remaining ?? "…"}</dd></div></>}
      </dl>
    </section>
    {launch.error && <p className={common.error} role="alert">{launch.error}</p>}
    {summaryError && <p className={common.error} role="alert">{summaryError}</p>}
    <button className={styles.refresh} aria-label="Refresh Tonight" title="Refresh Tonight" onClick={refreshAll}><RefreshCw size={16} aria-hidden="true" /></button>
    {configured && !terminal && <div className={styles.arrivalActions}>
      <button className={styles.scan} onClick={() => setMode("scan")}><ScanLine size={22} aria-hidden="true" />Scan an arrival</button>
      <button className={common.button} onClick={() => setMode("lookup")}>Find a guest without QR</button>
    </div>}
    {!launch.loading && !launch.error && launch.overview && !configured && <p className={styles.timezone}>Walk-in night: guests scan the venue QR at the bar. There are no reservations to check in.</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    <div className={styles.room}>
      <RoomControls night={night} terminal={terminal} actions={room} inline />
    </div>
    <Link className={common.button} href={`/admin/nights/${night.id}`}>Open full night page</Link>
  </>;
}

export function Tonight() {
  const params = useSearchParams();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState(false);
  const [includeTests, setIncludeTests] = useState(false);
  const request = useRef(0);
  const load = useCallback(async () => {
    const version = ++request.current;
    try {
      const [venues, nights, counts] = await Promise.all([
        supabase.from("venues").select("id,name,city,timezone,is_test_venue").order("name"),
        supabase.from("venue_nights").select("id,venue_id,waiting_opens_at,guaranteed_launch_at,closes_at,launch_threshold,opened_at,terminal_at,terminal_reason,status").is("terminal_at", null).gt("closes_at", new Date().toISOString()).order("waiting_opens_at"),
        supabase.rpc("admin_venue_night_participant_counts"),
      ]);
      if (version !== request.current) return;
      setNow(Date.now());
      if (venues.error || nights.error || counts.error) { setError(true); return; }
      setSnapshot({ version, venues: venues.data ?? [], nights: nights.data ?? [], counts: Object.fromEntries((counts.data ?? []).map(row => [row.venue_night_id, row.participant_count])) });
      setError(false);
    } catch { if (version === request.current) { setNow(Date.now()); setError(true); } }
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const requests = request;
    const foreground = () => { if (!document.hidden) void load(); };
    const interval = window.setInterval(foreground, 15_000);
    window.addEventListener("focus", foreground); document.addEventListener("visibilitychange", foreground);
    return () => { requests.current++; window.clearTimeout(initial); window.clearInterval(interval); window.removeEventListener("focus", foreground); document.removeEventListener("visibilitychange", foreground); };
  }, [load]);

  const venues = new Map((snapshot?.venues ?? []).filter(venue => includeTests || !venue.is_test_venue).map(venue => [venue.id, venue]));
  const nights = (snapshot?.nights ?? []).filter(night => venues.has(night.venue_id));
  const groups = groupWorkspaceNights(nights, now);
  const night = selectTonightNight(nights, params.get("night"), now);
  const next = groups.upcoming[0];
  function selectNight(value: string) {
    const selected = selectTonightNight(nights, value, now);
    if (!selected) return;
    const url = new URL(window.location.href); url.searchParams.set("night", selected.id);
    window.history.pushState(null, "", url);
  }
  return <div className={styles.page}>
    <header className={styles.header}><h1>Tonight</h1><p>At the door, one guest at a time.</p></header>
    <label className={styles.testToggle}><input type="checkbox" checked={includeTests} onChange={event => setIncludeTests(event.target.checked)} />Show test venues</label>
    {error && <div className={common.error} role="alert"><p>Could not refresh Tonight. {snapshot ? "Displayed information may be out of date." : "Please try again."}</p><button className={common.button} onClick={() => void load()}>Try again</button></div>}
    {!snapshot && !error && <p role="status">Loading Tonight…</p>}
    {snapshot && <>
      {groups.active.length > 1 && <div className={styles.selector}><label htmlFor="tonight-night">Active night</label><select id="tonight-night" value={night?.id ?? ""} onChange={event => selectNight(event.target.value)}>
        {groups.active.map(row => <option key={row.id} value={row.id}>{venues.get(row.venue_id)!.name} · {workspaceNightTiming(row, venues.get(row.venue_id)!.timezone, now).date}</option>)}
      </select></div>}
      {night ? <ActiveNight snapshotVersion={snapshot.version} latestRequest={() => request.current} key={night.id} night={night} venue={venues.get(night.venue_id)!} count={snapshot.counts[night.id] ?? 0} now={now} refresh={() => void load()} /> : <>
        <section className={styles.card}><h2>Nothing is happening right now</h2><p>You’re all set for the next night.</p>
          {next && <div className={styles.next}><h3>Up next · {venues.get(next.venue_id)!.name}</h3><p>Entry {formatWorkspaceDate(next.waiting_opens_at, venues.get(next.venue_id)!.timezone, now, true)} · {venues.get(next.venue_id)!.timezone}</p><Link className={common.button} href={`/admin/nights/${next.id}`}>Open next night</Link></div>}
          <Link className={common.button} href="/admin">Go to Nights</Link>
        </section>
        <button className={styles.refresh} aria-label="Refresh Tonight" title="Refresh Tonight" onClick={() => void load()}><RefreshCw size={16} aria-hidden="true" /></button>
      </>}
    </>}
  </div>;
}
