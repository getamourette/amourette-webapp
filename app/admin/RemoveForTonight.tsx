"use client";

import { useCallback, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isValidText, SAFETY_NOTE_MAX_LENGTH } from "@/lib/input-validation";
import { ProfilePhoto } from "@/components/ProfilePhoto";
import { WorkspaceDialog } from "./WorkspaceDialog";
import common from "./NightsHome.module.css";
import dialogStyles from "./WorkspaceDialog.module.css";
import styles from "./Tonight.module.css";

const REASONS = {
  unsafe_behavior: "Unsafe behavior",
  harassment: "Harassment",
  underage: "Underage person",
  fake_profile: "Fake profile",
  other: "Other",
} as const;
type Reason = keyof typeof REASONS;
type Person = { id: string; name: string; photo: string | null; removed: boolean };

// #482: a founder removes anyone checked in tonight in a few taps, with or
// without a report. `eject_from_venue` closes their presence, blocks re-entry
// for this night and records who did it and why; the night's end cleans it up.
export function RemoveForTonight({ nightId, venueId }: { nightId: string; venueId: string }) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<Person | null>(null);
  const [reason, setReason] = useState<Reason>("unsafe_behavior");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const submitting = useRef(false);
  const request = useRef(0);

  // Read on demand only: a background repaint must never move a row under a tap.
  const load = useCallback(async () => {
    const version = ++request.current;
    setLoadError("");
    try {
      const [participants, ejections] = await Promise.all([
        supabase.rpc("admin_photo_queue", { p_night: nightId }).abortSignal(AbortSignal.timeout(15_000)),
        supabase.from("venue_ejections").select("profile_id").eq("venue_night_id", nightId).abortSignal(AbortSignal.timeout(15_000)),
      ]);
      if (version !== request.current) return;
      if (participants.error || ejections.error) throw new Error("read failed");
      const removed = new Set((ejections.data ?? []).map(row => row.profile_id));
      setPeople((participants.data ?? []).map(row => ({
        id: row.profile_id, name: row.first_name ?? "Participant",
        photo: row.displayed_path ?? row.pending_path ?? null, removed: removed.has(row.profile_id),
      })).sort((a, b) => Number(a.removed) - Number(b.removed) || a.name.localeCompare(b.name)));
    } catch {
      if (version === request.current) setLoadError("Could not load tonight’s participants. Try again.");
    }
  }, [nightId]);

  function toggle() {
    if (!open && !people) void load();
    setOpen(value => !value);
    setNotice("");
  }

  function confirm(person: Person) {
    if (submitting.current) return;
    setTarget(person); setReason("unsafe_behavior"); setNote(""); setError(""); setNotice("");
  }

  async function submit() {
    if (!target || submitting.current) return;
    if (!isValidText(note, SAFETY_NOTE_MAX_LENGTH, false)) { setError("Notes must contain at most 500 characters."); return; }
    submitting.current = true; setBusy(true); setError("");
    try {
      const result = await supabase.rpc("eject_from_venue", {
        p_profile_id: target.id, p_venue_id: venueId, p_reason: reason, p_note: note.trim() || undefined,
      }).abortSignal(AbortSignal.timeout(15_000));
      if (result.error) {
        setError(result.error.message.includes("no active venue night")
          ? "This night is paused or over: nobody can be removed right now."
          : "Could not remove this person. Try again.");
        return;
      }
      setPeople(rows => rows?.map(row => row.id === target.id ? { ...row, removed: true } : row) ?? rows);
      setNotice(`${target.name} was removed for tonight. Walk them out and watch tonight’s photo queue for a new profile.`);
      setTarget(null);
    } catch {
      setError("Could not remove this person. Check the connection and try again.");
    } finally {
      submitting.current = false; setBusy(false);
    }
  }

  const needle = query.trim().toLocaleLowerCase();
  const shown = (people ?? []).filter(person => !needle || person.name.toLocaleLowerCase().includes(needle));
  return <section className={styles.card} aria-label="Remove someone">
    <h2>Remove someone</h2>
    <p>Remove a participant from tonight’s room, with or without a report.</p>
    <button type="button" className={common.button} aria-expanded={open} onClick={toggle}>
      {open ? "Hide participants" : "Show participants"}
    </button>
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {open && <>
      {loadError && <div className={common.error} role="alert"><p>{loadError}</p><button type="button" className={common.button} onClick={() => void load()}>Try again</button></div>}
      {!people && !loadError && <p role="status">Loading participants…</p>}
      {people && <>
        <div className={styles.peopleTools}>
          <input type="search" aria-label="Search by first name" placeholder="Search by first name" value={query}
            onChange={event => setQuery(event.target.value)} className={styles.peopleSearch} />
          <button type="button" className={common.button} onClick={() => void load()}>Refresh list</button>
        </div>
        {shown.length === 0 && <p>{people.length === 0 ? "Nobody has checked in tonight yet." : "No participant matches this name."}</p>}
        <ul className={styles.people} aria-label="Tonight’s participants">
          {shown.map(person => <li key={person.id} className={styles.person}>
            <ProfilePhoto src={person.photo} alt="" loading="lazy" className={styles.personPhoto} />
            <span className={styles.personName}>{person.name}</span>
            <button type="button" className={common.button} disabled={person.removed || busy}
              aria-label={person.removed ? `${person.name} removed for tonight` : `Remove ${person.name} for tonight`}
              onClick={() => confirm(person)}>{person.removed ? "Removed" : "Remove"}</button>
          </li>)}
        </ul>
      </>}
    </>}
    {target && <WorkspaceDialog title={`Remove ${target.name} for tonight?`} busy={busy} onClose={() => setTarget(null)}>
      <div className={styles.removeTarget}>
        <ProfilePhoto src={target.photo} alt={target.name} className={styles.removePhoto} />
      </div>
      <p className={dialogStyles.muted}>They leave the room now and cannot check in again tonight. Their matches and chats close at the end of the night. Nobody is notified.</p>
      <fieldset disabled={busy}>
        <label className={dialogStyles.field}>Reason
          <select value={reason} onChange={event => setReason(event.target.value as Reason)}>
            {Object.entries(REASONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className={dialogStyles.field}>Note for the founders (optional)
          <textarea value={note} onChange={event => setNote(event.target.value)} rows={3}
            aria-invalid={!isValidText(note, SAFETY_NOTE_MAX_LENGTH, false)} className={dialogStyles.scheduleInput} />
        </label>
      </fieldset>
      {error && <p className={dialogStyles.error} role="alert">{error}</p>}
      <div className={dialogStyles.actions}>
        <button type="button" className={common.button} disabled={busy} onClick={() => setTarget(null)}>Cancel</button>
        <button type="button" className={`${common.button} ${styles.removeConfirm}`} disabled={busy} onClick={() => void submit()}>
          {busy ? "Removing…" : "Remove for tonight"}
        </button>
      </div>
    </WorkspaceDialog>}
  </section>;
}
