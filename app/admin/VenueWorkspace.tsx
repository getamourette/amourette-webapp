"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, ChevronRight, Plus, QrCode } from "lucide-react";
import QRCode from "qrcode";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Venue, Night } from "./workspace-types";
import { isValidText, isVenueSlug, createVenueSlug, VENUE_NAME_MAX_LENGTH } from "@/lib/input-validation";
import { productionVenueUrl } from "@/lib/admin-dashboard";
import { groupWorkspaceNights, workspaceNightStatus } from "@/lib/admin-venue-workspace";
import { formatVenueInstant, isoToVenueLocalInput } from "@/lib/venue-time";
import { VenueAddress } from "./VenueAddress";
import { WorkspaceDialog } from "./WorkspaceDialog";
import consoleStyles from "./NightsHome.module.css";
import styles from "./VenueWorkspace.module.css";

type Panel = "venue" | "qr" | "deleteVenue" | null;
const LOCATIONS = [
  { city: "Paris", timezone: "Europe/Paris" },
  { city: "New York", timezone: "America/New_York" },
] as const;

function Button({ children, onClick, primary = false, disabled = false, type = "button" }: {
  children: ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; type?: "button" | "submit";
}) {
  return <button type={type} onClick={onClick} disabled={disabled} className={`night-button ${primary ? "night-button-primary" : "night-button-secondary"} ${styles.button}`}>{children}</button>;
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

export function VenueWorkspace({ venueId = null }: {
  venueId?: string | null;
}) {
  const router = useRouter();
  const selectedId = venueId;
  const [venues, setVenues] = useState<Venue[]>([]);
  const [nights, setNights] = useState<Night[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [panel, setPanel] = useState<Panel>(null);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("Paris");
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

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [selectedId, loading]);

  const venue = venues.find(item => item.id === selectedId) ?? null;
  const groupsByVenue = useMemo(() => {
    const grouped = new Map<string, Night[]>();
    for (const night of nights) grouped.set(night.venue_id, [...(grouped.get(night.venue_id) ?? []), night]);
    return new Map([...grouped].map(([id, rows]) => [id, groupWorkspaceNights(rows, loadedAt)]));
  }, [nights, loadedAt]);
  const groups = groupsByVenue.get(selectedId ?? "") ?? { active: [], upcoming: [], history: [] };
  function openPanel(next: Panel) { setError(""); setNotice(""); setPanel(next); }
  function closePanel() { if (!busy) { setPanel(null); setError(""); } }
  function openVenueEditor() {
    setName(venue?.name ?? "");
    setCity(venue?.city === "New York" || venue?.timezone === "America/New_York" ? "New York" : "Paris");
    openPanel("venue");
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
    return <Link key={night.id} className={styles.nightRow} href={`/admin/nights/${night.id}`} aria-label={`View night ${dateLabel(night.waiting_opens_at, venue.timezone)}`}>
      <span className={styles.rowContent}><strong>{dateLabel(night.waiting_opens_at, venue.timezone)}</strong></span>
      <span className={styles.scheduleTimes}>
        <span><small>Entry</small>{timeLabel(night.waiting_opens_at, venue.timezone)}</span>
        <span><small>Launch</small>{timeLabel(night.guaranteed_launch_at, venue.timezone)}</span>
        <span><small>Closes</small>{closeLabel(night, venue.timezone)}</span>
      </span>
      {badge(night)}<ChevronRight size={17} aria-hidden="true" className={styles.chevron} />
    </Link>;
  }

  const dialogTitle = panel === "venue" ? venue ? "Edit venue details" : "Create venue" : panel === "qr" ? "Production venue QR" : "Delete venue?";

  return <div className={styles.workspaceRoot}>
    <nav aria-label="Venue navigation" className={styles.breadcrumb}>
      {selectedId ? <Link href="/admin/venues">Venues</Link> : <span aria-current="page">Venues</span>}
      {selectedId && <><ChevronRight size={14} aria-hidden="true" /><span aria-current="page">{venue?.name ?? "Venue"}</span></>}
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
    </> : !venue ? <div className={styles.empty}><h2 ref={heading} tabIndex={-1}>Venue unavailable</h2><p>This venue could not be found or is no longer accessible.</p><Link className={styles.back} href="/admin/venues"><ArrowLeft size={16} aria-hidden="true" /> All venues</Link></div> : <>
      <section className={styles.venueHeader} aria-label="Venue details">
        <div className={styles.venueIdentity}>
          <p className={styles.eyebrow}>{venue.is_test_venue ? "Test venue" : "Venue"}</p>
          <h2 ref={heading} tabIndex={-1}>{venue.name}</h2>
          <p className={styles.location}><span>{venue.city ?? "Location not set"}</span><span>{venue.timezone}</span></p>
          {!venue.is_test_venue && <VenueAddress key={venue.id} venueId={venue.id} />}
        </div>
        <div className={styles.venueTools}>
          <Button onClick={() => void openQr()}><QrCode size={16} aria-hidden="true" /> Production QR</Button>
          {!venue.is_test_venue && <Button onClick={openVenueEditor}>Edit details</Button>}
        </div>
        {venue.is_test_venue && <p className={styles.protectedNotice}>Permanent test venue details are protected.</p>}
      </section>
      <section className={styles.nights} aria-label="Nights">
        <div className={styles.sectionHeading}><div><h3>Nights</h3><p className={styles.muted}>Open a night to see its schedule and room controls.</p></div><Link className={`${consoleStyles.button} ${consoleStyles.primary}`} href={`/admin/nights/new?venue=${venue.id}`}><Plus size={16} aria-hidden="true" />Schedule a night</Link></div>
        {groups.active.length > 0 && <section aria-label="Live and active nights"><div className={styles.groupHeading}><h4>Live and active</h4><span>{groups.active.length}</span></div>{groups.active.map(night => <article key={night.id} className={styles.active} data-status={workspaceNightStatus(night, loadedAt)}>
          <div className={styles.sectionHeading}><strong>{dateLabel(night.waiting_opens_at, venue.timezone)}</strong>{badge(night)}</div>
          <div className={styles.activeBody}><div><strong>{counts[night.id] ?? "…"}</strong><span>people checked in</span></div><div><span>Closes at</span><strong className={styles.closeTime}>{closeLabel(night, venue.timezone)}</strong></div><Link className={`night-button night-button-secondary ${styles.button}`} href={`/admin/nights/${night.id}`}>Open night <ArrowRight size={16} aria-hidden="true" /></Link></div>
        </article>)}</section>}
        <div className={styles.groupHeading}><h4>Upcoming</h4><span>{groups.upcoming.length}</span></div>
        {groups.upcoming.length ? <div className={styles.rows}>{groups.upcoming.map(nightRow)}</div> : !loadError && <div className={styles.empty}><CalendarDays size={26} aria-hidden="true" /><h4>{groups.active.length || groups.history.length ? "No upcoming nights" : "Ready for your first night"}</h4><p>Set an entry, launch and closing time.<br />The venue’s QR works for every night.</p><Link className={consoleStyles.button} href={`/admin/nights/new?venue=${venue.id}`}>Schedule a night</Link></div>}
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
      {panel === "deleteVenue" && venue && <form onSubmit={deleteVenue}><p className={styles.muted}>This permanently removes the venue and its nights. Venues with reservation history cannot be deleted. If active, people are immediately checked out and ephemeral interactions are removed.</p><label className={styles.field}>Type {venue.name} to confirm<input value={deleteName} disabled={busy} onChange={event => setDeleteName(event.target.value)} className="night-input" autoComplete="off" /></label><div className={styles.actions}><Button disabled={busy} onClick={closePanel}>Keep venue</Button><button type="submit" className={styles.danger} disabled={busy || venue.is_test_venue || deleteName !== venue.name}>{busy ? "Deleting…" : "Delete permanently"}</button></div></form>}
    </WorkspaceDialog>}
  </div>;
}
