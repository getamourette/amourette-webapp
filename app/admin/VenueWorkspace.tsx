"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, ChevronRight, Plus, QrCode } from "lucide-react";
import QRCode from "qrcode";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { isValidText, isVenueSlug, createVenueSlug, isLaunchThreshold, VENUE_NAME_MAX_LENGTH } from "@/lib/input-validation";
import { launchFollowsEntry, productionVenueUrl } from "@/lib/admin-dashboard";
import { groupWorkspaceNights, isNightScheduleLocked, isTerminalNight, workspaceNightStatus } from "@/lib/admin-venue-workspace";
import { formatVenueInstant, isoToVenueLocalInput, resolveVenueLocalDateTime } from "@/lib/venue-time";
import { ReservationOperations } from "./ReservationOperations";
import { ArrivalOperations } from "./ArrivalOperations";
import { WorkspaceDialog } from "./WorkspaceDialog";
import styles from "./VenueWorkspace.module.css";

type Venue = Pick<Database["public"]["Tables"]["venues"]["Row"], "id" | "slug" | "name" | "city" | "timezone" | "is_test_venue">;
type Night = Pick<Database["public"]["Tables"]["venue_nights"]["Row"], "id" | "venue_id" | "waiting_opens_at" | "guaranteed_launch_at" | "closes_at" | "launch_threshold" | "opened_at" | "terminal_at" | "terminal_reason" | "status">;
type Panel = "venue" | "night" | "qr" | "deleteVenue" | "cancelNight" | null;
const LOCATIONS = [
  { city: "Paris", timezone: "Europe/Paris" },
  { city: "New York", timezone: "America/New_York" },
] as const;

function Button({ children, onClick, primary = false, disabled = false, type = "button" }: {
  children: ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; type?: "button" | "submit";
}) {
  return <button type={type} onClick={onClick} disabled={disabled} className={`night-button ${primary ? "night-button-primary" : "night-button-secondary"} ${styles.button}`}>{children}</button>;
}

function closingLocal(date: string, launch: string, close: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !launch || !close) return "";
  if (close > launch) return `${date}T${close}`;
  const nextDay = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(nextDay.getTime())) return "";
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return `${nextDay.toISOString().slice(0, 10)}T${close}`;
}

function dateLabel(instant: string, zone: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(new Date(instant));
}
function timeLabel(instant: string, zone: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(instant));
}
function closeLabel(night: Night, zone: string) {
  const date = isoToVenueLocalInput(night.waiting_opens_at, zone).slice(0, 10);
  const closeDate = isoToVenueLocalInput(night.closes_at, zone).slice(0, 10);
  const days = Math.round((Date.parse(closeDate) - Date.parse(date)) / 86_400_000);
  return `${timeLabel(night.closes_at, zone)}${days > 0 ? ` (+${days} ${days === 1 ? "day" : "days"})` : ""}`;
}

export function VenueWorkspace({ venueId = null, selectedNightId = null }: {
  venueId?: string | null; selectedNightId?: string | null;
}) {
  const router = useRouter();
  const selectedId = venueId;
  const [bookingState, setBookingState] = useState<{ configured: boolean; frozen: boolean } | null>(null);
  const [arrivalNight, setArrivalNight] = useState<string | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [nights, setNights] = useState<Night[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [nightId, setNightId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("Paris");
  const [nightDate, setNightDate] = useState("");
  const [entryTime, setEntryTime] = useState("20:00");
  const [launchTime, setLaunchTime] = useState("21:00");
  const [closeTime, setCloseTime] = useState("02:00");
  const [threshold, setThreshold] = useState(4);
  const [scheduleZone, setScheduleZone] = useState("Europe/Paris");
  const [deleteName, setDeleteName] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    const [venueResult, nightResult, countResult] = await Promise.all([
      supabase.from("venues").select("id,slug,name,city,timezone,is_test_venue").order("name"),
      supabase.from("venue_nights").select("id,venue_id,waiting_opens_at,guaranteed_launch_at,closes_at,launch_threshold,opened_at,terminal_at,terminal_reason,status").order("waiting_opens_at", { ascending: false }),
      supabase.rpc("admin_venue_night_participant_counts"),
    ]);
    if (version !== requestVersion.current) return;
    // Keep available venue context when a night/count request fails.
    if (!venueResult.error) setVenues(venueResult.data ?? []);
    if (!nightResult.error) setNights(nightResult.data ?? []);
    if (!countResult.error) setCounts(Object.fromEntries((countResult.data ?? []).map(row => [row.venue_night_id, row.participant_count])));
    const failure = venueResult.error ?? nightResult.error ?? countResult.error;
    setLoadError(failure ? "Could not refresh the workspace. Displayed information may be out of date." : "");
    setLoadedAt(Date.now());
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => { await load(); })();
    const requests = requestVersion;
    const channel = supabase.channel("admin-venue-workspace")
      .on("postgres_changes", { event: "*", schema: "public", table: "venue_nights" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "venues" }, () => void load())
      .subscribe(status => { if (status === "SUBSCRIBED") void load(); });
    const timer = window.setInterval(() => void load(), 5_000);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    const onFocus = () => void load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      requests.current++;
      void supabase.removeChannel(channel);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [selectedId, selectedNightId, loading]);

  const venue = venues.find(item => item.id === selectedId) ?? null;
  const selectedNight = nights.find(item => item.id === selectedNightId && item.venue_id === selectedId) ?? null;
  // Resolve from fresh rows so polling/realtime can lock an open editor.
  const editingNight = nights.find(item => item.id === nightId && item.venue_id === selectedId) ?? null;
  const missingNight = Boolean(nightId && !editingNight);
  const groupsByVenue = useMemo(() => {
    const grouped = new Map<string, Night[]>();
    for (const night of nights) grouped.set(night.venue_id, [...(grouped.get(night.venue_id) ?? []), night]);
    return new Map([...grouped].map(([id, rows]) => [id, groupWorkspaceNights(rows, loadedAt)]));
  }, [nights, loadedAt]);
  const groups = groupsByVenue.get(selectedId ?? "") ?? { active: [], upcoming: [], history: [] };
  const locked = missingNight || Boolean(editingNight && isNightScheduleLocked(editingNight, loadedAt));
  const terminal = Boolean(editingNight && isTerminalNight(editingNight, loadedAt));
  const zoneChanged = Boolean(venue && venue.timezone !== scheduleZone);
  const hasValidLaunchOrder = launchFollowsEntry(nightDate, entryTime, launchTime);
  const closes = closingLocal(nightDate, launchTime, closeTime);
  const resolved = useMemo(() => [nightDate && entryTime ? `${nightDate}T${entryTime}` : "", nightDate && launchTime ? `${nightDate}T${launchTime}` : "", closes].map(value => resolveVenueLocalDateTime(value, scheduleZone)), [nightDate, entryTime, launchTime, closes, scheduleZone]);
  const instants = hasValidLaunchOrder && resolved.every(item => item.ok) ? resolved.map(item => item.ok ? item.iso : "") : null;
  const overlappingNight = instants ? nights.find(night => night.venue_id === selectedId && night.id !== nightId && night.waiting_opens_at < instants[2] && instants[0] < night.closes_at) : null;

  function openPanel(next: Panel) { setError(""); setNotice(""); setPanel(next); }
  function closePanel() { if (!busy) { setPanel(null); setError(""); } }
  function openVenueEditor() {
    setName(venue?.name ?? "");
    setCity(venue?.city === "New York" || venue?.timezone === "America/New_York" ? "New York" : "Paris");
    openPanel("venue");
  }
  function openNight(night: Night | null) {
    if (!venue) return;
    setNightId(night?.id ?? null);
    setScheduleZone(venue.timezone);
    setThreshold(night?.launch_threshold ?? 4);
    const waiting = night ? isoToVenueLocalInput(night.waiting_opens_at, venue.timezone) : "";
    setNightDate(waiting.slice(0, 10));
    setEntryTime(waiting.slice(11) || "20:00");
    setLaunchTime(night ? isoToVenueLocalInput(night.guaranteed_launch_at, venue.timezone).slice(11) : "21:00");
    setCloseTime(night ? isoToVenueLocalInput(night.closes_at, venue.timezone).slice(11) : "02:00");
    openPanel("night");
  }

  async function saveVenue(event: FormEvent) {
    event.preventDefault();
    if (busy || venue?.is_test_venue || (selectedId && !venue)) return;
    if (!isValidText(name, VENUE_NAME_MAX_LENGTH)) { setError("Venue name must contain 1 to 120 characters."); return; }
    const location = LOCATIONS.find(item => item.city === city);
    if (!location) { setError("Choose Paris or New York."); return; }
    const slug = venue?.slug ?? createVenueSlug(name);
    if (!isVenueSlug(slug)) { setError("The venue URL must contain 1 to 80 lowercase letters, digits or hyphens."); return; }
    setBusy(true); setError("");
    try {
      const { data, error: saveError } = await supabase.rpc("save_venue_details", { p_venue_id: venue?.id ?? null, p_name: name.trim(), p_slug: slug, p_city: location.city, p_timezone: location.timezone });
      if (saveError) { setError(saveError.message); return; }
      if (!data) { setError("The venue could not be saved. Please try again."); return; }
      const savedVenue: Venue = data;
      setVenues(current => [...current.filter(item => item.id !== savedVenue.id), savedVenue].sort((a, b) => a.name.localeCompare(b.name)));
      if (!venue) router.push(`/admin/venues/${savedVenue.id}`);
      setPanel(null);
      setNotice(venue ? "Venue details saved. Night schedules are unchanged." : "Venue created. Add its first night when the schedule is confirmed.");
      await load();
    } catch { setError("The venue could not be saved. Please try again."); }
    finally { setBusy(false); }
  }

  async function saveNight(event: FormEvent) {
    event.preventDefault();
    if (busy || !venue || missingNight) return;
    if (editingNight && isNightScheduleLocked(editingNight)) { setError("This night is now locked. Its schedule cannot be changed."); return; }
    if (zoneChanged) { setError("The venue time zone changed. Close and reopen this editor before saving."); return; }
    if (!isLaunchThreshold(threshold)) { setError("Launch threshold must be an integer from 1 to 2147483647."); return; }
    if (!hasValidLaunchOrder) { setError("Guaranteed launch must be later than entry on the same venue-local date."); return; }
    if (!instants) { const invalid = resolved.find(item => !item.ok); setError(invalid && !invalid.ok ? invalid.message : "Complete the night date and all three times."); return; }
    if (overlappingNight) { setError("This overlaps another scheduled night for this venue."); return; }
    setBusy(true); setError("");
    try {
      const schedule = { p_waiting_opens_at: instants[0], p_guaranteed_launch_at: instants[1], p_closes_at: instants[2], p_launch_threshold: threshold };
      const { error: saveError } = editingNight
        ? await supabase.rpc("update_venue_night_schedule", { p_venue_night_id: editingNight.id, ...schedule })
        : await supabase.rpc("schedule_venue_night", { p_venue_id: venue.id, ...schedule });
      if (saveError) { setError(saveError.message); return; }
      setPanel(null); setNotice(editingNight ? "Night schedule saved." : "Night scheduled.");
      await load();
    } catch { setError("The schedule could not be saved. Please try again."); }
    finally { setBusy(false); }
  }

  async function nightAction(action: "launch" | "close" | "reopen", target = editingNight) {
    if (busy || !target || isTerminalNight(target)) return;
    const allowed = action === "launch" ? target.status === "waiting" : action === "close" ? target.status === "live" : target.status === "closed" && Boolean(target.opened_at);
    if (!allowed) return;
    setBusy(true); setError("");
    try {
      const rpc = { launch: "launch_venue_night", close: "close_venue_night", reopen: "reopen_venue_night" } as const;
      const { error: actionError } = await supabase.rpc(rpc[action], { p_venue_night_id: target.id });
      if (actionError) { setError(actionError.message); return; }
      setPanel(null);
      setNotice(action === "close" ? "Room paused. Existing interactions are preserved." : action === "reopen" ? "Room reopened." : "Night launched.");
      await load();
    } catch { setError("The night could not be updated. Refresh and try again."); }
    finally { setBusy(false); }
  }

  async function cancelNight() {
    if (busy || !editingNight || isNightScheduleLocked(editingNight)) return;
    setBusy(true); setError("");
    try {
      const { error: cancelError } = await supabase.rpc("cancel_venue_night", { p_venue_night_id: editingNight.id });
      if (cancelError) { setError(cancelError.message); return; }
      setPanel(null); setNotice("Scheduled night cancelled."); await load();
    } catch { setError("The night could not be cancelled. Please try again."); }
    finally { setBusy(false); }
  }

  async function deleteVenue(event: FormEvent) {
    event.preventDefault();
    if (busy || !venue || venue.is_test_venue || deleteName !== venue.name) return;
    setBusy(true); setError("");
    try {
      const { error: deleteError } = await supabase.rpc("delete_venue_configuration", { p_venue_id: venue.id });
      if (deleteError) { setError(deleteError.message); return; }
      setPanel(null); router.push("/admin/venues"); setNotice("Venue deleted."); await load();
    } catch { setError("The venue could not be deleted. Please try again."); }
    finally { setBusy(false); }
  }

  async function openQr() {
    if (!venue) return;
    setQrDataUrl(""); setLinkCopied(false); openPanel("qr");
    try { setQrDataUrl(await QRCode.toDataURL(productionVenueUrl(venue.slug), { width: 360, margin: 2, color: { dark: "#111827", light: "#FFFFFF" } })); }
    catch { setError("The QR code could not be generated. Close this panel and try again."); }
  }
  async function copyVenueLink() {
    if (!venue) return;
    try { await navigator.clipboard.writeText(productionVenueUrl(venue.slug)); setLinkCopied(true); setError(""); }
    catch { setError("The link could not be copied. Select and copy the URL below."); }
  }

  function badge(night: Night) {
    const status = workspaceNightStatus(night, loadedAt);
    return <span className={styles.badge} data-status={status}>{status}</span>;
  }
  function nightRow(night: Night) {
    if (!venue) return null;
    return <Link key={night.id} className={styles.nightRow} href={`/admin/venues/${venue.id}/nights/${night.id}`} aria-label={`View night ${dateLabel(night.waiting_opens_at, venue.timezone)}`}>
      <span className={styles.rowContent}><strong>{dateLabel(night.waiting_opens_at, venue.timezone)}</strong></span>
      <span className={styles.scheduleTimes}>
        <span><small>Entry</small>{timeLabel(night.waiting_opens_at, venue.timezone)}</span>
        <span><small>Launch</small>{timeLabel(night.guaranteed_launch_at, venue.timezone)}</span>
        <span><small>Closes</small>{closeLabel(night, venue.timezone)}</span>
      </span>
      {badge(night)}<ChevronRight size={17} aria-hidden="true" className={styles.chevron} />
    </Link>;
  }

  const dialogTitle = panel === "venue" ? venue ? "Edit venue details" : "Create venue" : panel === "qr" ? "Production venue QR" : panel === "deleteVenue" ? "Delete venue?" : panel === "cancelNight" ? "Cancel this scheduled night?" : terminal ? "Night details" : locked ? "Manage night" : editingNight ? "Edit scheduled night" : "Schedule a night";

  return <div className={styles.workspaceRoot}>
    <nav aria-label="Venue navigation" className={styles.breadcrumb}>
      {selectedId ? <Link href="/admin/venues">Venues</Link> : <span aria-current="page">Venues</span>}
      {selectedId && <><ChevronRight size={14} aria-hidden="true" />{selectedNightId ? <Link href={`/admin/venues/${selectedId}`}>{venue?.name ?? "Venue"}</Link> : <span aria-current="page">{venue?.name ?? "Venue"}</span>}</>}
      {selectedNightId && <><ChevronRight size={14} aria-hidden="true" /><span aria-current="page">{selectedNight && venue ? dateLabel(selectedNight.waiting_opens_at, venue.timezone) : "Night"}</span></>}
    </nav>
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {loadError && <div role="alert" className={styles.error}>{loadError} <button type="button" className="underline" onClick={() => void load()}>Try again</button></div>}
    {!panel && error && <p role="alert" className={styles.error}>{error}</p>}
    {loading ? <p role="status" className={styles.muted}>Loading workspace…</p> : !selectedId ? <>
      <header className={styles.listHeader}><div><p className={styles.eyebrow}>Places & nights</p><h2 ref={heading} tabIndex={-1}>Venues</h2><p className={styles.muted}>Choose a place, then open the night you want to manage.</p></div><Button primary onClick={openVenueEditor}><Plus size={16} aria-hidden="true" /> Create venue</Button></header>
      {venues.length ? <div className={styles.list}>{venues.map(item => {
        const group = groupsByVenue.get(item.id);
        const next = group?.active[0] ?? group?.upcoming[0];
        return <Link key={item.id} className={styles.venueRow} href={`/admin/venues/${item.id}`}>
          <span className={styles.rowContent}><strong>{item.name}</strong><small>{item.city ?? item.timezone}{item.is_test_venue ? " · Test venue" : ""}</small></span>
          <span className={styles.rowContent}>{next ? badge(next) : <span className={styles.muted}>No active or upcoming night</span>}{next && <small>Entry {formatVenueInstant(next.waiting_opens_at, item.timezone)}</small>}</span>
          <span className={styles.muted}>{group?.upcoming.length ?? 0} upcoming nights</span><ChevronRight size={18} aria-hidden="true" />
        </Link>;
      })}</div> : !loadError && <div className={styles.empty}><h3>No venues yet</h3><p>Create a venue, then schedule its first night.</p></div>}
    </> : !venue ? <div className={styles.empty}><h2 ref={heading} tabIndex={-1}>Venue unavailable</h2><p>This venue could not be found or is no longer accessible.</p><Link className={styles.back} href="/admin/venues"><ArrowLeft size={16} aria-hidden="true" /> All venues</Link></div> : selectedNightId ? <>
      {!selectedNight ? <div className={styles.empty}><h2 ref={heading} tabIndex={-1}>Night unavailable</h2><p>This night could not be found at this venue. Return to the venue to choose another night.</p></div> : <>
        {arrivalNight !== selectedNight.id && <><header className={styles.nightPageHeader}>
          <div><p className={styles.eyebrow}>{venue.name}{venue.is_test_venue ? " · Test venue" : ""}</p><h2 ref={heading} tabIndex={-1}>{dateLabel(selectedNight.waiting_opens_at, venue.timezone)}</h2><p className={styles.muted}>{venue.city ?? venue.timezone} · All times in {venue.timezone}</p></div>
          {badge(selectedNight)}
        </header>
        <div className={styles.nightLayout}>
          <section className={styles.detailSection} aria-label="Night schedule">
            <div className={styles.sectionHeading}><h3>Schedule</h3>{!isNightScheduleLocked(selectedNight, loadedAt) && !bookingState?.frozen && <Button onClick={() => openNight(selectedNight)}>Edit schedule</Button>}</div>
            <dl className={styles.timeline}>
              <div><dt>Entry opens</dt><dd>{timeLabel(selectedNight.waiting_opens_at, venue.timezone)}</dd><dd className={styles.timeExplanation}>Guests can check in to this night.</dd></div>
              <div><dt>Guaranteed launch</dt><dd>{timeLabel(selectedNight.guaranteed_launch_at, venue.timezone)}</dd><dd className={styles.timeExplanation}>Matching opens earlier if {selectedNight.launch_threshold} people check in.</dd></div>
              <div><dt>Closes</dt><dd>{closeLabel(selectedNight, venue.timezone)}</dd><dd className={styles.timeExplanation}>The night ends and guests are checked out.</dd></div>
            </dl>
            {isNightScheduleLocked(selectedNight, loadedAt) && <p className={styles.lockNotice}>{isTerminalNight(selectedNight, loadedAt) ? "This night is part of venue history. Its schedule and status cannot be changed." : "Entry has opened. The schedule can no longer be edited."}</p>}
          </section>
          <section className={styles.detailSection} aria-label="Room controls">
            <div className={styles.sectionHeading}><h3>Room</h3></div>
            {isTerminalNight(selectedNight, loadedAt) ? <p className={styles.muted}>{selectedNight.terminal_reason === "cancelled" ? "This night was cancelled." : "This night has ended."} There are no room actions available.</p> : <>
              <p className={styles.attendance}>{counts[selectedNight.id] ?? (loadError ? "…" : 0)}<span>people checked in</span></p>
              <p className={styles.muted}>{selectedNight.status === "live" ? "Matching is open for this night." : selectedNight.status === "waiting" ? `Matching starts at ${selectedNight.launch_threshold} people or at the guaranteed launch time.` : selectedNight.opened_at ? "The room is paused. Existing interactions are preserved." : "The room opens automatically at the scheduled entry time."}</p>
              {(selectedNight.status === "live" || selectedNight.status === "waiting" || selectedNight.opened_at) && <div className={styles.roomActions}>
                {selectedNight.status === "waiting" && <Button primary disabled={busy} onClick={() => void nightAction("launch", selectedNight)}>Launch now</Button>}
                {selectedNight.status === "live" && <Button disabled={busy} onClick={() => void nightAction("close", selectedNight)}>Pause room</Button>}
                {selectedNight.status === "closed" && selectedNight.opened_at && <Button primary disabled={busy} onClick={() => void nightAction("reopen", selectedNight)}>Reopen room</Button>}
              </div>}
            </>}
          </section>
        </div>
        </>}
        {arrivalNight === selectedNight.id
          ? <ArrivalOperations key={selectedNight.id} nightId={selectedNight.id} venueName={venue.name} timezone={venue.timezone} onClose={() => setArrivalNight(null)} />
          : <ReservationOperations key={selectedNight.id} nightId={selectedNight.id} startsAt={selectedNight.waiting_opens_at} timezone={venue.timezone} terminal={isTerminalNight(selectedNight, loadedAt)} onBookingState={setBookingState} onNightChanged={() => void load()} onOpenArrivals={() => setArrivalNight(selectedNight.id)} />}
        {bookingState?.configured === false && !isNightScheduleLocked(selectedNight, loadedAt) && <section className={styles.nightCancellation} aria-label="Cancel night"><div><h3>Cancel this night</h3><p className={styles.muted}>Close this date permanently. The venue and its other nights stay available.</p></div><button type="button" className={styles.danger} disabled={busy} onClick={() => { setNightId(selectedNight.id); openPanel("cancelNight"); }}>Cancel scheduled night</button></section>}
      </>}
    </> : <>
      <section className={styles.venueHeader} aria-label="Venue details">
        <div className={styles.venueIdentity}>
          <p className={styles.eyebrow}>{venue.is_test_venue ? "Test venue" : "Venue"}</p>
          <h2 ref={heading} tabIndex={-1}>{venue.name}</h2>
          <p className={styles.location}><span>{venue.city ?? "Location not set"}</span><span>{venue.timezone}</span></p>
        </div>
        <div className={styles.venueTools}>
          <Button onClick={() => void openQr()}><QrCode size={16} aria-hidden="true" /> Production QR</Button>
          {!venue.is_test_venue && <Button onClick={openVenueEditor}>Edit details</Button>}
        </div>
        {venue.is_test_venue && <p className={styles.protectedNotice}>Permanent test venue details are protected.</p>}
      </section>
      <section className={styles.nights} aria-label="Nights">
        <div className={styles.sectionHeading}><div><h3>Nights</h3><p className={styles.muted}>Open a night to see its schedule and room controls.</p></div><Button primary onClick={() => openNight(null)}><Plus size={16} aria-hidden="true" /> Add night</Button></div>
        {groups.active.length > 0 && <section aria-label="Live and active nights"><div className={styles.groupHeading}><h4>Live and active</h4><span>{groups.active.length}</span></div>{groups.active.map(night => <article key={night.id} className={styles.active} data-status={workspaceNightStatus(night, loadedAt)}>
          <div className={styles.sectionHeading}><strong>{dateLabel(night.waiting_opens_at, venue.timezone)}</strong>{badge(night)}</div>
          <div className={styles.activeBody}><div><strong>{counts[night.id] ?? "…"}</strong><span>people checked in</span></div><div><span>Closes at</span><strong className={styles.closeTime}>{closeLabel(night, venue.timezone)}</strong></div><Link className={`night-button night-button-secondary ${styles.button}`} href={`/admin/venues/${venue.id}/nights/${night.id}`}>Open night <ArrowRight size={16} aria-hidden="true" /></Link></div>
        </article>)}</section>}
        <div className={styles.groupHeading}><h4>Upcoming</h4><span>{groups.upcoming.length}</span></div>
        {groups.upcoming.length ? <div className={styles.rows}>{groups.upcoming.map(nightRow)}</div> : !loadError && <div className={styles.empty}><CalendarDays size={26} aria-hidden="true" /><h4>{groups.active.length || groups.history.length ? "No upcoming nights" : "Ready for your first night"}</h4><p>Set an entry, launch and closing time.<br />The venue’s QR works for every night.</p><Button onClick={() => openNight(null)}>Schedule a night</Button></div>}
        <details key={venue.id} className={styles.history}><summary>History <span>{groups.history.length}</span></summary><p className={styles.muted}>Ended and cancelled nights are read-only.</p>{groups.history.length ? <div className={styles.rows}>{groups.history.map(nightRow)}</div> : <p className={styles.muted}>Completed nights will appear here.</p>}</details>
      </section>
    </>}
    {panel && <WorkspaceDialog title={dialogTitle} busy={busy} onClose={closePanel}>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {panel === "venue" && <form onSubmit={saveVenue}>
        <p className={styles.muted}>Venue details save independently from night schedules.</p>
        <fieldset disabled={busy || Boolean(venue?.is_test_venue)}>
          <label className={styles.field}>Venue name<input required value={name} onChange={event => setName(event.target.value)} className="night-input" /></label>
          <label className={styles.field}>Rollout location<select value={city} onChange={event => { if (LOCATIONS.some(location => location.city === event.target.value)) setCity(event.target.value); }} className="night-input">{LOCATIONS.map(location => <option key={location.city} value={location.city}>{location.city} · {location.timezone}</option>)}</select></label>
        </fieldset>
        {venue && !venue.is_test_venue && <details className={styles.venueOptions}>
          <summary>Delete venue</summary>
          <p>Permanently remove this venue and its nights. Confirmation is required.</p>
          <button type="button" disabled={busy} className={styles.danger} onClick={() => { setDeleteName(""); openPanel("deleteVenue"); }}>Delete venue…</button>
        </details>}
        <div className={styles.actions}><Button disabled={busy} onClick={closePanel}>Cancel</Button><Button type="submit" primary disabled={busy || Boolean(venue?.is_test_venue)}>{busy ? "Saving…" : venue ? "Save venue details" : "Create venue"}</Button></div>
      </form>}
      {panel === "qr" && venue && <><p className={styles.muted}>One permanent production QR for {venue.name}. The schedule opens the correct night.</p>{qrDataUrl ? <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrDataUrl} alt={`Permanent QR code for ${venue.name}`} width={240} height={240} className={styles.qr} />
      </> : !error && <p role="status" className={styles.muted}>Generating QR…</p>}<p className={styles.url}>{productionVenueUrl(venue.slug)}</p><p className={styles.muted}>This always points to getamourette.com, including when viewed from a preview.</p><div className={styles.actions}><Button onClick={() => void copyVenueLink()}>{linkCopied ? "Copied" : "Copy link"}</Button>{qrDataUrl && <a download={`${venue.slug}-qr.png`} href={qrDataUrl} className={`night-button night-button-primary ${styles.button}`}>Download QR</a>}</div></>}
      {(panel === "night" || panel === "cancelNight") && (missingNight || !venue) && <p role="alert" className={styles.error}>This night or venue is no longer available. Close this panel and refresh the workspace.</p>}
      {panel === "night" && venue && !missingNight && <><p className={styles.muted}>{venue.name} · {venue.timezone}</p>{editingNight && <div className={styles.nightTitle}><h3>{dateLabel(editingNight.waiting_opens_at, venue.timezone)}</h3>{badge(editingNight)}</div>}
        {locked && editingNight ? <>
          <dl className={styles.readonlyTimes}>{[["Entry opens", timeLabel(editingNight.waiting_opens_at, venue.timezone)], ["Guaranteed launch", timeLabel(editingNight.guaranteed_launch_at, venue.timezone)], ["Closes", closeLabel(editingNight, venue.timezone)], ["Launch threshold", `${editingNight.launch_threshold} people`]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <p className={styles.lockNotice}>{terminal ? "This night is part of venue history. Its schedule and status cannot be changed." : "The schedule is locked because entry has opened. You can still control the room below."}</p>
          <div className={styles.actions}><Button disabled={busy} onClick={closePanel}>Done</Button>{!terminal && <>{editingNight.status === "waiting" && <Button primary disabled={busy} onClick={() => void nightAction("launch")}>Launch now</Button>}{editingNight.status === "live" && <Button disabled={busy} onClick={() => void nightAction("close")}>Pause room</Button>}{editingNight.status === "closed" && editingNight.opened_at && <Button disabled={busy} onClick={() => void nightAction("reopen")}>Reopen room</Button>}</>}</div>
        </> : <form onSubmit={saveNight}><fieldset disabled={busy || zoneChanged}>
          <label className={styles.field}>Night date<input type="date" required value={nightDate} onChange={event => setNightDate(event.target.value)} className="night-input" /></label>
          <div className={styles.timeFields}><label className={styles.field}>Entry opens<input type="time" required value={entryTime} onChange={event => setEntryTime(event.target.value)} className="night-input" /></label><label className={styles.field}>Guaranteed launch<input type="time" required value={launchTime} onChange={event => setLaunchTime(event.target.value)} className="night-input" /></label><label className={styles.field}>Closes<input type="time" required value={closeTime} onChange={event => setCloseTime(event.target.value)} className="night-input" />{closes && closes.slice(0, 10) !== nightDate && <span className={styles.muted}>Next day</span>}</label></div>
          <label className={styles.field}>People needed to launch<input type="number" required min={1} max={2147483647} step={1} value={threshold} onChange={event => setThreshold(Number(event.target.value))} className="night-input" /></label>
        </fieldset><p className={styles.muted}>Times use {scheduleZone}. Overnight closing is detected automatically.</p>
          {zoneChanged && <p role="alert" className={styles.error}>The venue time zone changed. Close and reopen this editor before saving.</p>}
          {!hasValidLaunchOrder && nightDate && <p role="alert" className={styles.error}>Guaranteed launch must be later than entry on the same date. Only closing may roll into the next day.</p>}
          {overlappingNight && <p role="alert" className={styles.error}>This overlaps another scheduled night for {venue.name}.</p>}
          {editingNight && <button type="button" disabled={busy} className={styles.danger} onClick={() => openPanel("cancelNight")}>Cancel scheduled night</button>}
          <div className={styles.actions}><Button disabled={busy} onClick={closePanel}>Cancel</Button><Button type="submit" primary disabled={busy || locked || zoneChanged || !hasValidLaunchOrder || Boolean(overlappingNight)}>{busy ? "Saving…" : editingNight ? "Save schedule" : "Add scheduled night"}</Button></div>
        </form>}
      </>}
      {panel === "cancelNight" && editingNight && venue && <><p className={styles.muted}>{formatVenueInstant(editingNight.waiting_opens_at, venue.timezone)} at {venue.name} will be cancelled permanently. If this night has paid reservations, cancellation queues full deposit refunds. This does not mean bank processing has completed. The venue and its other nights stay unchanged.</p>{locked && <p role="alert" className={styles.error}>This night is now locked and cannot be cancelled.</p>}<div className={styles.actions}><Button disabled={busy} onClick={closePanel}>Keep night</Button><button type="button" disabled={busy || locked} className={styles.danger} onClick={() => void cancelNight()}>{busy ? "Cancelling…" : "Confirm cancellation"}</button></div></>}
      {panel === "deleteVenue" && venue && <form onSubmit={deleteVenue}><p className={styles.muted}>This permanently removes the venue and its nights. Venues with reservation history cannot be deleted. If active, people are immediately checked out and ephemeral interactions are removed.</p><label className={styles.field}>Type {venue.name} to confirm<input value={deleteName} disabled={busy} onChange={event => setDeleteName(event.target.value)} className="night-input" autoComplete="off" /></label><div className={styles.actions}><Button disabled={busy} onClick={closePanel}>Keep venue</Button><button type="submit" className={styles.danger} disabled={busy || venue.is_test_venue || deleteName !== venue.name}>{busy ? "Deleting…" : "Delete permanently"}</button></div></form>}
    </WorkspaceDialog>}
  </div>;
}
