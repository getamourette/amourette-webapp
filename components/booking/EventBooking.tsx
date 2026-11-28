"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { t, type Locale } from "@/lib/strings";
import { GENDERS, type Gender } from "@/lib/profile";
import { bookingInput, type BookingChannel } from "@/lib/launch-contract";
import { isRecord, isUuid, isValidEmail, isValidText } from "@/lib/input-validation";
import { bookingStrings } from "@/lib/booking-strings";
import { parseBookingEvent, bookingDay, bookingHours, bookingTime, depositLabel, showsPlacesLeft, venueAddress, RESERVATION_POLICY_VERSION, storedBookingLifetime, type BookingEvent, type StoredBooking } from "@/lib/booking";
import { lateAcknowledgementRequired, freeCancellationText } from "@/lib/free-cancellation";
import { bookingForNight, storeBooking, clearBooking } from "@/lib/booking-storage";
import { bookingLocale } from "@/lib/booking-storage";
import { bookingRequest, checkoutDestination, BookingError, isUnallocatedBookingRefusal } from "@/lib/booking-client";
import { BookingShell } from "./BookingShell";
import { RecoveryForm } from "./RecoveryForm";
import styles from "./booking.module.css";

const INSTAGRAM_URL = "https://www.instagram.com/amouretteapp/";
type Field = "name" | "gender" | "email" | "consent";
const missingKey = { name: "missingName", gender: "missingGender", email: "missingEmail", consent: "missingConsent" } as const;
const icon = { clock: <><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.4 1.6" /></>, pin: <><path d="M8 14.5s4.8-4.4 4.8-8a4.8 4.8 0 0 0-9.6 0c0 3.6 4.8 8 4.8 8z" /><circle cx="8" cy="6.5" r="1.7" /></>,
  glass: <path d="M3.5 2h9L8 8.5zM8 8.5V14M5 14h6" />, shield: <><path d="M8 1.8 13 3.6v4c0 3.2-2.2 5.6-5 6.6-2.8-1-5-3.4-5-6.6v-4z" /><path d="m5.8 8 1.6 1.6 3-3.2" /></>, dot: <circle cx="8" cy="8" r="3" fill="currentColor" stroke="none" /> };
const noSubscription = () => () => {};
const Icon = ({ name }: { name: keyof typeof icon }) => <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">{icon[name]}</svg>;

export function EventBooking({ night, initial, channel }: { night: string; initial: BookingEvent | null; channel: BookingChannel | null }) {
  const router = useRouter(); const submitting = useRef(false);
  // The server paints French, the launch audience's language (#603), so a French guest sees no language switch.
  const [locale, setLocale] = useState<Locale>("fr"); const s = bookingStrings[locale];
  // The server already read the evening: the first paint is the evening, and that read is not repeated on mount.
  const [event, setEvent] = useState<BookingEvent | null>(initial); const preloaded = useRef(initial !== null); const [loadError, setLoadError] = useState(false);
  const [name, setName] = useState(""); const [gender, setGender] = useState<Gender | "">(""); const [email, setEmail] = useState(""); const [accepted, setAccepted] = useState(false); const [lateAck, setLateAck] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [joined, setJoined] = useState(false);
  const [saved, setSaved] = useState<StoredBooking | null>(null); const [version, setVersion] = useState(0);
  // #405: a refusal is shown next to the action that caused it and brought into view.
  const alert = useRef<HTMLParagraphElement>(null);
  // #606: every field to correct says what is missing, and a summary above the button names them all.
  // Each refusal replays the entrance, even with the same text.
  const [missing, setMissing] = useState<Field[]>([]); const [refusals, setRefusals] = useState(0);
  function fail(message: string, fields: Field[] = []) { setError(message); setMissing(fields); setRefusals(n => n + 1); requestAnimationFrame(() => alert.current?.scrollIntoView({ block: "center" })); }
  const fixed = (field: Field) => setMissing(fields => fields.filter(f => f !== field));
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const value = parseBookingEvent(await bookingRequest(`checkout?night=${night}`, undefined, undefined, controller.signal));
        // #438: a refresh never repaints the page under a submission; its answer would swap the form
        // (for the waitlist once the guest's own hold takes the last place) just before Checkout opens.
        if (!controller.signal.aborted && !submitting.current) { setEvent(value); setLoadError(false); setSaved(bookingForNight(night)); }
      } catch { if (!controller.signal.aborted && !submitting.current) setLoadError(true); }
    }
    if (preloaded.current) {
      // Only the saved attempt, kept in this browser, remains to read.
      preloaded.current = false;
      Promise.resolve().then(() => { if (!controller.signal.aborted && !submitting.current) setSaved(bookingForNight(night)); });
    } else void load();
    const refresh = () => { if (document.visibilityState === "visible" && !submitting.current) void load(); };
    const timer = setInterval(refresh, 60000);
    // A page restored from the back/forward cache (returning from Checkout) starts again from its saved attempt.
    const restore = (e: PageTransitionEvent) => { if (e.persisted) { submitting.current = false; setBusy(false); void load(); } };
    window.addEventListener("online", refresh); window.addEventListener("pageshow", restore);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("online", refresh); window.removeEventListener("pageshow", restore); };
  }, [night, version]);
  useEffect(() => { Promise.resolve().then(() => setLocale(bookingLocale())); }, []);
  // The venue-zone note depends on the device's time zone, which the server does not know: the server
  // and the hydrating render print venue time without it, the device adds it once hydrated.
  const hydrated = useSyncExternalStore(noSubscription, () => true, () => false);
  const device = hydrated || !event ? undefined : event.timezone;
  const late = event ? lateAcknowledgementRequired(event.now, event.cancellation_deadline) : false;
  const full = event?.status === "open" && event.available === 0;
  async function reserve(e: FormEvent) {
    e.preventDefault(); if (submitting.current || !event) return;
    // Same rules as the server parser, checked first only to say which field to correct.
    const fields: Field[] = [];
    if (!isValidText(name, 30)) fields.push("name"); if (!gender) fields.push("gender"); if (!isValidEmail(email)) fields.push("email"); if (!accepted || (late && !lateAck)) fields.push("consent");
    if (fields.length || !gender) { fail("", fields); return; }
    let booking;
    try { booking = bookingInput({ night, name, email, locale, policy: event.policy_version, late_ack: lateAck, gender, channel }); }
    catch { fail(s.invalid); return; }
    submitting.current = true; setBusy(true); setError(""); setMissing([]);
    // #405: the form stays in its waiting state until the next page replaces it.
    let stored = saved; let leaving = false;
    try {
      if (!stored) {
        const issued = await bookingRequest("credentials", {});
        if (!isRecord(issued) || !isUuid(issued.id) || typeof issued.access !== "string") throw new Error("invalid_access");
        stored = { id: issued.id, access: issued.access, expires: Date.now() + storedBookingLifetime, booking };
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
  const summary = missing.length ? s.missing.replace("{list}", () => new Intl.ListFormat(locale, { type: "conjunction" }).format(missing.map(f => s[missingKey[f]]))) : error;
  const problem = summary && <p key={refusals} ref={alert} role="alert" className={styles.error}>{summary}</p>;
  const fieldError = (field: Field, text: string) => missing.includes(field) && <p id={`booking-${field}-error`} className={styles.fieldError}>{text}</p>;
  const amount = event ? depositLabel(event.amount_minor, event.currency, locale) : "";
  // #606: a full evening keeps the visitor for the next one.
  const nextDates = <p className={styles.nextDates}>{s.nextDates} <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">{s.instagram}</a></p>;
  // The saved-attempt prompt waits for a submission in progress, so nothing flashes before Checkout opens.
  const view = !event || event.status !== "open" ? "closed" : saved && !busy ? "saved" : full ? (joined ? "joined" : "waitlist") : event.policy_version !== RESERVATION_POLICY_VERSION ? "policy" : "form";
  return <BookingShell locale={locale} setLocale={setLocale}>
    {!event ? <section><h1 className={styles.title}>{s.event}</h1><p role={loadError ? "alert" : "status"}>{loadError ? s.unavailable : s.loading}</p>{loadError && <button className={styles.button} onClick={() => setVersion(v => v + 1)}>{s.retry}</button>}</section> : <>
      {view === "form" && <p className={styles.hook}>{s.hook}</p>}
      <div className={styles.card}>
        <div className={styles.fact}><Icon name="clock" /><p><strong>{bookingDay(event.starts_at, event.timezone, locale)}</strong><span>{bookingHours(event.starts_at, event.ends_at, event.timezone, locale, device)}, {s.arriveAnytime}</span></p></div>
        <div className={styles.fact}><Icon name="pin" /><div><h1 className={styles.venue}>{event.venue_name}</h1>{venueAddress(event.address, event.city) && <span>{venueAddress(event.address, event.city)}</span>}</div></div>
        <div className={styles.fact}><Icon name="glass" /><p className={styles.free}><em>{s.free}</em> · {s.freeDeposit.replace("{amount}", amount)}</p></div>
        <div className={`${styles.fact} ${styles.safe}`}><Icon name="shield" /><p>{s.noMessages}</p></div>
        {view === "form" && showsPlacesLeft(event.available) && <div className={`${styles.fact} ${styles.few}`}><Icon name="dot" /><p>{event.available === 1 ? s.placeLast : s.placesLeft.replace("{count}", String(event.available))}</p></div>}
        <p className={styles.cardNote}>{s.adults}</p>
      </div>
      <section className={styles.narrow}>
        {view === "closed" ? <><h2 className="text-2xl">{s[event.status === "not_open" ? "notOpen" : event.status as "closed" | "cancelled" | "ended"]}</h2>{event.status === "not_open" && <p className={styles.note}>{s.opens}: {bookingTime(event.opens_at, event.timezone, locale, device)}</p>}{event.walk_ins_possible && <p className={styles.notice}>{s.walkin}</p>}</> :
          view === "saved" ? <div className={styles.stack}><h2 className="text-2xl">{s.forgotten}</h2><a className={styles.button} href={`/reservations/${saved!.id}`}>{s.saved}</a></div> :
          view === "joined" ? <><h2 className="text-2xl">{s.full}</h2><p role="status" className={styles.notice}>{s.waitlistDone}</p>{nextDates}</> :
          view === "waitlist" ? <><h2 className="text-2xl">{s.full}</h2><form className={styles.form} onSubmit={join}><p className={styles.note}>{s.waitlistHelp}</p><label className={styles.field}>{s.email}<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>{problem}<button className={`${styles.button} ${styles.primary}`} disabled={busy} aria-busy={busy}>{busy ? s.submitting : s.waitlist}</button></form>{nextDates}</> :
          view === "policy" ? <p role="alert">{s.policyUnknown}</p> :
          <form className={styles.form} onSubmit={reserve} noValidate>
            <div className={styles.field}><label htmlFor="booking-name">{s.name}</label><input id="booking-name" required autoComplete="given-name" aria-invalid={missing.includes("name") || undefined} aria-describedby={missing.includes("name") ? "booking-name-error" : undefined} value={name} onChange={e => { setName(e.target.value); fixed("name"); }} />{fieldError("name", s.errName)}</div>
            <fieldset className={`${styles.choices} ${missing.includes("gender") ? styles.flagged : ""}`} role="radiogroup" aria-required="true" aria-invalid={missing.includes("gender") || undefined} aria-labelledby="booking-gender-label" aria-describedby={`booking-gender-help${missing.includes("gender") ? " booking-gender-error" : ""}`}><legend id="booking-gender-label">{s.gender}</legend>
              <div>{GENDERS.map(value => <label className={styles.choice} key={value}><input type="radio" name="booking-gender" value={value} checked={gender === value} onChange={() => { setGender(value); fixed("gender"); }} /><span>{t[locale].genders[value]}</span></label>)}</div>
              <p id="booking-gender-help" className={styles.note}>{s.genderHelp}</p>{fieldError("gender", s.needGender)}</fieldset>
            <div className={styles.field}><label htmlFor="booking-email">{s.email}</label><input id="booking-email" type="email" required autoComplete="email" aria-describedby={`booking-email-help${missing.includes("email") ? " booking-email-error" : ""}`} aria-invalid={missing.includes("email") || undefined} value={email} onChange={e => { setEmail(e.target.value); fixed("email"); }} /><p id="booking-email-help" className={styles.hint}>{s.emailHelp}</p>{fieldError("email", s.errEmail)}</div>
            <ul className={styles.pledge}><li><strong>{s.depositLead.replace("{amount}", amount)}</strong><span>{s.depositText}</span></li>{/* A checked "Free cancellation" row reads as a benefit: after the deadline only the notice below speaks (#439). */}{!late && <li><strong>{s.cancelLead} {freeCancellationText(locale, false, bookingTime(event.cancellation_deadline, event.timezone, locale, device))}</strong><span>{s.retention}</span></li>}</ul>
            <label className={`${styles.check} ${missing.includes("consent") && !accepted ? styles.flagged : ""}`}><input type="checkbox" checked={accepted} aria-invalid={(missing.includes("consent") && !accepted) || undefined} onChange={e => { setAccepted(e.target.checked); if (e.target.checked && (!late || lateAck)) fixed("consent"); }} /><span>{s.accept} <a href={`/reservation-terms?lang=${locale}&version=${event.policy_version}`} target="_blank" rel="noopener noreferrer">{s.conditions}</a></span></label>
            {late && <div className={styles.notice}><p>{s.late}</p><label className={`${styles.check} ${missing.includes("consent") && !lateAck ? styles.flagged : ""}`}><input type="checkbox" checked={lateAck} aria-invalid={(missing.includes("consent") && !lateAck) || undefined} onChange={e => { setLateAck(e.target.checked); if (e.target.checked && accepted) fixed("consent"); }} /><span>{s.lateAccept}</span></label></div>}
            {fieldError("consent", s.errConsent)}
            {/* #405: a refusal sits right above the button that caused it. */}
            <div className={styles.pay}><p>{s.payLine.replace("{amount}", amount)}</p>{problem}<button className={`${styles.button} ${styles.primary}`} disabled={busy} aria-busy={busy}>{busy ? s.submitting : s.reserve}</button></div>
            <p className={styles.hint}>{s.paymentHint} {s.data} <a href={`/privacy?lang=${locale}`}>{s.privacy}</a></p>
          </form>}
        {!["form", "waitlist"].includes(view) && problem}{loadError && <p role="alert" className={styles.error}>{s.unavailable}</p>}
        <RecoveryForm night={night} locale={locale} />
      </section></>}
  </BookingShell>;
}
