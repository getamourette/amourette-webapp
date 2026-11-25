"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { WorkspaceDialog } from "./WorkspaceDialog";
import common from "./NightsHome.module.css";
import dialogStyles from "./WorkspaceDialog.module.css";
import styles from "./ProfileReview.module.css";

const CONFIRMATION = "DELETE";

// #258: a founder deletes a guest's profile and account on a verified request.
// The server decides whether it may happen; this only asks for a deliberate
// confirmation and reports the outcome.
export function DeleteAccount({ profileId, name, onDeleted }: { profileId: string; name: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const submitting = useRef(false);

  async function submit() {
    if (submitting.current || typed.trim() !== CONFIRMATION) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("Sign in again before deleting an account."); return; }
      const response = await fetch("/api/admin/account-deletion", {
        method: "POST", signal: AbortSignal.timeout(55_000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ profileId }),
      });
      const body = await response.json().catch(() => null) as { error?: unknown; deleted?: unknown } | null;
      if (!response.ok) {
        setError(typeof body?.error === "string" ? body.error : "The deletion did not finish. Try again.");
        return;
      }
      setOpen(false);
      setDone(body?.deleted === "already_deleted" ? `${name}’s account was already deleted. Any remaining photo files were removed.`
        : `${name}’s profile, photos and account were deleted.`);
    } catch {
      setError("Could not confirm the deletion. Check the connection and try again: it resumes where it stopped.");
    } finally { submitting.current = false; setBusy(false); }
  }

  // The dialog sits outside <details>: the section's phone rule stretches its buttons.
  return <><details className={styles.otherActions}>
    <summary>Account deletion</summary>
    <p className={styles.explanation}>Only on a verified request from this person, received through the privacy contact.</p>
    {done ? <div role="status"><p className={styles.explanation}>{done}</p>
      <button type="button" className="night-button night-button-secondary mt-3 px-4 py-3" onClick={onDeleted}>Reload profiles</button></div>
      : <button type="button" className={styles.dangerOutline} onClick={() => { setOpen(true); setTyped(""); setError(""); }}>Delete account…</button>}
  </details>
    {open && <WorkspaceDialog title={`Delete ${name}’s account?`} busy={busy} onClose={() => setOpen(false)}>
      <p className={dialogStyles.muted}>This cannot be undone. It deletes the profile, every photo file, likes, matches and messages, blocks, reports made or received once decided, and the account itself. Anyone they matched loses the chat.</p>
      <p className={dialogStyles.muted}>Kept: the founder action history and the matching consent proof, under their own retention, and any reservation or payment record, which is not linked to the account.</p>
      <label className={dialogStyles.field}>Type {CONFIRMATION} to confirm
        <input className={dialogStyles.scheduleInput} value={typed} disabled={busy} autoComplete="off" autoCapitalize="characters" spellCheck={false}
          onChange={event => setTyped(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void submit(); }} />
      </label>
      {error && <p className={dialogStyles.error} role="alert">{error}</p>}
      <div className={dialogStyles.actions}>
        <button type="button" className={common.button} disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
        <button type="button" className="night-button night-button-danger px-5 py-3" disabled={busy || typed.trim() !== CONFIRMATION} onClick={() => void submit()}>
          {busy ? "Deleting…" : "Delete account"}
        </button>
      </div>
    </WorkspaceDialog>}
  </>;
}
