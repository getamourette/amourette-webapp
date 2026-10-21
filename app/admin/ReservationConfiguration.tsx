"use client";
import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import type { LaunchOverview } from "@/lib/launch-operations";
import { isoToVenueLocalInput, nextVenueRegistrationSlot } from "@/lib/venue-time";
import { registrationOpeningRefusal, validateReservationConfiguration } from "@/lib/reservation-configuration";
import { WorkspaceDialog } from "./WorkspaceDialog";
import styles from "./ReservationOperations.module.css";

export function Configuration({ overview, nightId, timezone, startsAt, frozen, initialOpeningError, onClose, onSaved }: {
  startsAt: string; initialOpeningError?: string; overview: LaunchOverview; nightId: string; timezone: string; frozen: boolean; onClose: () => void; onSaved: () => void;
}) {
  const event = overview.event;
  const [opens, setOpens] = useState(() => event ? isoToVenueLocalInput(event.registration_opens_at, timezone) : nextVenueRegistrationSlot(timezone, Math.max(Date.now(), Date.parse(overview.now))));
  const [capacity, setCapacity] = useState(String(event?.capacity ?? 50));
  const [amount, setAmount] = useState(((event?.deposit_minor ?? 1000) / 100).toFixed(2));
  const [currency, setCurrency] = useState(event?.currency ?? (timezone === "America/New_York" ? "usd" : "eur"));
  const [policy, setPolicy] = useState(event?.policy_version ?? "launch-v1");
  const [openingError, setOpeningError] = useState(initialOpeningError ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const { errors, payload } = validateReservationConfiguration({ opens, capacity, amount, currency, policy }, timezone, overview.allocations, { startsAt, now: Math.max(Date.now(), Date.parse(overview.now)), frozen });
    setOpeningError(errors.opens ?? "");
    if (!payload) { setError(Object.entries(errors).find(([field]) => field !== "opens")?.[1] ?? ""); return; }
    setBusy(true); setError("");
    const result = await supabase.rpc("admin_configure_launch_event", { p_night: nightId, ...payload,
      p_opens: frozen ? event!.registration_opens_at : payload.p_opens });
    setBusy(false);
    if (result.error) { const opening = registrationOpeningRefusal(result.error.message); if (opening) { setOpeningError(opening); return; } setError("Settings were refused. Check the opening time, current allocations and whether registration has already opened. Your draft has been kept."); return; }
    onSaved();
  }
  return <WorkspaceDialog title={event ? "Reservation settings" : "Set up reservations"} busy={busy} onClose={onClose}><form className={styles.form} onSubmit={save} noValidate>
    <p>Times are in {timezone}. Registration closes 30 minutes before entry opens.</p>
    <label>Registration opens<input type="datetime-local" value={opens} disabled={frozen} aria-invalid={!!openingError} aria-describedby={openingError ? "registration-opens-error" : undefined} onChange={e => { setOpens(e.target.value); setOpeningError(""); }} required /></label>
    {openingError && <p id="registration-opens-error" role="alert" className={styles.error}>{openingError}</p>}
    {!frozen && <button type="button" onClick={() => { setOpens(nextVenueRegistrationSlot(timezone, Math.max(Date.now(), Date.parse(overview.now)))); setOpeningError(""); }}>Use next available time</button>}
    <label>Reservation capacity<input inputMode="numeric" value={capacity} onChange={e => setCapacity(e.target.value)} required /></label>
    <label>Deposit amount<input inputMode="decimal" value={amount} disabled={frozen} onChange={e => setAmount(e.target.value)} required /></label>
    <label>Currency<select value={currency} disabled={frozen} onChange={e => setCurrency(e.target.value as "eur" | "usd")}><option value="eur">EUR</option><option value="usd">USD</option></select></label>
    <label>Policy version<input value={policy} disabled={frozen} onChange={e => setPolicy(e.target.value)} required /></label>
    <p className={styles.hint}>{frozen ? "Only capacity can change once registration opens." : "Opening registration freezes the deposit, currency, policy and event schedule."}</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}<button disabled={busy} type="submit">{busy ? "Saving…" : "Save reservation settings"}</button>
  </form></WorkspaceDialog>;
}
