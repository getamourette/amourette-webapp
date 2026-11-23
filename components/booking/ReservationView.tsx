"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { type Locale } from "@/lib/strings";
import { isRecord } from "@/lib/input-validation";
import { bookingStrings } from "@/lib/booking-strings";
import { bookingRange, bookingReference, bookingTime, depositLabel, parseBookingEvent, parseReservation, type BookingEvent, type Reservation, type StoredBooking } from "@/lib/booking";
import { freeCancellationOver, freeCancellationText } from "@/lib/free-cancellation";
import { readBooking, clearBooking } from "@/lib/booking-storage";
import { bookingLocale } from "@/lib/booking-storage";
import { bookingRequest, checkoutDestination, BookingError, isUnallocatedBookingRefusal } from "@/lib/booking-client";
import type { LaunchArrivalQr } from "@/lib/launch-qr";
import { ReservationQr } from "@/components/ReservationQr";
import { BookingShell } from "./BookingShell";
import { CancellationForm } from "./CancellationForm";
import { cancellationStrings } from "@/lib/cancellation-strings";
import { RecoveryForm } from "./RecoveryForm";
import styles from "./booking.module.css";

export function ReservationView({ id }: { id: string }) {
  const router = useRouter(); const [locale, setLocale] = useState<Locale>("en"); const s = bookingStrings[locale];
  const [saved, setSaved] = useState<StoredBooking | null>(null); const [reservation, setReservation] = useState<Reservation | null>(null);
  const [event, setEvent] = useState<BookingEvent | null>(null); const [eventError, setEventError] = useState(false); const [qr, setQr] = useState<LaunchArrivalQr | null>(null);
  const [qrError, setQrError] = useState(false); const [error, setError] = useState(""); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0); const busyRef = useRef(false); const operationRevision = useRef(0);
  // #400: every request here spends a budget shared by all reads of this reservation.
  // Event details load once, the payment polling schedule is not restarted by a
  // refresh, and a refresh in progress ignores further taps.
  const [refreshing, setRefreshing] = useState(false); const refreshingRef = useRef(false);
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const eventNight = useRef<string | null>(null);
  // #439: server time of the last event read, and the device time it arrived at.
  const eventRead = useRef<{ server: number; at: number } | null>(null); const polls = useRef(0); const qrRef = useRef<LaunchArrivalQr | null>(null);
  function showQr(value: LaunchArrivalQr | null, failed = false) { qrRef.current = value; setQr(value); setQrError(failed); }
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>; let fetching = false;
    const settle = () => { if (!controller.signal.aborted) { refreshingRef.current = false; setRefreshing(false); } };
    async function load() {
      if (fetching || busyRef.current) return; fetching = true;
      const stored = readBooking(id);
      setSaved(stored);
      if (!stored) { setError("invalid_access"); setLoading(false); showQr(null); settle(); return; }
      const access = stored.access; const revision = operationRevision.current;
      const active = () => !controller.signal.aborted && revision === operationRevision.current;
      try {
        const r = parseReservation(await bookingRequest("checkout", { action: "status" }, stored.access, controller.signal));
        if (r.id !== id) throw new Error("invalid_access");
        if (!active()) return;
        setReservation(r); setError(""); setFailedAt(null);
        async function loadEvent() {
          // Read once (#400), then once more when the free-cancellation deadline has been
          // crossed since: only the time elapsed on the device is used, never its clock.
          const read = eventRead.current; const deadline = Date.parse(r.cancellation_deadline);
          const crossed = read !== null && read.server <= deadline && read.server + Date.now() - read.at > deadline;
          if (eventNight.current === r.night_id && !crossed) return;
          try {
            const e = parseBookingEvent(await bookingRequest(`checkout?night=${r.night_id}`, undefined, access, controller.signal));
            if (active()) { eventNight.current = r.night_id; eventRead.current = { server: Date.parse(e.now), at: Date.now() }; setEvent(e); setEventError(false); }
          } catch { if (active() && eventNight.current !== r.night_id) { setEvent(null); setEventError(true); } }
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
              if (active()) showQr(value as LaunchArrivalQr);
            } catch (e) {
              // Only a definite answer removes a QR already on screen; a rate refusal
              // or a lost connection at the door must not.
              const definite = (e instanceof BookingError && [401, 409].includes(e.status)) || (e instanceof Error && e.message === "invalid_qr");
              if (active() && (definite || !qrRef.current)) showQr(null, true);
            }
          } else showQr(null);
        }
        await Promise.all([loadEvent(), loadQr()]);
        // Bounded backoff. Never allocate/reconcile payment from background polling.
        if (r.state === "holding" && polls.current < 5) {
          const delay = [3000, 6000, 12000, 30000, 60000][polls.current++];
          clearTimeout(timer); timer = setTimeout(() => { if (document.visibilityState === "visible") void load(); }, delay);
        }
      } catch (e) {
        if (active()) {
          setError(e instanceof BookingError ? e.code : "unavailable");
          // An unread status leaves the last known reservation and its QR in place.
          if (e instanceof BookingError && e.status === 401) { setReservation(null); setEvent(null); eventNight.current = null; eventRead.current = null; showQr(null); }
          else setFailedAt(Date.now());
        }
      }
      finally { fetching = false; if (active()) setLoading(false); settle(); }
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
  function refresh() { if (refreshingRef.current) return; refreshingRef.current = true; setRefreshing(true); setVersion(v => v + 1); }
  const night = reservation?.night_id ?? saved?.booking?.night;
  // Once the last known payment window has closed and the status could not be read,
  // the page no longer knows that payment can continue.
  const canResume = !reservation || (reservation.state === "holding" && (failedAt === null || Date.parse(reservation.hold_until) > failedAt));
  const paid = reservation?.state === "confirmed" && reservation.payment_state === "paid";
  const title = !reservation ? s.reservation : paid ? s.confirmed : reservation.state === "cancelled" ? s.reservationCancelled : reservation.state === "expired" ? s.expired : s.holding;
  // #405: one block answers "am I refunded / is it over" before any detail.
  const amount = reservation ? depositLabel(reservation.amount_minor, reservation.currency, locale) : "";
  const refund = reservation?.refund_state;
  const outcome: { icon: "done" | "wait" | "alert" | "closed"; title: string; text: string } | null = !reservation ? null :
    refund === "succeeded" ? { icon: "done", title: s.refundDoneTitle, text: s.refundDone } :
    refund === "queued" || refund === "pending" ? { icon: "wait", title: s.refundPendingTitle, text: s.refundPending } :
    refund ? { icon: "alert", title: s.refundIssueTitle, text: s.refundIssue } :
    reservation.state === "cancelled" ? (reservation.payment_state === "paid" && reservation.cancellation_refundable === false
      ? { icon: "closed", title: s.retainedTitle, text: cancellationStrings[locale].retainedOutcome }
      : { icon: "closed", title: s.releasedTitle, text: cancellationStrings[locale].cancelled }) :
    reservation.state === "expired" ? { icon: "closed", title: s.expiredTitle, text: s.expiredHelp } : null;
  const holding = reservation?.state === "holding";
  return <BookingShell locale={locale} setLocale={setLocale}><h1 className={styles.title}>{title}</h1>
    {loading && <p role="status">{s.loading}</p>}
    {error && <p role="alert" className={styles.error}>{error === "invalid_access" ? s.accessExpired : error === "request_refused" ? s.rate : error === "checkout_pending" ? s.review : s.error}</p>}
    {reservation && <>
      {outcome && <div role="status" className={styles.status}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" />
          {{ done: <path d="m7.5 12.5 3 3 6-6.5" />, wait: <path d="M12 7v5l3 2" />, alert: <path d="M12 7v6m0 3.5v.01" />, closed: <path d="m8.5 8.5 7 7m0-7-7 7" /> }[outcome.icon]}</svg>
        <div><strong>{outcome.title.replace("{amount}", amount)}</strong><p>{outcome.text}</p></div>
      </div>}
      <div className={styles.layout}>
        {(qr || qrError || holding || event?.status === "cancelled" || event?.status === "ended") && <section>
          {qr && <ReservationQr qr={qr} locale={locale} />}{qrError && <p role="status" className={styles.notice}>{s.qrError}</p>}
          {holding && <><p className={styles.notice}>{s.pendingHelp}</p><p className={styles.note}>{s.holdHelp}</p>{event && <p className={styles.note}>{s.hold}: {bookingTime(reservation.hold_until, event.timezone, locale)}</p>}</>}
          {event?.status === "cancelled" && <p className={styles.notice}>{s.cancelled}</p>}{event?.status === "ended" && <p className={styles.notice}>{s.ended}</p>}
        </section>}
        <section><h2 className="text-2xl">{event?.venue_name}</h2><p className={styles.note}>{event?.address}{event?.address && event.city ? ", " : ""}{event?.city}</p>
          {eventError && <p role="status" className={styles.notice}>{s.unavailable}</p>}
          <dl className={styles.details}>
            {event && <div><dt>{s.event}</dt><dd>{bookingRange(reservation.starts_at, reservation.ends_at, event.timezone, locale)}</dd></div>}
            <div><dt>{s.name}</dt><dd>{reservation.first_name}</dd></div><div><dt>{s.email}</dt><dd>{reservation.email}</dd></div>
            <div><dt>{s.deposit}</dt><dd>{amount}</dd></div>
            {event && (paid || holding) && <div><dt>{s.cancelLead}</dt><dd>{freeCancellationText(locale, freeCancellationOver(event.now, reservation.cancellation_deadline), bookingTime(reservation.cancellation_deadline, event.timezone, locale))}</dd></div>}
            {!qr && <div><dt>{s.reference}</dt><dd>{bookingReference(id)}</dd></div>}
          </dl>
          <details className={styles.help}><summary>{s.help}</summary><p className={styles.note}>{s.helpText}</p><code>{id}</code>
            <a href={`mailto:hello@getamourette.com?subject=${encodeURIComponent(`Reservation ${id}`)}`}>{s.support}</a></details>
        </section>
      </div></>}
    <div className={`${styles.stack} mt-8 max-w-sm`}>
      {saved && canResume && <button className={styles.button} disabled={busy || loading} aria-busy={busy} onClick={() => void resume()}>{busy ? s.submitting : s.resume}</button>}
      {saved && <button className={`${styles.button} ${styles.secondary}`} disabled={busy || loading || refreshing} aria-busy={refreshing} onClick={refresh}>{refreshing ? s.loading : s.refresh}</button>}
      {night && <button className={`${styles.button} ${styles.secondary}`} onClick={() => { if (reservation && ["cancelled", "expired"].includes(reservation.state)) clearBooking(id); router.push(`/events/${night}`); }}>{s.newBooking}</button>}
    </div>
    {saved && reservation && paid && <div className={styles.cancel}><CancellationForm id={id} access={saved.access} locale={locale}
      onBusy={(value, refresh) => { if (value) operationRevision.current++; busyRef.current = value; setBusy(value); if (!value) setLoading(false); if (refresh) setVersion(v => v + 1); }}
      onConfirm={() => showQr(null)}
      onUpdate={r => { setReservation(r); if (r.state !== "confirmed") showQr(null); }} /></div>}
    {/* Recovery is for a guest without access; an open reservation has no use for it. */}
    {!reservation && (night ? <RecoveryForm night={night} locale={locale} /> : !loading && <p className={styles.note}>{s.recoveryEntry}</p>)}
  </BookingShell>;
}
