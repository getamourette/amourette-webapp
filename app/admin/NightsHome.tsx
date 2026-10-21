"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { groupWorkspaceNights, parseNightsHomeFilters, workspaceNightStatus, workspaceNightTiming } from "@/lib/admin-venue-workspace";
import styles from "./NightsHome.module.css";

type Venue = Pick<Database["public"]["Tables"]["venues"]["Row"], "id" | "name" | "city" | "timezone" | "is_test_venue">;
type Night = Pick<Database["public"]["Tables"]["venue_nights"]["Row"], "id" | "venue_id" | "waiting_opens_at" | "closes_at" | "opened_at" | "terminal_at" | "terminal_reason" | "status">;
type Snapshot = { venues: Venue[]; nights: Night[]; counts: Record<string, number>; now: number };

function ScheduleAction() {
  return <Link className={`${styles.button} ${styles.primary}`} href="/admin/nights/new"><Plus size={16} aria-hidden="true" />Schedule a night</Link>;
}

function Status({ night, now }: { night: Night; now: number }) {
  const status = workspaceNightStatus(night, now);
  return <span className={styles.chip} data-status={status}>{status === "Opening" ? "Opening…" : status}</span>;
}

export function NightsHome() {
  const search = useSearchParams();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState(false);
  const [showTestVenues, setShowTestVenues] = useState(false);
  const requestVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const [venues, nights, counts] = await Promise.all([
        supabase.from("venues").select("id,name,city,timezone,is_test_venue").order("name"),
        supabase.from("venue_nights").select("id,venue_id,waiting_opens_at,closes_at,opened_at,terminal_at,terminal_reason,status").order("waiting_opens_at"),
        supabase.rpc("admin_venue_night_participant_counts"),
      ]);
      if (version !== requestVersion.current) return;
      if (venues.error || nights.error || counts.error) { setError(true); return; }
      setSnapshot({ venues: venues.data ?? [], nights: nights.data ?? [],
        counts: Object.fromEntries((counts.data ?? []).map(row => [row.venue_night_id, row.participant_count])), now: Date.now() });
      setError(false);
    } catch {
      if (version === requestVersion.current) setError(true);
    }
  }, []);

  useEffect(() => {
    void (async () => { await load(); })();
    const requests = requestVersion;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30_000);
    const onFocus = () => void load();
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      requests.current++;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const venues = (snapshot?.venues ?? []).filter(venue => showTestVenues || !venue.is_test_venue);
  const { view, venueId } = parseNightsHomeFilters(search.get("view"), search.get("venue"), venues.map(venue => venue.id));
  const venueById = new Map(venues.map(venue => [venue.id, venue]));
  const visibleNights = (snapshot?.nights ?? []).filter(night => venueById.has(night.venue_id));
  const groups = groupWorkspaceNights(visibleNights.filter(night => !venueId || night.venue_id === venueId), snapshot?.now ?? 0);
  const scheduled = view === "past" ? groups.history : groups.upcoming;

  function updateFilter(nextView: typeof view, nextVenue: string | null) {
    const params = new URLSearchParams();
    if (nextView === "past") params.set("view", "past");
    if (nextVenue) params.set("venue", nextVenue);
    // These filters only select already-loaded rows. Update the URL synchronously;
    // Next integrates native history with useSearchParams and back/forward.
    window.history.pushState(null, "", `/admin${params.size ? `?${params}` : ""}`);
  }

  return <div className={styles.home}>
    <header className={styles.header}>
      <div><h1>Nights</h1><p>Every night across every venue, in time order.</p></div>
      <ScheduleAction />
    </header>
    <div className={styles.filters}>
      <div className={styles.segment} role="group" aria-label="Filter nights">
        <button aria-pressed={view === "upcoming"} onClick={() => updateFilter("upcoming", venueId)}>Upcoming</button>
        <button aria-pressed={view === "past"} onClick={() => updateFilter("past", venueId)}>Past</button>
      </div>
      <div className={styles.venueFilter}><label htmlFor="nights-venue">Venue</label><select id="nights-venue" value={venueId ?? ""} onChange={event => updateFilter(view, event.target.value || null)}>
        <option value="">All venues</option>{venues.map(venue => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
      </select></div>
      <label className={styles.testToggle}><input type="checkbox" checked={showTestVenues} onChange={event => setShowTestVenues(event.target.checked)} />Show test venues</label>
    </div>
    {error && <div className={styles.error} role="alert"><p>Could not load nights. {snapshot ? "Displayed information may be out of date." : "Please try again."}</p><button className={styles.button} onClick={() => void load()}>Try again</button></div>}
    {!snapshot && !error && <p className={styles.empty} role="status">Loading nights…</p>}
    {snapshot && <>
      {groups.active.length > 0 && <section className={styles.section} aria-labelledby="happening-heading">
        <h2 id="happening-heading">Happening now</h2>
        {groups.active.map(night => {
          const venue = venueById.get(night.venue_id)!;
          const timing = workspaceNightTiming(night, venue.timezone, snapshot.now);
          return <article key={night.id} className={styles.activeCard}>
            <div className={styles.identity}>
              <div className={styles.cardMeta}>
                <span className={styles.cardDate}><Status night={night} now={snapshot.now} /><span>{timing.date}</span></span>
                {venue.is_test_venue && <span className={styles.chip}>Test</span>}
                <span className={styles.activeHours}>{timing.hours}</span>
              </div>
              <h3>{venue.name}</h3><p>{venue.city} · {venue.timezone}</p>
            </div>
            <dl className={styles.metrics}>
              <div><dt>Checked in</dt><dd>{snapshot.counts[night.id] ?? 0}</dd></div>
              <div><dt>Closes at</dt><dd>{timing.closing}</dd></div>
            </dl>
            <Link className={`${styles.button} ${styles.primary}`} href={`/admin/nights/${night.id}`}>Open night<ArrowRight size={16} aria-hidden="true" /></Link>
          </article>;
        })}
      </section>}
      <section className={styles.section} aria-labelledby="schedule-heading">
        <h2 id="schedule-heading">Schedule</h2>
        {visibleNights.length === 0 ? <div className={styles.empty}><h3>No nights yet</h3><p>Schedule a night to get started.</p><ScheduleAction /></div>
          : scheduled.length === 0 ? <div className={styles.empty}><h3>No nights match these filters</h3><p>Choose another venue or switch between Upcoming and Past.</p></div>
          : <div className={styles.schedule}>
            <div className={`${styles.row} ${styles.columnLabels}`} aria-hidden="true"><span>Date</span><span>Venue</span><span>Hours</span><span>Status</span><span /></div>
            {scheduled.map(night => {
              const venue = venueById.get(night.venue_id)!;
              const timing = workspaceNightTiming(night, venue.timezone, snapshot.now);
              return <Link key={night.id} className={styles.row} href={`/admin/nights/${night.id}`}>
                <span className={styles.date}><strong>{timing.date}</strong><small>{timing.relative}</small></span>
                <span className={styles.venue}><strong title={venue.name}>{venue.name}</strong><small>{venue.city}{venue.is_test_venue && <span className={styles.chip}>Test</span>}</small></span>
                <span className={styles.hours}>{timing.hours}</span>
                <span className={styles.status}><Status night={night} now={snapshot.now} /></span>
                <ArrowRight className={styles.arrow} size={16} aria-hidden="true" />
              </Link>;
            })}
          </div>}
      </section>
    </>}
  </div>;
}
