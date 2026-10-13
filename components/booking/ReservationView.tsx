"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { type Locale } from "@/lib/strings";
import { isRecord } from "@/lib/input-validation";
import { bookingStrings } from "@/lib/booking-strings";
import { bookingTime, depositLabel, parseBookingEvent, parseReservation, type BookingEvent, type Reservation, type StoredBooking } from "@/lib/booking";
import { readBooking, clearBooking } from "@/lib/booking-storage";
import { bookingLocale } from "@/lib/booking-storage";
import { bookingRequest, checkoutDestination, BookingError, isUnallocatedBookingRefusal } from "@/lib/booking-client";
import type { LaunchArrivalQr } from "@/lib/launch-qr";
import { ReservationQr } from "@/components/ReservationQr";
import { BookingShell } from "./BookingShell";
import { RecoveryForm } from "./RecoveryForm";
import styles from "./booking.module.css";

export function ReservationView({ id }: { id: string }) {
  const router = useRouter(); const [locale, setLocale] = useState<Locale>("en"); const s = bookingStrings[locale];
  const [saved, setSaved] = useState<StoredBooking | null>(null); const [reservation, setReservation] = useState<Reservation | null>(null);
  const [event, setEvent] = useState<BookingEvent | null>(null); const [eventError, setEventError] = useState(false); const [qr, setQr] = useState<LaunchArrivalQr | null>(null);
  const [qrError, setQrError] = useState(false); const [error, setError] = useState(""); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0); const busyRef = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>; let polls = 0; let fetching = false;
    async function load() {
      if (fetching || busyRef.current) return; fetching = true;
      const stored = readBooking(id);
      setSaved(stored);
      if (!stored) { setError("invalid_access"); setLoading(false); setQr(null); return; }
      const access = stored.access;
      try {
        const r = parseReservation(await bookingRequest("checkout", { action: "status" }, stored.access, controller.signal));
        if (r.id !== id) throw new Error("invalid_access");
        if (controller.signal.aborted) return;
        setReservation(r); setError("");
        async function loadEvent() {
          try {
            const e = parseBookingEvent(await bookingRequest(`checkout?night=${r.night_id}`, undefined, undefined, controller.signal));
            if (!controller.signal.aborted) { setEvent(e); setEventError(false); }
          } catch { if (!controller.signal.aborted) { setEvent(null); setEventError(true); } }
        }
        async function loadQr() {
          // The authorized QR endpoint checks event validity itself. Public event
          // metadata (including its shared IP limit) must never gate QR access.
          if (r.state === "confirmed" && r.payment_state === "paid") {
            try {
              const value = await bookingRequest("arrival-qr", {}, access, controller.signal);
              if (!isRecord(value) || value.reservation_id !== id || value.night_id !== r.night_id || typeof value.png_data_url !== "string" ||
                value.png_data_url.length > 100000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value.png_data_url) ||
                typeof value.timezone !== "string" || typeof value.starts_at !== "string" || typeof value.ends_at !== "string" ||
                !Number.isFinite(Date.parse(value.starts_at)) || !Number.isFinite(Date.parse(value.ends_at)) ||
                !(value.verified_at === null || (typeof value.verified_at === "string" && Number.isFinite(Date.parse(value.verified_at))))) throw new Error("invalid_qr");
              if (!controller.signal.aborted) { setQr(value as LaunchArrivalQr); setQrError(false); }
            } catch { if (!controller.signal.aborted) { setQr(null); setQrError(true); } }
          } else { setQr(null); setQrError(false); }
        }
        await Promise.all([loadEvent(), loadQr()]);
        // Bounded backoff. Never allocate/reconcile payment from background polling.
        if (r.state === "holding" && polls < 5) {
          const delay = [3000, 6000, 12000, 30000, 60000][polls++];
          clearTimeout(timer); timer = setTimeout(() => { if (document.visibilityState === "visible") void load(); }, delay);
        }
      } catch (e) { if (!controller.signal.aborted) { setError(e instanceof BookingError ? e.code : "unavailable"); setQr(null); if (e instanceof BookingError && e.status === 401) { setReservation(null); setEvent(null); } } }
      finally { fetching = false; if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    const recover = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("online", recover); document.addEventListener("visibilitychange", recover);
    return () => { controller.abort(); clearTimeout(timer); window.removeEventListener("online", recover); document.removeEventListener("visibilitychange", recover); };
  }, [id, version]);
  useEffect(() => { Promise.resolve().then(() => setLocale(bookingLocale())); }, []);
  async function resume() {
    if (!saved || busyRef.current) return; busyRef.current = true; setBusy(true); setError("");
    try {
      const result = await bookingRequest("checkout", saved.booking ? { action: "create", booking: saved.booking } : { action: "resume" }, saved.access);
      const destination = checkoutDestination(result);
      if (destination) window.location.assign(destination); else { setError("checkout_pending"); setVersion(v => v + 1); }
    } catch (e) {
      if (saved.booking && isUnallocatedBookingRefusal(e)) {
        clearBooking(id); setSaved(null);
        router.replace(`/events/${saved.booking.night}`);
      } else setError(e instanceof BookingError ? e.code : "unavailable");
    }
    finally { busyRef.current = false; setBusy(false); }
  }
  const night = reservation?.night_id ?? saved?.booking?.night;
  const title = !reservation ? s.reservation : reservation.state === "confirmed" && reservation.payment_state === "paid" ? s.confirmed : reservation.state === "cancelled" ? s.reservationCancelled : reservation.state === "expired" ? s.expired : s.holding;
  return <BookingShell locale={locale} setLocale={setLocale}><h1 className={styles.title}>{title}</h1>
    {loading && <p role="status">{s.loading}</p>}
    {error && <p role="alert" className={styles.error}>{error === "invalid_access" ? s.accessExpired : error === "request_refused" ? s.rate : error === "checkout_pending" ? s.review : s.error}</p>}
    {reservation && <div className={styles.layout}><section><h2 className="text-2xl">{event?.venue_name}</h2><p className={styles.note}>{event?.address} {event?.city}</p>
      {eventError && <p role="status" className={styles.notice}>{s.unavailable}</p>}
      <dl className={styles.details}>
        {event && <><div><dt>{s.event}</dt><dd>{bookingTime(reservation.starts_at, event.timezone, locale)}</dd></div><div><dt>{s.end}</dt><dd>{bookingTime(reservation.ends_at, event.timezone, locale)}</dd></div><div><dt>{s.timezone}</dt><dd>{event.timezone}</dd></div></>}
        <div><dt>{s.name}</dt><dd>{reservation.first_name}</dd></div><div><dt>{s.email}</dt><dd>{reservation.email}</dd></div>
        <div><dt>{s.deposit}</dt><dd>{depositLabel(reservation.amount_minor, reservation.currency, locale)}</dd></div><div><dt>{s.reference}</dt><dd>{reservation.id}</dd></div>
      </dl>
      {event && <p className={styles.notice}>{s.deadline}<br />{bookingTime(reservation.cancellation_deadline, event.timezone, locale)}<br />{event.timezone}</p>}
      <p className={styles.note}>{s.cancelHelp}</p><a href={`mailto:hello@getamourette.com?subject=${encodeURIComponent(`Reservation ${id}`)}`}>{s.support}</a>
      {reservation.refund_state && <p role="status" className={styles.notice}>{reservation.refund_state === "succeeded" ? s.refundDone : ["queued", "pending"].includes(reservation.refund_state) ? s.refundPending : s.refundIssue}</p>}
    </section><section className={styles.panel}>
      {qr && <ReservationQr qr={qr} locale={locale} />}{qrError && <p role="status" className={styles.notice}>{s.qrError}</p>}
      {reservation.state === "holding" && <><p className={styles.notice}>{s.pendingHelp}</p><p className={styles.note}>{s.holdHelp}</p>{event && <p className={styles.note}>{s.hold}: {bookingTime(reservation.hold_until, event.timezone, locale)}</p>}</>}
      {event?.status === "cancelled" && <p className={styles.notice}>{s.cancelled}</p>}{event?.status === "ended" && <p className={styles.notice}>{s.ended}</p>}
    </section></div>}
    <div className={`${styles.stack} mt-8 max-w-sm`}>
      {saved && (!reservation || reservation.state === "holding") && <button className={styles.button} disabled={busy || loading} onClick={() => void resume()}>{busy ? s.submitting : s.resume}</button>}
      {saved && <button className={`${styles.button} ${styles.secondary}`} disabled={busy || loading} onClick={() => setVersion(v => v + 1)}>{s.refresh}</button>}
      {night && <button className={`${styles.button} ${styles.secondary}`} onClick={() => { if (reservation && ["cancelled", "expired"].includes(reservation.state)) clearBooking(id); router.push(`/events/${night}`); }}>{s.newBooking}</button>}
    </div>
    {night ? <RecoveryForm night={night} locale={locale} /> : !loading && <p className={styles.note}>{s.recoveryEntry}</p>}
  </BookingShell>;
}
