"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import { productionVenueUrl } from "@/lib/admin-dashboard";
import { groupWorkspaceNights, workspaceNightStatus, workspaceNightTiming } from "@/lib/admin-venue-workspace";
import { useVenues, type DirectoryVenue, type VenueNight } from "./useVenues";
import { VenueDetailsForm } from "./VenueDetailsForm";
import { WorkspaceDialog } from "./WorkspaceDialog";
import consoleStyles from "./NightsHome.module.css";
import styles from "./Venues.module.css";

function EntranceQr({ venue }: { venue: DirectoryVenue }) {
  const [qr, setQr] = useState("");
  const [qrError, setQrError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const url = productionVenueUrl(venue.slug);
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(url, { width: 360, margin: 2, color: { dark: "#111827", light: "#FFFFFF" } })
      .then(data => { if (active) setQr(data); })
      .catch(() => { if (active) setQrError(true); });
    return () => { active = false; };
  }, [url, attempt]);
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); }
  }
  return <section className={styles.panel} aria-labelledby="entrance-qr"><h2 id="entrance-qr">Entrance QR</h2>
    <div className={styles.qrBody}>
      {qr ? <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.qr} src={qr} width={160} height={160} alt={`Permanent QR code for ${venue.name}`} />
      </> : !qrError && <p role="status">Generating QR…</p>}
      <div><p className={styles.url}>{url}</p><p className={styles.muted}>One QR for every night here</p></div>
    </div>
    {qrError && <div role="alert" className={consoleStyles.error}><p>The QR code could not be generated.</p><button className={consoleStyles.button} onClick={() => { setQrError(false); setAttempt(value => value + 1); }}>Try QR again</button></div>}
    {copyError && <p role="alert" className={consoleStyles.error}>The link could not be copied. Select and copy the URL above.</p>}
    <div className={styles.actions}><button className={consoleStyles.button} onClick={() => void copy()}>{copied ? "Copied" : "Copy link"}</button>{qr && <a className={consoleStyles.button} download={`${venue.slug}-qr.png`} href={qr}>Download PNG</a>}</div>
  </section>;
}

export function VenueDetail({ venueId }: { venueId: string }) {
  const router = useRouter();
  const { snapshot, error, load, updateVenue } = useVenues(venueId);
  const venue = snapshot?.venues.find(row => row.id === venueId);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteName, setDeleteName] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [busy, setBusy] = useState(false);
  const deletingRef = useRef(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState("");
  const groups = groupWorkspaceNights((snapshot?.nights ?? []).filter(night => night.venue_id === venueId), snapshot?.now ?? 0);
  const scheduleUrl = `/admin/nights/new?venue=${venueId}`;
  function stopEditing() {
    setEditing(false);
    // The edit trigger is mounted again after the form leaves the card.
    window.requestAnimationFrame(() => editButton.current?.focus());
  }
  async function deleteVenue(event: FormEvent) {
    event.preventDefault();
    if (deletingRef.current || !venue || venue.is_test_venue || deleteName !== venue.name) return;
    deletingRef.current = true; setBusy(true); setDeleteError("");
    try {
      const { error: refusal } = await supabase.rpc("delete_venue_configuration", { p_venue_id: venue.id });
      if (refusal) { setDeleteError(refusal.message); return; }
      router.push("/admin/venues");
    } catch { setDeleteError("The venue could not be deleted. Please try again."); }
    finally { deletingRef.current = false; setBusy(false); }
  }
  function nightRow(night: VenueNight) {
    if (!venue || !snapshot) return null;
    const timing = workspaceNightTiming(night, venue.timezone, snapshot.now);
    const status = workspaceNightStatus(night, snapshot.now);
    return <Link key={night.id} className={styles.nightRow} href={`/admin/nights/${night.id}`} aria-label={`View night ${timing.date}`}>
      <span><strong>{timing.date}</strong><small>{timing.hours}</small></span><span className={consoleStyles.chip} data-status={status}>{status}</span>
    </Link>;
  }
  return <div className={styles.page}>
    <nav aria-label="Venue navigation" className={styles.breadcrumb}><Link href="/admin/venues">Venues</Link><span>/</span><span aria-current="page">{venue?.name ?? "Venue"}</span></nav>
    {error && <div role="alert" className={consoleStyles.error}><p>Could not refresh the venue. {snapshot ? "Displayed information may be out of date." : "Please try again."}</p><button className={consoleStyles.button} onClick={() => void load()}>Try again</button></div>}
    {!snapshot && !error && <p role="status">Loading venue…</p>}
    {snapshot && (!venue ? <div className={consoleStyles.empty}><h1>Venue unavailable</h1><p>This venue could not be found or is no longer accessible.</p><Link className={consoleStyles.button} href="/admin/venues">All venues</Link></div> : <>
      <header className={consoleStyles.header}><div className={styles.identity}><h1>{venue.name}</h1><p>{venue.address || venue.city || "Location not set"} · {venue.timezone}</p></div><Link className={`${consoleStyles.button} ${consoleStyles.primary}`} href={scheduleUrl}>Schedule a night here</Link></header>
      {notice && <p role="status">{notice}</p>}
      <div className={styles.columns}>
        <section className={styles.panel} aria-labelledby="venue-nights"><h2 id="venue-nights">Nights at this venue</h2>
          {groups.active.length > 0 && <section aria-label="Happening now"><h3>Happening now</h3>{groups.active.map(nightRow)}</section>}
          {groups.upcoming.length > 0 && <section aria-label="Upcoming"><h3>Upcoming</h3>{groups.upcoming.map(nightRow)}</section>}
          {groups.active.length + groups.upcoming.length === 0 && <div className={styles.empty}><h3>{groups.history.length ? "No upcoming nights" : "No nights yet"}</h3><p>Set an entry, launch and closing time.</p><Link className={consoleStyles.button} href={scheduleUrl}>Schedule a night</Link></div>}
          <details className={styles.history}><summary>Past nights · {groups.history.length}</summary><p className={styles.muted}>Ended and cancelled nights are read-only.</p>{groups.history.map(nightRow)}</details>
        </section>
        <div className={styles.side}>
          <EntranceQr key={venue.slug} venue={venue} />
          <section className={styles.panel} aria-label="Venue details">
            <div className={styles.cardHeader}><h2>Details</h2>{!editing && !venue.is_test_venue && <button ref={editButton} className={consoleStyles.button} onClick={() => { setNotice(""); setEditing(true); }}>Edit</button>}</div>
            {editing && !venue.is_test_venue ? <VenueDetailsForm venue={venue} onIdentitySaved={updateVenue} onCancel={stopEditing} onSaved={saved => { updateVenue(saved); stopEditing(); setNotice("Venue details saved. Night schedules are unchanged."); void load(); }} /> : <>
              <dl className={styles.details}><div><dt>Name</dt><dd>{venue.name}</dd></div><div><dt>Entrance link</dt><dd>{productionVenueUrl(venue.slug)}</dd></div><div><dt>Location</dt><dd>{venue.city ?? "Location not set"} · {venue.timezone}</dd></div><div><dt>Address</dt><dd>{venue.address || "Not set"}</dd></div></dl>
              {venue.is_test_venue && <p className={styles.muted}>Permanent test venue details are protected.</p>}
            </>}
          </section>
          {!venue.is_test_venue && <details className={`${styles.panel} ${styles.dangerSection}`}><summary>Delete venue</summary><p className={styles.muted}>Permanently remove this venue and its nights. Venues with reservation history cannot be deleted.</p><button className={`${consoleStyles.button} ${styles.danger}`} onClick={() => { setDeleteName(""); setDeleteError(""); setDeleting(true); }}>Delete venue…</button></details>}
        </div>
      </div>
      {deleting && <WorkspaceDialog title="Delete venue?" busy={busy} onClose={() => { if (!busy) setDeleting(false); }}>
        <form onSubmit={deleteVenue}><p className={styles.muted}>This permanently removes the venue and its nights. Venues with reservation history cannot be deleted. If active, people are immediately checked out and ephemeral interactions are removed.</p>
          {deleteError && <p role="alert" className={consoleStyles.error}>{deleteError}</p>}
          <label className={styles.field}>Type {venue.name} to confirm<input value={deleteName} disabled={busy} onChange={event => setDeleteName(event.target.value)} autoComplete="off" /></label>
          <div className={styles.actions}><button type="button" className={consoleStyles.button} disabled={busy} onClick={() => setDeleting(false)}>Keep venue</button><button className={`${consoleStyles.button} ${styles.danger}`} disabled={busy || venue.is_test_venue || deleteName !== venue.name}>{busy ? "Deleting…" : "Delete permanently"}</button></div>
        </form>
      </WorkspaceDialog>}
    </>)}
  </div>;
}
