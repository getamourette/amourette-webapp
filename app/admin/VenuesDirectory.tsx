"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { LOCATIONS, parseVenueCity, venueCardSummary } from "@/lib/admin-venues";
import { useVenues } from "./useVenues";
import consoleStyles from "./NightsHome.module.css";
import styles from "./Venues.module.css";

function AddVenue() {
  return <Link className={`${consoleStyles.button} ${consoleStyles.primary}`} href="/admin/venues/new"><Plus size={16} aria-hidden="true" />Add venue</Link>;
}

export function VenuesDirectory() {
  const search = useSearchParams();
  const city = parseVenueCity(search.get("city"));
  const [showTests, setShowTests] = useState(false);
  const { snapshot, error, load } = useVenues();
  const venues = (snapshot?.venues ?? []).filter(venue => showTests || !venue.is_test_venue);
  const filtered = venues.filter(venue => !city || venue.city === city);
  function filterCity(value: string | null) {
    const params = new URLSearchParams();
    if (value) params.set("city", value);
    window.history.pushState(null, "", `/admin/venues${params.size ? `?${params}` : ""}`);
  }
  return <div className={styles.page}>
    <header className={consoleStyles.header}><div><h1>Venues</h1><p>The bars Amourette runs in. Open one to see its QR and its nights.</p></div><AddVenue /></header>
    <div className={consoleStyles.filters}>
      <div className={`${consoleStyles.segment} ${styles.cities}`} role="group" aria-label="Filter by city">
        <button aria-pressed={!city} onClick={() => filterCity(null)}>All · {venues.length}</button>
        {LOCATIONS.map(location => <button key={location.city} aria-pressed={city === location.city} onClick={() => filterCity(location.city)}>{location.city} · {venues.filter(venue => venue.city === location.city).length}</button>)}
      </div>
      <label className={consoleStyles.testToggle}><input type="checkbox" checked={showTests} onChange={event => setShowTests(event.target.checked)} />Show test venues</label>
    </div>
    {error && <div role="alert" className={consoleStyles.error}><p>Could not load venues. {snapshot ? "Displayed information may be out of date." : "Please try again."}</p><button className={consoleStyles.button} onClick={() => void load()}>Try again</button></div>}
    {!snapshot && !error && <p role="status">Loading venues…</p>}
    {snapshot && (filtered.length ? <div className={styles.grid}>{filtered.map(venue => {
      const summary = venueCardSummary(snapshot.nights.filter(night => night.venue_id === venue.id), venue.timezone, snapshot.now);
      return <Link key={venue.id} className={styles.venueCard} href={`/admin/venues/${venue.id}`}>
        <div className={styles.cardHeader}><h2>{venue.name}</h2>{venue.is_test_venue && <span className={consoleStyles.chip}>Test</span>}</div>
        <p className={styles.muted}>{venue.city ?? venue.timezone}{venue.address ? ` · ${venue.address}` : ""}</p>
        <span className={consoleStyles.chip} data-status={summary.status}>{summary.label}</span>
        <p className={styles.secondary}>{summary.secondary}</p>
      </Link>;
    })}</div> : <div className={consoleStyles.empty}><h2>{snapshot.venues.length === 0 ? "No venues yet" : "No venues match these filters"}</h2><p>{snapshot.venues.length === 0 ? "Add a venue, then schedule its first night." : "Choose another city or show test venues."}</p>{snapshot.venues.length === 0 && <AddVenue />}</div>)}
  </div>;
}
