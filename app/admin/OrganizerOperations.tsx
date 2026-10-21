"use client";
import { useReservationAction } from "./useReservationAction";
import styles from "./ReservationOperations.module.css";
export function OrganizerOperations({ nightId, refresh, onNightChanged, onNotice }: { nightId: string; refresh: () => void; onNightChanged: () => void; onNotice: (notice: string) => void }) {
  const { openAction, dialog } = useReservationAction({ nightId, detail: null, refresh, onNightChanged, onNotice });
  return <section className={styles.root} aria-label="Danger zone"><h3>Danger zone</h3>
      <div className={styles.organizer}><h4>Organizer cancellation or postponement</h4><p>Refund every paid deposit, including deposits retained after a late cancellation. A postponed date requires a new night and new bookings.</p><div className={styles.actions}><button onClick={() => openAction("cancelled")}>Cancel event and refund deposits</button><button onClick={() => openAction("postponed")}>Postpone event and refund deposits</button></div></div>{dialog}
  </section>;
}
