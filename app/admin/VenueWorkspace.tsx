"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, ChevronRight, MapPin, Plus, QrCode, Settings2 } from "lucide-react";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { isValidText, isVenueSlug, createVenueSlug, isLaunchThreshold, VENUE_NAME_MAX_LENGTH } from "@/lib/input-validation";
import { launchFollowsEntry, productionVenueUrl } from "@/lib/admin-dashboard";
import { groupWorkspaceNights, isNightScheduleLocked, isTerminalNight, workspaceNightStatus } from "@/lib/admin-venue-workspace";
import { formatVenueInstant, isoToVenueLocalInput, resolveVenueLocalDateTime } from "@/lib/venue-time";
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

export function VenueWorkspace() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [nights, setNights] = useState<Night[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [selectedId]);

  const venue = venues.find(item => item.id === selectedId) ?? null;
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
      setSelectedId(savedVenue.id);
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

  async function nightAction(action: "launch" | "close" | "reopen") {
    if (busy || !editingNight || isTerminalNight(editingNight)) return;
    const allowed = action === "launch" ? editingNight.status === "waiting" : action === "close" ? editingNight.status === "live" : editingNight.status === "closed" && Boolean(editingNight.opened_at);
    if (!allowed) return;
    setBusy(true); setError("");
    try {
      const rpc = { launch: "launch_venue_night", close: "close_venue_night", reopen: "reopen_venue_night" } as const;
      const { error: actionError } = await supabase.rpc(rpc[action], { p_venue_night_id: editingNight.id });
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
      setPanel(null); setSelectedId(null); setNotice("Venue deleted."); await load();
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
    const date = new Date(night.waiting_opens_at);
    return <button key={night.id} type="button" className={styles.nightRow} onClick={() => openNight(night)} aria-label={`${isNightScheduleLocked(night, loadedAt) ? "View" : "Edit"} night ${dateLabel(night.waiting_opens_at, venue.timezone)}`}>
      <span className={styles.calendar} aria-hidden="true"><strong>{new Intl.DateTimeFormat("en", { timeZone: venue.timezone, day: "2-digit" }).format(date)}</strong><span>{new Intl.DateTimeFormat("en", { timeZone: venue.timezone, month: "short" }).format(date).toUpperCase()}</span></span>
      <span className={styles.rowContent}><strong>{dateLabel(night.waiting_opens_at, venue.timezone)}</strong><span className={styles.timeline}>Entry {timeLabel(night.waiting_opens_at, venue.timezone)} · Launch {timeLabel(night.guaranteed_launch_at, venue.timezone)} · Close {closeLabel(night, venue.timezone)}</span></span>
      {badge(night)}<ChevronRight size={17} aria-hidden="true" className={styles.chevron} />
    </button>;
  }

  const dialogTitle = panel === "venue" ? venue ? "Edit venue details" : "Create venue" : panel === "qr" ? "Production venue QR" : panel === "deleteVenue" ? "Delete venue?" : panel === "cancelNight" ? "Cancel this scheduled night?" : terminal ? "Night details" : locked ? "Manage night" : editingNight ? "Edit scheduled night" : "Schedule a night";

  return <div className={styles.workspaceRoot}>
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {loadError && <div role="alert" className={styles.error}>{loadError} <button type="button" className="underline" onClick={() => void load()}>Try again</button></div>}
    {!selectedId ? <>
      <header className="admin-page-header mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="night-kicker mb-2">Step 1 · Prepare the night</p><h2 ref={heading} tabIndex={-1}>Venues</h2><p className={styles.muted}>Choose a venue to manage its nights.</p></div><Button primary onClick={openVenueEditor}><Plus size={16} aria-hidden="true" /> Create venue</Button></header>
      {loading ? <p role="status" className={styles.muted}>Loading venues…</p> : venues.length ? <div className={styles.list}>{venues.map(item => {
        const group = groupsByVenue.get(item.id);
        const next = group?.active[0] ?? group?.upcoming[0];
        return <button key={item.id} type="button" className={styles.venueRow} onClick={() => { setSelectedId(item.id); setNotice(""); }}>
          <span className={styles.rowContent}><strong>{item.name}</strong><small>{item.city ?? item.timezone}{item.is_test_venue ? " · Test venue" : ""}</small></span>
          <span className={styles.rowContent}>{next ? badge(next) : <span className={styles.muted}>No active or upcoming night</span>}{next && <small>Entry {formatVenueInstant(next.waiting_opens_at, item.timezone)}</small>}</span>
          <span>{group?.upcoming.length ?? 0} upcoming nights</span><ChevronRight size={18} aria-hidden="true" />
        </button>;
      })}</div> : !loadError && <div className={styles.empty}><h3>No venues yet</h3><p>Create a venue, then schedule its first night.</p></div>}
    </> : <>
      <button type="button" className={styles.back} onClick={() => { setSelectedId(null); setNotice(""); }}><ArrowLeft size={16} aria-hidden="true" /> All venues</button>
      {!venue ? <p role="status" className={styles.muted}>This venue is no longer available. Return to all venues to refresh your selection.</p> : <>
        <header className={`admin-page-header ${styles.venueHeader}`}><div><p className="night-kicker mb-2">Venue workspace{venue.is_test_venue ? " · Test venue" : ""}</p><h2 ref={heading} tabIndex={-1}>{venue.name}</h2><p className={styles.location}><MapPin size={14} aria-hidden="true" />{venue.city ?? venue.timezone}<span>·</span>One venue, every night</p></div><Button onClick={() => void openQr()}><QrCode size={17} aria-hidden="true" /> Production QR</Button></header>
        <div className={styles.workspace}>
          <section className={styles.nights} aria-label="Nights"><div className={styles.sectionHeading}><div><h3>Nights</h3><p className={styles.muted}>All times in {venue.city ?? venue.timezone} · {venue.timezone}</p></div><Button primary onClick={() => openNight(null)}><Plus size={16} aria-hidden="true" /> Add night</Button></div>
            {groups.active.length > 0 && <section aria-label="Live and active nights">{groups.active.map(night => <article key={night.id} className={styles.active}>
              <div className={styles.sectionHeading}>{badge(night)}<span className={styles.muted}>{dateLabel(night.waiting_opens_at, venue.timezone)}</span></div>
              <div className={styles.activeBody}><div><strong>{counts[night.id] ?? "…"}</strong><span>people checked in</span></div><div><span>Closes at</span><strong className={styles.closeTime}>{timeLabel(night.closes_at, venue.timezone)}<small>{closeLabel(night, venue.timezone).slice(5)}</small></strong></div><Button onClick={() => openNight(night)}>Manage night <ArrowRight size={16} aria-hidden="true" /></Button></div>
              {night.status === "waiting" && <p className={styles.muted}>Launch at {night.launch_threshold} people or by {timeLabel(night.guaranteed_launch_at, venue.timezone)}.</p>}
            </article>)}</section>}
            <div className={styles.groupHeading}><h4>Upcoming</h4><span>{groups.upcoming.length}</span></div>
            {groups.upcoming.length ? <div className={styles.rows}>{groups.upcoming.map(nightRow)}</div> : !loadError && <div className={styles.empty}><CalendarDays size={26} aria-hidden="true" /><h4>{groups.active.length || groups.history.length ? "No upcoming nights" : "Ready for your first night"}</h4><p>Set an entry, launch and closing time.<br />The venue’s QR works for every night.</p><Button onClick={() => openNight(null)}>Schedule a night</Button></div>}
            <details key={venue.id} className={styles.history}><summary>History <span>{groups.history.length}</span></summary><p className={styles.muted}>Ended and cancelled nights are read-only.</p>{groups.history.length ? <div className={styles.rows}>{groups.history.map(nightRow)}</div> : <p className={styles.muted}>Completed nights will appear here.</p>}</details>
          </section>
          <aside><section className={styles.details} aria-label="Venue details"><div className={styles.sectionHeading}><h3>Venue details</h3><Settings2 size={17} aria-hidden="true" /></div><p className={styles.muted}>Permanent details for every night.</p><dl className={styles.metadata}><div><dt>Name</dt><dd>{venue.name}</dd></div><div><dt>Location</dt><dd>{venue.city ?? "Not set"}</dd></div><div><dt>Time zone</dt><dd>{venue.timezone}</dd></div></dl>
            {venue.is_test_venue ? <p className={styles.muted}>Permanent test venue details are protected.</p> : <><Button onClick={openVenueEditor}>Edit venue details</Button><details className={styles.venueOptions}><summary>Venue options</summary><p>Remove this venue and its nights.</p><button type="button" className={styles.danger} onClick={() => { setDeleteName(""); openPanel("deleteVenue"); }}>Delete venue</button></details></>}
          </section></aside>
        </div>
      </>}
    </>}
    {panel && <WorkspaceDialog title={dialogTitle} busy={busy} onClose={closePanel}>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {panel === "venue" && <form onSubmit={saveVenue}><p className={styles.muted}>Venue details save independently from night schedules.</p><fieldset disabled={busy || Boolean(venue?.is_test_venue)}><label className={styles.field}>Venue name<input required value={name} onChange={event => setName(event.target.value)} className="night-input" /></label><label className={styles.field}>Rollout location<select value={city} onChange={event => { if (LOCATIONS.some(location => location.city === event.target.value)) setCity(event.target.value); }} className="night-input">{LOCATIONS.map(location => <option key={location.city} value={location.city}>{location.city} · {location.timezone}</option>)}</select></label></fieldset><div className={styles.actions}><Button disabled={busy} onClick={closePanel}>Cancel</Button><Button type="submit" primary disabled={busy || Boolean(venue?.is_test_venue)}>{busy ? "Saving…" : venue ? "Save venue details" : "Create venue"}</Button></div></form>}
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
      {panel === "cancelNight" && editingNight && venue && <><p className={styles.muted}>{formatVenueInstant(editingNight.waiting_opens_at, venue.timezone)} at {venue.name} will be removed from upcoming nights. The venue and its other nights stay unchanged.</p>{locked && <p role="alert" className={styles.error}>This night is now locked and cannot be cancelled.</p>}<div className={styles.actions}><Button disabled={busy} onClick={() => openPanel("night")}>Keep night</Button><button type="button" disabled={busy || locked} className={styles.danger} onClick={() => void cancelNight()}>{busy ? "Cancelling…" : "Confirm cancellation"}</button></div></>}
      {panel === "deleteVenue" && venue && <form onSubmit={deleteVenue}><p className={styles.muted}>This permanently removes the venue and all its nights. If active, people are immediately checked out and ephemeral interactions are removed.</p><label className={styles.field}>Type {venue.name} to confirm<input value={deleteName} disabled={busy} onChange={event => setDeleteName(event.target.value)} className="night-input" autoComplete="off" /></label><div className={styles.actions}><Button disabled={busy} onClick={closePanel}>Keep venue</Button><button type="submit" className={styles.danger} disabled={busy || venue.is_test_venue || deleteName !== venue.name}>{busy ? "Deleting…" : "Delete permanently"}</button></div></form>}
    </WorkspaceDialog>}
  </div>;
}
