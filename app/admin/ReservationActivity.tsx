"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { LaunchAudit } from "@/lib/launch-operations";
import { formatVenueInstant } from "@/lib/venue-time";
import { status } from "./reservation-format";
import styles from "./ReservationOperations.module.css";
export function ReservationActivity({ nightId, timezone }: { nightId: string; timezone: string }) {
  const [error, setError] = useState("");
  const [audit, setAudit] = useState<LaunchAudit[] | null>(null);
  const [auditMore, setAuditMore] = useState(false);
  const [auditBusy, setAuditBusy] = useState(false);
  async function loadAudit(more = false) {
    setAuditBusy(true); setError("");
    const { data, error } = await supabase.rpc("admin_launch_list", { p_night: nightId, p_kind: "audit", p_after: more ? audit?.at(-1)?.id ?? 0 : 0 });
    setAuditBusy(false);
    if (error || !Array.isArray(data)) { setError("History could not load. Try again."); return; }
    const next = data as unknown as LaunchAudit[];
    setAudit(previous => more ? [...previous ?? [], ...next] : next); setAuditMore(next.length === 100);
  }
  return <section className={styles.root}>
    {error && <p role="alert" className={styles.error}>{error} <button disabled={auditBusy} onClick={() => void loadAudit()}>Try again</button></p>}
      <details open className={styles.history} onToggle={e => { if (e.currentTarget.open && audit === null && !auditBusy) void loadAudit(); }}><summary>Event activity and audit history</summary>
        {audit?.map(item => <div key={item.id}><strong>{status(item.action)}</strong><time>{formatVenueInstant(item.created_at, timezone)}</time><p className={styles.reference}>{item.reservation_id ? `Reservation ${item.reservation_id}` : "Event"} · {item.actor_id ? `Founder ${item.actor_id}` : "Automatic process"}</p><p className={styles.reference}>{Object.entries(item.detail).map(([key, value]) => `${status(key)}: ${String(value)}`).join(" · ")}</p></div>)}
        {audit?.length === 0 && <p>No activity yet.</p>}{auditBusy && <p role="status">Loading history…</p>}{auditMore && <button disabled={auditBusy} onClick={() => void loadAudit(true)}>Load more history</button>}
      </details>
  </section>;
}
