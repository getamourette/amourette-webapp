"use client";
import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import type { LaunchOverview } from "@/lib/launch-operations";
import { isoToVenueLocalInput, resolveVenueLocalDateTime } from "@/lib/venue-time";
import { WorkspaceDialog } from "./WorkspaceDialog";
import styles from "./ReservationOperations.module.css";

export function Configuration({ overview, nightId, timezone, frozen, onClose, onSaved }: {
  overview: LaunchOverview; nightId: string; timezone: string; frozen: boolean; onClose: () => void; onSaved: () => void;
}) {
  const event = overview.event;
  const [opens, setOpens] = useState(event ? isoToVenueLocalInput(event.registration_opens_at, timezone) : "");
  const [capacity, setCapacity] = useState(String(event?.capacity ?? 50));
  const [amount, setAmount] = useState(((event?.deposit_minor ?? 1000) / 100).toFixed(2));
  const [currency, setCurrency] = useState(event?.currency ?? (timezone === "America/New_York" ? "usd" : "eur"));
  const [policy, setPolicy] = useState(event?.policy_version ?? "launch-v1");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    const resolved = resolveVenueLocalDateTime(opens, timezone);
    if (!resolved.ok) { setError(resolved.message); return; }
    if (!/^\d{1,6}$/.test(capacity) || Number(capacity) < Math.max(1, overview.allocations) || Number(capacity) > 100000) { setError(`Capacity must be ${Math.max(1, overview.allocations)}–100,000 and cover all allocated places.`); return; }
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || Number(amount) > 999999.99) { setError("Enter a deposit from 0.01 to 999,999.99 with at most two decimal places."); return; }
    if (!/^[A-Za-z0-9._-]{1,80}$/.test(policy)) { setError("Enter a policy version of 1–80 letters, digits, dots, underscores or hyphens."); return; }
    setBusy(true); setError("");
    const result = await supabase.rpc("admin_configure_launch_event", { p_night: nightId, p_opens: frozen ? event!.registration_opens_at : resolved.iso,
      p_capacity: Number(capacity), p_amount: Math.round(Number(amount) * 100), p_currency: currency, p_policy: policy });
    setBusy(false);
    if (result.error) { setError("Settings were refused. Check the opening time, current allocations and whether registration has already opened. Your draft has been kept."); return; }
    onSaved();
  }
  return <WorkspaceDialog title={event ? "Reservation settings" : "Set up reservations"} busy={busy} onClose={onClose}><form className={styles.form} onSubmit={save}>
    <p>Times are in {timezone}. Registration closes 30 minutes before entry opens.</p>
    <label>Registration opens<input type="datetime-local" value={opens} disabled={frozen} onChange={e => setOpens(e.target.value)} required /></label>
    <label>Reservation capacity<input inputMode="numeric" value={capacity} onChange={e => setCapacity(e.target.value)} required /></label>
    <label>Deposit amount<input inputMode="decimal" value={amount} disabled={frozen} onChange={e => setAmount(e.target.value)} required /></label>
    <label>Currency<select value={currency} disabled={frozen} onChange={e => setCurrency(e.target.value as "eur" | "usd")}><option value="eur">EUR</option><option value="usd">USD</option></select></label>
    <label>Policy version<input value={policy} disabled={frozen} onChange={e => setPolicy(e.target.value)} required /></label>
    <p className={styles.hint}>{frozen ? "Only capacity can change once registration opens." : "Opening registration freezes the deposit, currency, policy and event schedule."}</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}<button disabled={busy} type="submit">{busy ? "Saving…" : "Save reservation settings"}</button>
  </form></WorkspaceDialog>;
}
