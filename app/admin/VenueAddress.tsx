"use client";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { isValidText } from "@/lib/input-validation";
import styles from "./VenueWorkspace.module.css";

export function VenueAddress({ venueId }: { venueId: string }) {
  const [address, setAddress] = useState(""); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void supabase.from("venues").select("address").eq("id", venueId).single().then(({ data, error }) => {
      if (active) { if (error) setMessage("Address unavailable. Refresh before editing."); else { setAddress(data.address ?? ""); setLoading(false); } }
    });
    return () => { active = false; };
  }, [venueId]);
  async function save(e: FormEvent) {
    e.preventDefault(); if (busy || loading) return;
    if (address.trim() && !isValidText(address, 300)) { setMessage("Address must contain at most 300 characters."); return; }
    setBusy(true); setMessage("");
    try {
      const { error } = await supabase.rpc("admin_set_venue_address", { p_venue: venueId, p_address: address.trim() || null });
      setMessage(error ? "Address could not be saved. It is frozen while a booked evening is open." : "Address saved.");
    } catch { setMessage("Address could not be saved. Please retry."); }
    finally { setBusy(false); }
  }
  return <details className="mt-4"><summary className="cursor-pointer py-3">Reservation address</summary><form className="grid max-w-lg gap-3" onSubmit={save}>
    <label className={styles.field}>Street address<input className="night-input" value={address} disabled={loading || busy} onChange={e => setAddress(e.target.value)} /></label>
    <p className={styles.muted}>Set the confirmed venue address before reservations open. It is shown on the event page and reservation summary.</p>
    <button className="night-button night-button-secondary px-4 py-3" disabled={loading || busy}>Save address</button>{message && <p role="status">{message}</p>}
  </form></details>;
}
