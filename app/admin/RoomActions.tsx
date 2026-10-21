"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isNightScheduleLocked, isTerminalNight } from "@/lib/admin-venue-workspace";
import type { Night } from "./workspace-types";
import { WorkspaceDialog } from "./WorkspaceDialog";
import styles from "./NightPage.module.css";
import consoleStyles from "./NightsHome.module.css";

export type RoomAction = "launch" | "close" | "reopen" | "cancel";
const labels = { launch: "Launch now", close: "Pause room", reopen: "Reopen room", cancel: "Confirm cancellation" };
const effects = {
  launch: "Open matching now for everyone checked in, before the threshold or guaranteed launch time.",
  close: "Pause the room. Existing interactions are preserved.",
  reopen: "Reopen the room and resume matching. Existing interactions are preserved.",
};

export function useRoomActions({ night, terminal, canCancel = false, refresh, onNotice }: {
  night: Night | null; terminal: boolean; canCancel?: boolean; refresh: () => void; onNotice: (message: string) => void;
}) {
  const [action, setAction] = useState<RoomAction | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  function confirm(value: RoomAction) { if (submitting.current) return; setError(""); onNotice(""); setAction(value); }
  function dismiss() { if (!submitting.current) setAction(null); }
  async function submit() {
    if (submitting.current || !night || !action || terminal || isTerminalNight(night)) return;
    const allowed = action === "launch" ? night.status === "waiting" : action === "close" ? night.status === "live" : action === "reopen" ? night.status === "closed" && !!night.opened_at : canCancel && !isNightScheduleLocked(night);
    if (!allowed) { setError("This night is now locked. Refresh and check its current state."); return; }
    submitting.current = true; setBusy(true); setError("");
    try {
      const rpc = { launch: "launch_venue_night", close: "close_venue_night", reopen: "reopen_venue_night", cancel: "cancel_venue_night" } as const;
      const result = await supabase.rpc(rpc[action], { p_venue_night_id: night.id });
      if (result.error) { setError(result.error.message); return; }
      setAction(null);
      onNotice(action === "cancel" ? "Scheduled night cancelled." : action === "close" ? "Room paused. Existing interactions are preserved." : action === "reopen" ? "Room reopened." : "Night launched.");
      refresh();
      window.dispatchEvent(new Event("admin-night-changed"));
    } catch { setError(action === "cancel" ? "The night could not be cancelled. Please try again." : "The night could not be updated. Refresh and try again."); }
    finally { submitting.current = false; setBusy(false); }
  }
  return { action, error, busy, confirm, dismiss, submit };
}

type Actions = ReturnType<typeof useRoomActions>;
export function RoomControls({ night, terminal, actions }: { night: Night; terminal: boolean; actions: Actions }) {
  return <section className={styles.card} aria-label="Room controls"><h2>Room</h2>
    {terminal ? <p>{night.terminal_reason === "cancelled" ? "This night was cancelled." : "This night has ended."} There are no room actions available.</p> : <>
      <p className={styles.muted}>{night.status === "live" ? "Matching is open for this night." : night.status === "waiting" ? `Matching starts at ${night.launch_threshold} people or at the guaranteed launch time.` : night.opened_at ? "The room is paused. Existing interactions are preserved." : "The room opens automatically at the scheduled entry time."}</p>
      <div className={styles.actions}>{night.status === "waiting" && <button className={consoleStyles.button} onClick={() => actions.confirm("launch")}>Launch now</button>}{night.status === "live" && <button className={consoleStyles.button} onClick={() => actions.confirm("close")}>Pause room</button>}{night.status === "closed" && night.opened_at && <button className={consoleStyles.button} onClick={() => actions.confirm("reopen")}>Reopen room</button>}</div>
    </>}
  </section>;
}

export function RoomConfirmation({ actions, terminal, cancellationText, inline = false }: {
  actions: Actions; terminal: boolean; cancellationText?: string; inline?: boolean;
}) {
  const { action, busy, error } = actions;
  if (!action) return null;
  const title = action === "cancel" ? "Cancel this scheduled night?" : labels[action];
  const content = <div className={styles.column}>
    <p>{action === "cancel" ? cancellationText : effects[action]}</p>
    {terminal && <p role="alert">This night is now locked and cannot be changed.</p>}
    {error && <p role="alert" className={consoleStyles.error}>{error}</p>}
    <div className={styles.actions}>
      <button className={consoleStyles.button} disabled={busy} onClick={actions.dismiss}>{action === "cancel" ? "Keep night" : "Keep current state"}</button>
      <button className={consoleStyles.button} disabled={busy || terminal} onClick={() => void actions.submit()}>{busy ? "Saving…" : labels[action]}</button>
    </div>
  </div>;
  return inline ? <section className={styles.card} aria-label="Confirm room change"><h3>{title}</h3>{content}</section>
    : <WorkspaceDialog title={title} busy={busy} onClose={actions.dismiss}>{content}</WorkspaceDialog>;
}
