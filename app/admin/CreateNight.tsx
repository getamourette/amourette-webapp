"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { creationSummary, preselectedVenue, validateNightSchedule, type OverlapNight, type ScheduleDraft } from "@/lib/admin-night-creation";
import { validateReservationConfiguration, type ReservationDraft } from "@/lib/reservation-configuration";
import { isWorkspaceId } from "@/lib/admin-venue-workspace";
import type { Venue } from "./workspace-types";
import consoleStyles from "./NightsHome.module.css";
import styles from "./CreateNight.module.css";

type CreationVenue = Pick<Venue, "id" | "name" | "city" | "timezone" | "is_test_venue">;
const button = consoleStyles.button;
function Field({ name, label, error, children, hint }: { name: string; label: string; error?: string; children: ReactNode; hint?: string }) {
  return <div className={styles.field}><label htmlFor={name}>{label}</label>{children}{hint && <small>{hint}</small>}{error && <p id={`${name}-error`} role="alert" className={styles.error}>{error}</p>}</div>;
}

export function CreateNight() {
  const search = useSearchParams();
  const [venues, setVenues] = useState<CreationVenue[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await supabase.from("venues").select("id,name,city,timezone,is_test_venue").order("is_test_venue").order("name");
        if (!active) return;
        if (result.error) throw result.error;
        setVenues([...(result.data ?? [])].sort((a, b) => Number(a.is_test_venue) - Number(b.is_test_venue) || a.name.localeCompare(b.name)));
        setError("");
      } catch { if (active) setError("Could not load venues. Please try again."); }
    })();
    return () => { active = false; };
  }, [attempt]);
  if (!venues) return error ? <div role="alert" className={consoleStyles.error}>{error}<button className={button} onClick={() => setAttempt(value => value + 1)}>Try again</button></div> : <p role="status">Loading venues…</p>;
  if (!venues.length) return <div className={consoleStyles.empty}><h1>No venues yet</h1><p>Create a venue before scheduling a night.</p><Link className={button} href="/admin/venues">Go to venues</Link></div>;
  return <CreationForm venues={venues} initialVenue={preselectedVenue(search.get("venue"), venues.map(venue => venue.id))} />;
}

function CreationForm({ venues, initialVenue }: { venues: CreationVenue[]; initialVenue: string }) {
  const router = useRouter();
  const [returnTo] = useState(initialVenue ? `/admin/venues/${initialVenue}` : "/admin");
  const [venueId, setVenueId] = useState(initialVenue);
  const venue = venues.find(item => item.id === venueId);
  const [step, setStep] = useState(1);
  const [now] = useState(() => Date.now());
  const [schedule, setSchedule] = useState<ScheduleDraft>({ date: "", entry: "20:00", launch: "21:00", close: "02:00", threshold: 4 });
  const [mode, setMode] = useState<"reservations" | "walk-in" | null>(null);
  const [reservation, setReservation] = useState<ReservationDraft>({ opens: "", capacity: "50", amount: "10.00", currency: venue?.timezone === "America/New_York" ? "usd" : "eur", policy: "launch-v1" });
  const [overlap, setOverlap] = useState<{ venueId: string; nights: OverlapNight[]; error: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const dirty = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [step]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  useEffect(() => {
    if (!venueId) return;
    let active = true;
    void (async () => {
      try {
        const result = await supabase.from("venue_nights").select("id,venue_id,waiting_opens_at,closes_at").eq("venue_id", venueId);
        if (!active) return;
        if (result.error) throw result.error;
        setOverlap({ venueId, nights: (result.data ?? []).filter(night => night.venue_id === venueId), error: "" });
      } catch { if (active) setOverlap({ venueId, nights: [], error: "Could not load this venue’s schedule. Try again before continuing." }); }
    })();
    return () => { active = false; };
  }, [venueId, attempt]);
  const zone = venue?.timezone ?? "UTC";
  const validation = useMemo(() => validateNightSchedule(schedule, zone, venueId, overlap?.venueId === venueId ? overlap.nights : []), [schedule, zone, venueId, overlap]);
  const summary = useMemo(() => creationSummary(schedule, zone, mode === "reservations" ? reservation : null, now), [schedule, zone, mode, reservation, now]);
  const overlapReady = overlap?.venueId === venueId && !overlap.error;
  function changeStep(next: number) { setErrors({}); setError(""); setStep(next); }
  function whenErrors() {
    return { ...validation.errors, ...(!venue ? { venue: "Choose a venue." } : {}), ...(!overlapReady && venue ? { venue: overlap?.venueId === venueId && overlap.error ? overlap.error : "Wait for this venue’s schedule to load." } : {}) };
  }
  function reservationErrors() {
    if (!mode) return { mode: "Choose reservations with deposit or walk-in only." };
    return mode === "reservations" ? validateReservationConfiguration(reservation, zone, 0).errors : {};
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    const nextErrors = step === 1 ? whenErrors() : step === 2 ? reservationErrors() : { ...whenErrors(), ...reservationErrors() };
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); if (step === 3) setError(Object.values(nextErrors).filter(Boolean).join(" ")); return; }
    if (step < 3) { changeStep(step + 1); return; }
    if (!venue || !validation.instants) return;
    const configuration = mode === "reservations" ? validateReservationConfiguration(reservation, zone, 0).payload : null;
    submitting.current = true; setBusy(true); setError("");
    let createdId: string | null = null;
    let reservationFailure = "";
    try {
      const result = await supabase.rpc("schedule_venue_night", {
        p_venue_id: venue.id, p_waiting_opens_at: validation.instants[0], p_guaranteed_launch_at: validation.instants[1], p_closes_at: validation.instants[2], p_launch_threshold: schedule.threshold,
      });
      if (result.error) { setError(result.error.message); return; }
      if (!isWorkspaceId(result.data?.id)) { setError("The server did not return a night ID. Check Nights before trying again."); return; }
      createdId = result.data.id;
      if (configuration) {
        const configured = await supabase.rpc("admin_configure_launch_event", { p_night: createdId, ...configuration });
        if (configured.error) reservationFailure = configured.error.message.trim() || "The reservation request was refused";
      }
    } catch {
      if (createdId) reservationFailure = "The reservation request could not be completed";
      else setError("The schedule request could not be completed. Check Nights before trying again.");
    } finally {
      if (createdId) {
        dirty.current = false;
        const params = new URLSearchParams({ scheduled: "1" });
        if (reservationFailure) params.set("reservationError", [...reservationFailure.trim()].slice(0, 1000).join(""));
        // Keep the submit guard until this form unmounts, including during navigation.
        router.replace(`/admin/nights/${createdId}?${params}`);
      } else { submitting.current = false; setBusy(false); }
    }
  }
  const accessibility = (name: string) => ({ id: name, "aria-invalid": !!errors[name], "aria-describedby": errors[name] ? `${name}-error` : undefined });
  const updateSchedule = (value: Partial<ScheduleDraft>) => { dirty.current = true; setSchedule(previous => ({ ...previous, ...value })); };
  const updateReservation = (value: Partial<ReservationDraft>) => { dirty.current = true; setReservation(previous => ({ ...previous, ...value })); };

  return <div className={styles.page}>
    <header className={styles.header}><div className={styles.title}>{busy ? <button className={button} disabled>Close</button> : <Link className={button} href={returnTo}>Close</Link>}<strong>Schedule a night</strong></div>
      <ol className={styles.steps} aria-label="Steps">{["When", "Reservations", "Review"].map((label, index) => <li key={label} aria-current={step === index + 1 ? "step" : undefined}><b>{index + 1}</b>{label}</li>)}</ol>
    </header>
    <div className={styles.layout} data-step={step}>
      {step < 3 && <aside className={styles.summary} aria-label="The night at a glance"><h2>The night at a glance</h2><strong>{venue?.name ?? "Choose a venue"}</strong><p>{summary.date}{venue ? ` · ${zone}` : ""}</p><p>{summary.hours}</p><p>{mode ? summary.entry : "Choose an entry mode"}</p>{mode && <p className={styles.muted}>{summary.registration}</p>}</aside>}
      <form onSubmit={submit} noValidate className={styles.form} onChange={event => {
        dirty.current = true;
        const input = event.target;
        if (!(input instanceof HTMLInputElement || input instanceof HTMLSelectElement)) return;
        const field = input.name === "entry-mode" ? "mode" : input.id;
        // Timing errors can depend on several fields; discard those stale messages too.
        const related: Record<string, string[]> = {
          date: ["entry", "launch", "close"], entry: ["date", "launch"], launch: ["date", "close"], close: ["date"],
          mode: ["capacity", "amount", "currency", "opens"],
        };
        const changed = [field, ...(related[field] ?? [])];
        setErrors(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => !changed.includes(key))));
      }}>
        <h1 ref={heading} tabIndex={-1}>{step === 1 ? "When and where?" : step === 2 ? "How do people get in?" : "Check before scheduling"}</h1>
        <fieldset disabled={busy} className={styles.fields}>
          {step === 1 && <>
            <p className={styles.muted}>{venue ? `Times are in ${zone}.` : "Choose a venue to use its local time."}</p>
            <Field name="venue" label="Venue" error={errors.venue}><select {...accessibility("venue")} value={venueId} onChange={event => { const id = event.target.value; setVenueId(id); setOverlap(null); setErrors({}); updateReservation({ currency: venues.find(item => item.id === id)?.timezone === "America/New_York" ? "usd" : "eur" }); }}><option value="">Choose a venue</option>{venues.map(item => <option key={item.id} value={item.id}>{item.name}{item.city ? ` · ${item.city}` : ""}{item.is_test_venue ? " (Test venue)" : ""}</option>)}</select></Field>
            {venue && !overlapReady && (overlap?.venueId === venueId && overlap.error ? <div role="alert" className={styles.error}>{overlap.error}<button className={button} type="button" onClick={() => { setOverlap(null); setAttempt(value => value + 1); }}>Try again</button></div> : <p role="status">Loading this venue’s schedule…</p>)}
            <Field name="date" label="Night date" error={errors.date}><input {...accessibility("date")} type="date" required value={schedule.date} onChange={event => updateSchedule({ date: event.target.value })} /></Field>
            <div className={styles.columns}>{([ ["entry", "Entry opens"], ["launch", "Matching starts by"], ["close", "Closes"] ] as const).map(([name, label]) => <Field key={name} name={name} label={label} error={errors[name]} hint={name === "close" && validation.closes && validation.closes.slice(0, 10) !== schedule.date ? `Next day · ${summary.closingDate}` : undefined}><input {...accessibility(name)} type="time" required value={schedule[name]} onChange={event => updateSchedule({ [name]: event.target.value })} /></Field>)}</div>
            <Field name="threshold" label="Start matching early at" hint="people checked in" error={errors.threshold}><input {...accessibility("threshold")} type="number" min={1} max={2147483647} step={1} required value={Number.isNaN(schedule.threshold) ? "" : schedule.threshold} onChange={event => updateSchedule({ threshold: event.target.valueAsNumber })} /></Field>
          </>}
          {step === 2 && <>
            <div role="radiogroup" aria-label="Entry mode" aria-describedby={errors.mode ? "mode-error" : undefined} className={styles.choices}>
              {([ ["reservations", "Reservations with deposit", "Limited places, refundable deposit, personal QR."], ["walk-in", "Walk-in only", "Guests at the bar scan the venue QR."] ] as const).map(([value, label, detail]) => <label key={value} className={styles.choice}><input type="radio" name="entry-mode" value={value} checked={mode === value} onChange={() => setMode(value)} /><span><strong>{label}</strong><small>{detail}</small></span></label>)}
            </div>
            {errors.mode && <p id="mode-error" role="alert" className={styles.error}>{errors.mode}</p>}
            {mode === "reservations" && <>
              <div className={styles.columns}>
                <Field name="capacity" label="Reservation capacity" error={errors.capacity}><input {...accessibility("capacity")} inputMode="numeric" required value={reservation.capacity} onChange={event => updateReservation({ capacity: event.target.value })} /></Field>
                <Field name="amount" label="Deposit amount" error={errors.amount}><input {...accessibility("amount")} inputMode="decimal" required value={reservation.amount} onChange={event => updateReservation({ amount: event.target.value })} /></Field>
                <Field name="currency" label="Currency" error={errors.currency}><select {...accessibility("currency")} value={reservation.currency} onChange={event => updateReservation({ currency: event.target.value })}><option value="eur">EUR</option><option value="usd">USD</option></select></Field>
              </div>
              <Field name="opens" label="Registration opens" error={errors.opens}><input {...accessibility("opens")} type="datetime-local" required value={reservation.opens} onChange={event => updateReservation({ opens: event.target.value })} /></Field>
              <p className={styles.note}>Booking closes automatically 30 minutes before entry. Once registration opens, the deposit, currency, policy and schedule are locked. Times are in {zone}.</p>
            </>}
          </>}
          {step === 3 && <>
            <section className={styles.review} aria-label="When review"><div className={styles.header}><h2>When</h2><button type="button" className={button} onClick={() => changeStep(1)} aria-label="Edit when">Edit</button></div><p>{venue?.name} · {venue?.city}</p><p>{summary.date} · {zone}</p><p>{summary.hours}</p><p>Start matching early at {schedule.threshold} people checked in.</p></section>
            <section className={styles.review} aria-label="Reservations review"><div className={styles.header}><h2>Reservations</h2><button type="button" className={button} onClick={() => changeStep(2)} aria-label="Edit reservations">Edit</button></div><p>{summary.entry}</p><p>{summary.registration}</p>{mode === "reservations" && <p>Policy: {reservation.policy}. Deposit, currency, policy and schedule lock when registration opens.</p>}</section>
          </>}
        </fieldset>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.actions}>{step > 1 ? <button type="button" className={button} disabled={busy} onClick={() => changeStep(step - 1)}>Back</button> : <Link className={button} href={returnTo}>Cancel</Link>}<button type="submit" disabled={busy} className={`${button} ${consoleStyles.primary}`}>{busy ? "Scheduling…" : step === 3 ? "Schedule night" : "Continue"}</button></div>
      </form>
    </div>
  </div>;
}
