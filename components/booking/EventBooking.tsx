"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { type Locale } from "@/lib/strings";
import { bookingInput } from "@/lib/launch-contract";
import { isRecord, isUuid } from "@/lib/input-validation";
import { bookingStrings } from "@/lib/booking-strings";
import { parseBookingEvent, bookingTime, depositLabel, RESERVATION_POLICY_VERSION, type BookingEvent, type StoredBooking } from "@/lib/booking";
import { bookingForNight, storeBooking, clearBooking } from "@/lib/booking-storage";
import { bookingLocale } from "@/lib/booking-storage";
import { bookingRequest, checkoutDestination, BookingError, isUnallocatedBookingRefusal } from "@/lib/booking-client";
import { BookingShell } from "./BookingShell";
import { RecoveryForm } from "./RecoveryForm";
import styles from "./booking.module.css";

export function EventBooking({ night }: { night: string }) {
  const router = useRouter(); const submitting = useRef(false);
  const [locale, setLocale] = useState<Locale>("en"); const s = bookingStrings[locale];
  const [event, setEvent] = useState<BookingEvent | null>(null); const [loadError, setLoadError] = useState(false);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [accepted, setAccepted] = useState(false); const [lateAck, setLateAck] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [joined, setJoined] = useState(false);
  const [saved, setSaved] = useState<StoredBooking | null>(null); const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const value = parseBookingEvent(await bookingRequest(`checkout?night=${night}`, undefined, undefined, controller.signal));
        if (!controller.signal.aborted) { setEvent(value); setLoadError(false); setSaved(bookingForNight(night)); }
      } catch { if (!controller.signal.aborted) setLoadError(true); }
    }
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const timer = setInterval(refresh, 60000);
    window.addEventListener("online", refresh);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("online", refresh); };
  }, [night, version]);
  useEffect(() => { Promise.resolve().then(() => setLocale(bookingLocale())); }, []);
  const late = event ? Date.parse(event.now) > Date.parse(event.cancellation_deadline) : false;
  const full = event?.status === "open" && event.available === 0;
  async function reserve(e: FormEvent) {
    e.preventDefault(); if (submitting.current || !event) return;
    if (!accepted || (late && !lateAck)) { setError(s.required); return; }
    let booking;
    try { booking = bookingInput({ night, name, email, locale, policy: event.policy_version, late_ack: lateAck }); }
    catch { setError(s.invalid); return; }
    submitting.current = true; setBusy(true); setError("");
    let stored = saved;
    try {
      if (!stored) {
        const issued = await bookingRequest("credentials", {});
        if (!isRecord(issued) || !isUuid(issued.id) || typeof issued.access !== "string") throw new Error("invalid_access");
        stored = { id: issued.id, access: issued.access, expires: Date.now() + 7 * 86400000, booking };
        try { storeBooking(stored); } catch { setError(s.storage); return; }
        setSaved(stored);
      }
      const response = await bookingRequest("checkout", { action: "create", booking: stored.booking }, stored.access);
      const destination = checkoutDestination(response);
      if (destination) window.location.assign(destination); else router.push(`/reservations/${stored.id}`);
    } catch (e) {
      if (e instanceof BookingError && isUnallocatedBookingRefusal(e)) {
        // No additional allocation for a collision. Recovery never exposes its owner.
        if (stored) clearBooking(stored.id); setSaved(null);
        setError(e.code === "booking_refused" ? s.required : `${s.error} ${s.recoverHelp}`); setVersion(v => v + 1);
      } else if (stored) router.push(`/reservations/${stored.id}`);
      else setError(e instanceof BookingError && e.status === 429 ? s.rate : s.error);
    } finally { submitting.current = false; setBusy(false); }
  }
  async function join(e: FormEvent) {
    e.preventDefault(); if (submitting.current) return; submitting.current = true; setBusy(true); setError("");
    try { await bookingRequest("waitlist", { night, email, locale }); setJoined(true); }
    catch (e) { setError(e instanceof BookingError && e.status === 409 ? s.waitlistChanged : e instanceof BookingError && e.status === 429 ? s.rate : s.error); setVersion(v => v + 1); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <BookingShell locale={locale} setLocale={setLocale}>
    {!event ? <section><h1 className={styles.title}>{s.event}</h1><p role={loadError ? "alert" : "status"}>{loadError ? s.unavailable : s.loading}</p>{loadError && <button className={styles.button} onClick={() => setVersion(v => v + 1)}>{s.retry}</button>}</section> :
      <div className={styles.layout}><section><p>{s.event}</p><h1 className={styles.title}>{event.venue_name}</h1><p className={styles.lead}>{s.intro}</p>
        <p>{event.address}{event.address && event.city ? ", " : ""}{event.city}</p>
        <dl className={styles.details}><div><dt>{s.event}</dt><dd>{bookingTime(event.starts_at, event.timezone, locale)}</dd></div><div><dt>{s.end}</dt><dd>{bookingTime(event.ends_at, event.timezone, locale)}</dd></div><div><dt>{s.timezone}</dt><dd>{event.timezone}</dd></div></dl>
        <p className={styles.lead}>{s.free}</p><p className={styles.note}>{s.refund}</p><p className={styles.notice}>{s.deadline}<br /><strong>{bookingTime(event.cancellation_deadline, event.timezone, locale)}</strong><br />{event.timezone}</p>
        <a href={`/reservation-terms?lang=${locale}&version=${event.policy_version}`} target="_blank" rel="noopener noreferrer">{s.conditions}</a>
      </section><section className={styles.panel}>
        {event.status !== "open" ? <><h2 className="text-2xl">{s[{ not_open: "notOpen", closed: "closed", cancelled: "cancelled", ended: "ended" }[event.status] as "notOpen"]}</h2>{event.status === "not_open" && <p className={styles.note}>{s.opens}: {bookingTime(event.opens_at, event.timezone, locale)}</p>}{event.walk_ins_possible && <p className={styles.notice}>{s.walkin}</p>}</> :
          saved ? <div className={styles.stack}><h2 className="text-2xl">{s.forgotten}</h2><a className={styles.button} href={`/reservations/${saved.id}`}>{s.saved}</a></div> :
          full ? <><h2 className="text-2xl">{s.full}</h2>{joined ? <p role="status" className={styles.notice}>{s.waitlistDone}</p> : <form className={styles.form} onSubmit={join}><p className={styles.note}>{s.waitlistHelp}</p><label className={styles.field}>{s.email}<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label><button className={styles.button} disabled={busy}>{busy ? s.submitting : s.waitlist}</button></form>}</> :
          event.policy_version !== RESERVATION_POLICY_VERSION ? <p role="alert">{s.policyUnknown}</p> :
          <form className={styles.form} onSubmit={reserve} noValidate><h2 className="text-2xl">{s.available.replace("{count}", String(event.available))}</h2><p className={styles.note}>{s.remaining}</p>
            <label className={styles.field}>{s.name}<input required autoComplete="given-name" value={name} onChange={e => setName(e.target.value)} /></label>
            <label className={styles.field}>{s.email}<input type="email" required autoComplete="email" aria-describedby="booking-email-help" value={email} onChange={e => setEmail(e.target.value)} /></label><p id="booking-email-help" className={styles.note}>{s.emailHelp}</p>
            <label className={styles.check}><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /><span>{s.accept} <a href={`/reservation-terms?lang=${locale}`} target="_blank" rel="noopener noreferrer">{s.conditions}</a></span></label>
            {late && <div className={styles.notice}><p>{s.late}</p><label className={styles.check}><input type="checkbox" checked={lateAck} onChange={e => setLateAck(e.target.checked)} /><span>{s.lateAccept}</span></label></div>}
            <button className={styles.button} disabled={busy}>{busy ? s.submitting : s.reserve.replace("{amount}", depositLabel(event.amount_minor, event.currency, locale))}</button><p className={styles.note}>{s.paymentHint}</p>
          </form>}
        {error && <p role="alert" className={styles.error}>{error}</p>}{loadError && <p role="alert" className={styles.error}>{s.unavailable}</p>}
        <p className={styles.note}>{s.data} <a href={`/privacy?lang=${locale}`}>{s.privacy}</a></p><RecoveryForm night={night} locale={locale} />
      </section></div>}
  </BookingShell>;
}
