"use client";
import { useRef, useState } from "react";
import type { Locale } from "@/lib/strings";
import { bookingRequest, BookingError } from "@/lib/booking-client";
import { bookingTime, depositLabel, type Reservation } from "@/lib/booking";
import { parseCancellation, type Cancellation } from "@/lib/launch-cancellation";
import { cancellationStrings } from "@/lib/cancellation-strings";
import styles from "./booking.module.css";
export function CancellationForm({ id, access, locale, onUpdate, onBusy, onConfirm }: {
  id: string; access: string; locale: Locale; onUpdate: (r: Reservation) => void; onBusy: (busy: boolean, refresh?: boolean) => void; onConfirm: () => void;
}) {
  const s = cancellationStrings[locale];
  const [preview, setPreview] = useState<Cancellation | null>(null);
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [error, setError] = useState(""); const [uncertain, setUncertain] = useState(false); const [stillActive, setStillActive] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null); const trigger = useRef<HTMLButtonElement>(null);
  // #405: after an uncertain outcome, `check` only reads the current state. It never reopens the confirmation.
  async function request(confirm: boolean, check = false) {
    if (lock.current) return;
    lock.current = true; setBusy(true); onBusy(true); setError(""); setStillActive(false);
    if (confirm) onConfirm();
    let refresh = false;
    try {
      const next = parseCancellation(await bookingRequest("cancellation", { action: confirm ? "confirm" : "preview", accept_retained: confirm && preview?.refundable === false && !preview.reservation.refund_state }, access));
      if (next.reservation.id !== id) throw new Error("invalid_cancellation");
      setPreview(check ? null : next); setUncertain(false); onUpdate(next.reservation);
      if (check) setStillActive(next.reservation.state === "confirmed");
      refresh = next.reservation.state === "confirmed" && next.reservation.payment_state === "paid";
      if (next.confirmation_required) setError(s.crossed);
      requestAnimationFrame(() => heading.current?.focus());
    } catch (e) {
      // An uncertain response may hide a committed cancellation. Read before retry.
      setPreview(null); setUncertain(true);
      setError(e instanceof BookingError && e.status === 401 ? s.access : e instanceof BookingError && e.status === 409 ? s.unavailable : s.unknown);
    } finally { lock.current = false; setBusy(false); onBusy(false, refresh); }
  }
  return <section className={styles.stack} aria-label={s.title}>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {stillActive && <p role="status" className={styles.notice}>{s.stillActive}</p>}
    {!preview ? <button ref={trigger} className={`${styles.button} ${styles.secondary}`} disabled={busy} aria-busy={busy} onClick={() => void request(false, uncertain)}>{busy ? s.loading : uncertain ? s.refresh : s.title}</button> : <>
      <h3 ref={heading} tabIndex={-1}>{s.title}</h3>
      <p className={styles.note}>{s.deadline} {bookingTime(preview.reservation.cancellation_deadline, preview.timezone, locale)}</p>
      {preview.can_cancel ? <>
        <p className={styles.notice}>{(preview.reservation.refund_state ? s.existingRefund : preview.refundable ? s.full : s.retained).replace("{amount}", depositLabel(preview.reservation.amount_minor, preview.reservation.currency, locale))}</p>
        <p className={styles.note}>{s.effects}</p>
        <button className={styles.button} disabled={busy} aria-busy={busy} onClick={() => void request(true)}>{busy ? s.loading : s.confirm}</button>
      </> : <p role="status">{s.unavailable}</p>}
      <button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => { setPreview(null); setError(""); requestAnimationFrame(() => trigger.current?.focus()); }}>{s.keep}</button>
    </>}
  </section>;
}
