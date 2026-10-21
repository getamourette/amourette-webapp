"use client";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { isLaunchThreshold } from "@/lib/input-validation";
import { validateNightSchedule } from "@/lib/admin-night-creation";
import { isNightScheduleLocked, isTerminalNight } from "@/lib/admin-venue-workspace";
import { isoToVenueLocalInput } from "@/lib/venue-time";
import type { Venue, Night } from "./workspace-types";
import { WorkspaceDialog } from "./WorkspaceDialog";
import styles from "./WorkspaceDialog.module.css";
import consoleStyles from "./NightsHome.module.css";
function Button({ children, onClick, primary = false, disabled = false, type = "button" }: {
  children: ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; type?: "button" | "submit";
}) {
  return <button type={type} onClick={onClick} disabled={disabled} className={`${consoleStyles.button} ${primary ? consoleStyles.primary : ""}`}>{children}</button>;
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

export function NightScheduleDialog({ venue, nights, overlapNights = nights, nightId = null, frozen = false, loadedAt, onClose, onSaved, onAction, onCancelNight }: {
  venue: Pick<Venue, "id" | "name" | "timezone">; nights: Night[]; overlapNights?: Pick<Night, "id" | "venue_id" | "waiting_opens_at" | "closes_at">[]; nightId?: string | null; frozen?: boolean; loadedAt: number;
  onClose: () => void; onSaved: (notice: string) => void;
  onAction?: (action: "launch" | "close" | "reopen") => void; onCancelNight?: () => void;
}) {
  const selectedId = venue.id;
  const editingNight = nights.find(night => night.id === nightId && night.venue_id === venue.id) ?? null;
  const missingNight = Boolean(nightId && !editingNight);
  const waiting = editingNight ? isoToVenueLocalInput(editingNight.waiting_opens_at, venue.timezone) : "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const closePanel = () => { if (!busy) onClose(); };
  const [nightDate, setNightDate] = useState(waiting.slice(0, 10));
  const [entryTime, setEntryTime] = useState(waiting.slice(11) || "20:00");
  const [launchTime, setLaunchTime] = useState(editingNight ? isoToVenueLocalInput(editingNight.guaranteed_launch_at, venue.timezone).slice(11) : "21:00");
  const [closeTime, setCloseTime] = useState(editingNight ? isoToVenueLocalInput(editingNight.closes_at, venue.timezone).slice(11) : "02:00");
  const [threshold, setThreshold] = useState(editingNight?.launch_threshold ?? 4);
  const [scheduleZone] = useState(venue.timezone);
  const locked = frozen || missingNight || Boolean(editingNight && isNightScheduleLocked(editingNight, loadedAt));
  const terminal = Boolean(editingNight && isTerminalNight(editingNight, loadedAt));
  const zoneChanged = Boolean(venue && venue.timezone !== scheduleZone);
  const { hasValidLaunchOrder, closes, resolved, instants, overlappingNight } = useMemo(() => validateNightSchedule(
    { date: nightDate, entry: entryTime, launch: launchTime, close: closeTime, threshold }, scheduleZone, selectedId, overlapNights, nightId,
  ), [nightDate, entryTime, launchTime, closeTime, threshold, scheduleZone, selectedId, overlapNights, nightId]);

  async function saveNight(event: FormEvent) {
    event.preventDefault();
    if (busy || !venue || missingNight) return;
    if (frozen || (editingNight && isNightScheduleLocked(editingNight))) { setError("This night is now locked. Its schedule cannot be changed."); return; }
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
      onSaved(editingNight ? "Night schedule saved." : "Night scheduled.");
    } catch { setError("The schedule could not be saved. Please try again."); }
    finally { setBusy(false); }
  }

  return <WorkspaceDialog title={terminal ? "Night details" : locked ? "Manage night" : editingNight ? "Edit scheduled night" : "Schedule a night"} busy={busy} onClose={closePanel}>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {missingNight && <p role="alert">This night or venue is no longer available. Close this panel and refresh the workspace.</p>}
      {!missingNight && <><p className={styles.muted}>{venue.name} · {venue.timezone}</p>{editingNight && <div className={styles.nightTitle}><h3>{dateLabel(editingNight.waiting_opens_at, venue.timezone)}</h3></div>}
        {locked && editingNight ? <>
          <dl className={styles.readonlyTimes}>{[["Entry opens", timeLabel(editingNight.waiting_opens_at, venue.timezone)], ["Guaranteed launch", timeLabel(editingNight.guaranteed_launch_at, venue.timezone)], ["Closes", closeLabel(editingNight, venue.timezone)], ["Launch threshold", `${editingNight.launch_threshold} people`]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <p className={styles.lockNotice}>{terminal ? "This night is part of venue history. Its schedule and status cannot be changed." : frozen ? "Registration has opened. Deposit, currency, policy and schedule are fixed for this event." : "The schedule is locked because entry has opened. You can still control the room below."}</p>
          <div className={styles.actions}><Button disabled={busy} onClick={closePanel}>Done</Button>{!terminal && onAction && <>{editingNight.status === "waiting" && <Button primary disabled={busy} onClick={() => onAction?.("launch")}>Launch now</Button>}{editingNight.status === "live" && <Button disabled={busy} onClick={() => onAction?.("close")}>Pause room</Button>}{editingNight.status === "closed" && editingNight.opened_at && <Button disabled={busy} onClick={() => onAction?.("reopen")}>Reopen room</Button>}</>}</div>
        </> : <form onSubmit={saveNight}><fieldset disabled={busy || zoneChanged}>
          <label className={styles.field}>Night date<input type="date" required value={nightDate} onChange={event => setNightDate(event.target.value)} className={styles.scheduleInput} /></label>
          <div className={styles.timeFields}><label className={styles.field}>Entry opens<input type="time" required value={entryTime} onChange={event => setEntryTime(event.target.value)} className={styles.scheduleInput} /></label><label className={styles.field}>Guaranteed launch<input type="time" required value={launchTime} onChange={event => setLaunchTime(event.target.value)} className={styles.scheduleInput} /></label><label className={styles.field}>Closes<input type="time" required value={closeTime} onChange={event => setCloseTime(event.target.value)} className={styles.scheduleInput} />{closes && closes.slice(0, 10) !== nightDate && <span className={styles.muted}>Next day</span>}</label></div>
          <label className={styles.field}>People needed to launch<input type="number" required min={1} max={2147483647} step={1} value={threshold} onChange={event => setThreshold(Number(event.target.value))} className={styles.scheduleInput} /></label>
        </fieldset><p className={styles.muted}>Times use {scheduleZone}. Overnight closing is detected automatically.</p>
          {zoneChanged && <p role="alert" className={styles.error}>The venue time zone changed. Close and reopen this editor before saving.</p>}
          {!hasValidLaunchOrder && nightDate && <p role="alert" className={styles.error}>Guaranteed launch must be later than entry on the same date. Only closing may roll into the next day.</p>}
          {overlappingNight && <p role="alert" className={styles.error}>This overlaps another scheduled night for {venue.name}.</p>}
          {editingNight && onCancelNight && <button type="button" disabled={busy} className={styles.danger} onClick={() => onCancelNight?.()}>Cancel scheduled night</button>}
          <div className={styles.actions}><Button disabled={busy} onClick={closePanel}>Cancel</Button><Button type="submit" primary disabled={busy || locked || zoneChanged || !hasValidLaunchOrder || Boolean(overlappingNight)}>{busy ? "Saving…" : editingNight ? "Save schedule" : "Add scheduled night"}</Button></div>
        </form>}
      </>}
  </WorkspaceDialog>;
}
