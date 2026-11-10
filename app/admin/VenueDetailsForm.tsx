"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { createVenueSlug, isValidText, isVenueSlug, VENUE_NAME_MAX_LENGTH } from "@/lib/input-validation";
import { LOCATIONS } from "@/lib/admin-venues";
import type { DirectoryVenue } from "./useVenues";
import consoleStyles from "./NightsHome.module.css";
import styles from "./Venues.module.css";

export function VenueDetailsForm({ venue, onSaved, onIdentitySaved, onCancel }: {
  venue?: DirectoryVenue;
  onSaved: (venue: DirectoryVenue) => void;
  onIdentitySaved?: (venue: DirectoryVenue) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(venue?.name ?? "");
  const [city, setCity] = useState(venue?.city === "New York" || venue?.timezone === "America/New_York" ? "New York" : "Paris");
  const [address, setAddress] = useState(venue?.address ?? "");
  const [persisted, setPersisted] = useState(venue);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || venue?.is_test_venue) return;
    if (!isValidText(name, VENUE_NAME_MAX_LENGTH)) { setError("Venue name must contain 1 to 120 characters."); return; }
    const location = LOCATIONS.find(item => item.city === city);
    if (!location) { setError("Choose Paris or New York."); return; }
    if (address.trim() && !isValidText(address, 300)) { setError("Address must contain at most 300 characters."); return; }
    const slug = persisted?.slug ?? createVenueSlug(name);
    if (!isVenueSlug(slug)) { setError("The venue URL must contain 1 to 80 lowercase letters, digits or hyphens."); return; }
    submitting.current = true; setBusy(true); setError("");
    let identitySaved = false;
    try {
      const { data, error: saveError } = await supabase.rpc("save_venue_details", { p_venue_id: persisted?.id ?? null, p_name: name.trim(), p_slug: slug, p_city: location.city, p_timezone: location.timezone });
      if (saveError) { setError(saveError.message === "location is frozen while reservations are open" ? "Rollout location is frozen while a booked evening is open." : saveError.message); return; }
      if (!data) { setError("The venue could not be saved. Please try again."); return; }
      const saved: DirectoryVenue = { ...data, address: data.address ?? null };
      identitySaved = true;
      setPersisted(saved); onIdentitySaved?.(saved);
      if ((address.trim() || null) !== saved.address) {
        const { error: addressError } = await supabase.rpc("admin_set_venue_address", { p_venue: saved.id, p_address: address.trim() || null });
        if (addressError) { setError("Venue details saved. Address could not be saved. It is frozen while a booked evening is open. Retry or cancel to keep the saved details."); return; }
      }
      onSaved({ ...saved, address: address.trim() || null });
    } catch { setError(identitySaved ? "Venue details saved. Address could not be saved. Please retry." : "The venue could not be saved. Please try again."); }
    finally { submitting.current = false; setBusy(false); }
  }

  return <form onSubmit={save} aria-label={venue ? "Edit venue details" : "Add venue"}>
    <p className={styles.muted}>Venue details save independently from night schedules.</p>
    {error && <p role="alert" className={consoleStyles.error}>{error}</p>}
    <fieldset disabled={busy || venue?.is_test_venue}>
      <label className={styles.field}>Venue name<input aria-describedby={venue ? "venue-rename-hint" : undefined} required value={name} onChange={event => setName(event.target.value)} /></label>
      {venue && <p id="venue-rename-hint" className={styles.muted}>The entrance link and QR code stay the same when you rename a venue.</p>}
      <label className={styles.field}>Rollout location<select value={city} onChange={event => setCity(event.target.value)}>{LOCATIONS.map(location => <option key={location.city} value={location.city}>{location.city} · {location.timezone}</option>)}</select></label>
      <label className={styles.field}>Street address<input value={address} onChange={event => setAddress(event.target.value)} /></label>
    </fieldset>
    <div className={styles.actions}>
      {onCancel ? <button type="button" className={consoleStyles.button} disabled={busy} onClick={onCancel}>Cancel</button> : !busy && <Link className={consoleStyles.button} href={persisted ? `/admin/venues/${persisted.id}` : "/admin/venues"}>Cancel</Link>}
      <button className={`${consoleStyles.button} ${consoleStyles.primary}`} disabled={busy || venue?.is_test_venue}>{busy ? "Saving…" : venue || persisted ? "Save venue details" : "Add venue"}</button>
    </div>
  </form>;
}
