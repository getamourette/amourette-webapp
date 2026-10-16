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
  const [error, setError] = useState(""); const [uncertain, setUncertain] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null); const trigger = useRef<HTMLButtonElement>(null);
  async function request(confirm: boolean) {
    if (lock.current) return;
    lock.current = true; setBusy(true); onBusy(true); setError("");
    if (confirm) onConfirm();
    let refresh = false;
    try {
      const next = parseCancellation(await bookingRequest("cancellation", { action: confirm ? "confirm" : "preview", accept_retained: confirm && preview?.refundable === false && !preview.reservation.refund_state }, access));
      if (next.reservation.id !== id) throw new Error("invalid_cancellation");
      setPreview(next); setUncertain(false); onUpdate(next.reservation);
      refresh = next.reservation.state === "confirmed" && next.reservation.payment_state === "paid";
      if (next.confirmation_required) setError(s.crossed);
      requestAnimationFrame(() => heading.current?.focus());
    } catch (e) {
      // An uncertain response may hide a committed cancellation. Read before retry.
      setPreview(null); setUncertain(true);
      setError(e instanceof BookingError && e.status === 401 ? s.access : e instanceof BookingError && e.status === 409 ? s.unavailable : s.unknown);
    } finally { lock.current = false; setBusy(false); onBusy(false, refresh); }
  }
  return <section className={`${styles.stack} mt-6`} aria-label={s.title}>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!preview ? <button ref={trigger} className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => void request(false)}>{busy ? s.loading : uncertain ? s.refresh : s.title}</button> : <>
      <h3 ref={heading} tabIndex={-1}>{s.title}</h3>
      <p className={styles.note}>{s.deadline} {bookingTime(preview.reservation.cancellation_deadline, preview.timezone, locale)} · {preview.timezone}</p>
      {preview.can_cancel ? <>
        <p className={styles.notice}>{(preview.reservation.refund_state ? s.existingRefund : preview.refundable ? s.full : s.retained).replace("{amount}", depositLabel(preview.reservation.amount_minor, preview.reservation.currency, locale))}</p>
        <p className={styles.note}>{s.effects}</p>
        <button className={styles.button} disabled={busy} onClick={() => void request(true)}>{busy ? s.loading : s.confirm}</button>
      </> : <p role="status">{s.unavailable}</p>}
      <button className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={() => { setPreview(null); setError(""); requestAnimationFrame(() => trigger.current?.focus()); }}>{s.keep}</button>
    </>}
  </section>;
}
