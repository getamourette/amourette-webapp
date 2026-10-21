"use client";
import { useState } from "react";
import type { LaunchOverview } from "@/lib/launch-operations";
import { formatWorkspaceDate } from "@/lib/admin-venue-workspace";
import { registrationClosesAt } from "@/lib/admin-dashboard";
import { money, status } from "./reservation-format";
import { Configuration } from "./ReservationConfiguration";
import styles from "./ReservationOperations.module.css";
export function ReservationSettings({ overview, now, startsAt, timezone, nightId, terminal, frozen, refresh }: {
  now: number; overview: LaunchOverview | null; startsAt: string; timezone: string; nightId: string; terminal: boolean; frozen: boolean; refresh: () => void;
}) {
  const [configure, setConfigure] = useState(false);
  const event = overview?.event;
  const editable = !terminal && (overview ? Math.max(now, Date.parse(overview.now)) < Date.parse(startsAt) : false) && !event?.cancelled_at;
  return <section className={styles.root} aria-label="Reservations and deposits"><h3>Reservations & deposits</h3>
    {!overview ? <p role="status">Loading reservation settings…</p> : !event ? <div className={styles.setup}><p>Reservations are not configured for this night.</p>{editable && <button onClick={() => setConfigure(true)}>Set up reservations</button>}</div> : <>
      <div className={styles.settings}>
        <div className={styles.settingsHeading}>
          <div><strong>{overview.allocations} / {event.capacity} places allocated</strong><p>{money(event.deposit_minor, event.currency)} per person · {event.cancelled_at ? status(event.cancellation_reason) : `Registration opens ${formatWorkspaceDate(event.registration_opens_at, timezone, now, true)}`}</p><p>Booking closes {formatWorkspaceDate(registrationClosesAt(startsAt), timezone, now, true)} · Free cancellation until {formatWorkspaceDate(new Date(Date.parse(startsAt) - 48 * 3600_000).toISOString(), timezone, now, true)}</p></div>
          {editable && <button onClick={() => setConfigure(true)}>{frozen ? "Edit capacity" : "Edit reservation settings"}</button>}
        </div>
        <p className={styles.hint}>Policy: {event.policy_version}</p>
        {frozen && <p className={styles.hint}>Registration has opened. Deposit, currency, policy and schedule are fixed for this event.</p>}
      </div>
      {overview.finance.map(total => <div key={total.currency} className={styles.finance} aria-label={`${total.currency.toUpperCase()} deposit totals`}>
        {([["Charged", total.charged], ["Refunded", total.refunded], ["Refunds outstanding", total.outstanding], ["Held for attendance", total.held], ["Retained", total.retained]] as const).map(([label, amount]) => <div key={label}><span>{label}</span><strong>{money(amount, total.currency)}</strong></div>)}
        <p>{total.paid_count} paid reservations · {total.anomalies} needing review · {total.awaiting_funds} awaiting Stripe funds. These are deposit totals, before payment fees.</p>
        {total.oldest_unresolved_update && <p>Oldest queued or pending update: {formatWorkspaceDate(total.oldest_unresolved_update, timezone, now, true)}. Use Refresh to check progress.</p>}
        {total.awaiting_funds > 0 && <p className={styles.error}>Funding needed: check the available balance in Stripe and arrange funding with the payment operator. Existing refunds will resume; do not create another refund.</p>}
      </div>)}
    </>}
    {configure && overview && editable && <Configuration overview={overview} timezone={timezone} nightId={nightId} frozen={frozen} onClose={() => setConfigure(false)} onSaved={() => { setConfigure(false); refresh(); }} />}
  </section>;
}
