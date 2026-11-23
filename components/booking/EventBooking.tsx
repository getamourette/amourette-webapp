"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/lib/strings";
import { GENDERS, type Gender } from "@/lib/profile";
import { bookingInput } from "@/lib/launch-contract";
import { isRecord, isUuid } from "@/lib/input-validation";
import { bookingStrings } from "@/lib/booking-strings";
import { parseBookingEvent, bookingRange, bookingTime, depositLabel, RESERVATION_POLICY_VERSION, type BookingEvent, type StoredBooking } from "@/lib/booking";
import { freeCancellationOver, freeCancellationText } from "@/lib/free-cancellation";
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
  const [name, setName] = useState(""); const [gender, setGender] = useState<Gender | "">(""); const [email, setEmail] = useState(""); const [accepted, setAccepted] = useState(false); const [lateAck, setLateAck] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [joined, setJoined] = useState(false);
  const [saved, setSaved] = useState<StoredBooking | null>(null); const [version, setVersion] = useState(0);
  // #405: a refusal is shown next to the action that caused it and brought into view.
  const alert = useRef<HTMLParagraphElement>(null);
  // The control to correct is outlined; each refusal replays the entrance, even with the same text.
  const [flagged, setFlagged] = useState<"" | "consent" | "gender" | "details">(""); const [refusals, setRefusals] = useState(0);
  function fail(message: string, field: typeof flagged = "") { setError(message); setFlagged(field); setRefusals(n => n + 1); requestAnimationFrame(() => alert.current?.scrollIntoView({ block: "center" })); }
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
    // A page restored from the back/forward cache (returning from Checkout) starts again from its saved attempt.
    const restore = (e: PageTransitionEvent) => { if (e.persisted) { submitting.current = false; setBusy(false); void load(); } };
    window.addEventListener("online", refresh); window.addEventListener("pageshow", restore);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("online", refresh); window.removeEventListener("pageshow", restore); };
  }, [night, version]);
  useEffect(() => { Promise.resolve().then(() => setLocale(bookingLocale())); }, []);
  const late = event ? freeCancellationOver(event.now, event.cancellation_deadline) : false;
  const full = event?.status === "open" && event.available === 0;
  async function reserve(e: FormEvent) {
    e.preventDefault(); if (submitting.current || !event) return;
    if (!accepted || (late && !lateAck)) { fail(s.required, "consent"); return; }
    if (!gender) { fail(s.needGender, "gender"); return; }
    let booking;
    try { booking = bookingInput({ night, name, email, locale, policy: event.policy_version, late_ack: lateAck, gender }); }
    catch { fail(s.invalid, "details"); return; }
    submitting.current = true; setBusy(true); setError(""); setFlagged("");
    // #405: the form stays in its waiting state until the next page replaces it.
    let stored = saved; let leaving = false;
    try {
      if (!stored) {
        const issued = await bookingRequest("credentials", {});
        if (!isRecord(issued) || !isUuid(issued.id) || typeof issued.access !== "string") throw new Error("invalid_access");
        stored = { id: issued.id, access: issued.access, expires: Date.now() + 7 * 86400000, booking };
        try { storeBooking(stored); } catch { fail(s.storage); return; }
        setSaved(stored);
      }
      const response = await bookingRequest("checkout", { action: "create", booking: stored.booking }, stored.access);
      const destination = checkoutDestination(response);
      leaving = true;
      if (destination) window.location.assign(destination); else router.push(`/reservations/${stored.id}`);
    } catch (e) {
      if (e instanceof BookingError && isUnallocatedBookingRefusal(e)) {
        // No additional allocation for a collision. Recovery never exposes its owner.
        if (stored) clearBooking(stored.id); setSaved(null);
        fail(e.code === "booking_refused" ? s.required : e.code === "payment_pending_limit" ? s.holdLimit : `${s.error} ${s.recoverHelp}`); setVersion(v => v + 1);
      } else if (stored) { leaving = true; router.push(`/reservations/${stored.id}`); }
      else fail(e instanceof BookingError && e.status === 429 ? s.rate : s.error);
    } finally { if (!leaving) { submitting.current = false; setBusy(false); } }
  }
  async function join(e: FormEvent) {
    e.preventDefault(); if (submitting.current) return; submitting.current = true; setBusy(true); setError("");
    try { await bookingRequest("waitlist", { night, email, locale }); setJoined(true); }
    catch (e) { fail(e instanceof BookingError && e.status === 409 ? s.waitlistChanged : e instanceof BookingError && e.status === 429 ? s.rate : s.error); setVersion(v => v + 1); }
    finally { submitting.current = false; setBusy(false); }
  }
  const problem = error && <p key={refusals} ref={alert} role="alert" className={styles.error}>{error}</p>;
  const amount = event ? depositLabel(event.amount_minor, event.currency, locale) : "";
  // The saved-attempt prompt waits for a submission in progress, so nothing flashes before Checkout opens.
  const view = !event || event.status !== "open" ? "closed" : saved && !busy ? "saved" : full ? (joined ? "joined" : "waitlist") : event.policy_version !== RESERVATION_POLICY_VERSION ? "policy" : "form";
  return <BookingShell locale={locale} setLocale={setLocale}>
    {!event ? <section><h1 className={styles.title}>{s.event}</h1><p role={loadError ? "alert" : "status"}>{loadError ? s.unavailable : s.loading}</p>{loadError && <button className={styles.button} onClick={() => setVersion(v => v + 1)}>{s.retry}</button>}</section> : <>
      <header className={styles.intro}><p className={styles.kicker}>{s.event}</p><h1 className={styles.title}>{event.venue_name}</h1>
        <p>{bookingRange(event.starts_at, event.ends_at, event.timezone, locale)}</p>
        <p className={styles.kicker}>{event.address}{event.address && event.city ? ", " : ""}{event.city}</p>
      </header>
      <section className={styles.narrow}>
        {view === "closed" ? <><h2 className="text-2xl">{s[event.status === "not_open" ? "notOpen" : event.status as "closed" | "cancelled" | "ended"]}</h2>{event.status === "not_open" && <p className={styles.note}>{s.opens}: {bookingTime(event.opens_at, event.timezone, locale)}</p>}{event.walk_ins_possible && <p className={styles.notice}>{s.walkin}</p>}</> :
          view === "saved" ? <div className={styles.stack}><h2 className="text-2xl">{s.forgotten}</h2><a className={styles.button} href={`/reservations/${saved!.id}`}>{s.saved}</a></div> :
          view === "joined" ? <><h2 className="text-2xl">{s.full}</h2><p role="status" className={styles.notice}>{s.waitlistDone}</p></> :
          view === "waitlist" ? <><h2 className="text-2xl">{s.full}</h2><form className={styles.form} onSubmit={join}><p className={styles.note}>{s.waitlistHelp}</p><label className={styles.field}>{s.email}<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>{problem}<button className={styles.button} disabled={busy} aria-busy={busy}>{busy ? s.submitting : s.waitlist}</button></form></> :
          view === "policy" ? <p role="alert">{s.policyUnknown}</p> :
          <form className={styles.form} onSubmit={reserve} noValidate>
            <label className={styles.field}>{s.name}<input required autoComplete="given-name" aria-invalid={flagged === "details" || undefined} value={name} onChange={e => { setName(e.target.value); setFlagged(""); }} /></label>
            <fieldset className={`${styles.choices} ${flagged === "gender" ? styles.flagged : ""}`} role="radiogroup" aria-required="true" aria-labelledby="booking-gender-label" aria-describedby="booking-gender-help"><legend id="booking-gender-label">{s.gender}</legend>
              <div>{GENDERS.map(value => <label className={styles.choice} key={value}><input type="radio" name="booking-gender" value={value} checked={gender === value} onChange={() => { setGender(value); setFlagged(""); }} /><span>{t[locale].genders[value]}</span></label>)}</div>
              <p id="booking-gender-help" className={styles.note}>{s.genderHelp}</p></fieldset>
            <div className={styles.field}><label htmlFor="booking-email">{s.email}</label><input id="booking-email" type="email" required autoComplete="email" aria-describedby="booking-email-help" aria-invalid={flagged === "details" || undefined} value={email} onChange={e => { setEmail(e.target.value); setFlagged(""); }} /><p id="booking-email-help" className={styles.hint}>{s.emailHelp}</p></div>
            <ul className={styles.pledge}><li><strong>{s.depositLead.replace("{amount}", amount)}</strong><span>{s.depositText}</span></li><li><strong>{s.cancelLead}</strong><span>{freeCancellationText(locale, late, bookingTime(event.cancellation_deadline, event.timezone, locale))}</span></li></ul>
            <label className={`${styles.check} ${flagged === "consent" && !accepted ? styles.flagged : ""}`}><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /><span>{s.accept} <a href={`/reservation-terms?lang=${locale}&version=${event.policy_version}`} target="_blank" rel="noopener noreferrer">{s.conditions}</a></span></label>
            {late && <div className={styles.notice}><p>{s.late}</p><label className={`${styles.check} ${flagged === "consent" && !lateAck ? styles.flagged : ""}`}><input type="checkbox" checked={lateAck} onChange={e => setLateAck(e.target.checked)} /><span>{s.lateAccept}</span></label></div>}
            {problem}
            <button className={styles.button} disabled={busy} aria-busy={busy}>{busy ? s.submitting : s.reserve.replace("{amount}", amount)}</button>
            <p className={styles.hint}>{s.paymentHint} {s.data} <a href={`/privacy?lang=${locale}`}>{s.privacy}</a></p>
          </form>}
        {!["form", "waitlist"].includes(view) && problem}{loadError && <p role="alert" className={styles.error}>{s.unavailable}</p>}
        <RecoveryForm night={night} locale={locale} />
      </section></>}
  </BookingShell>;
}
