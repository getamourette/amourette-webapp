"use client";
import { useEffect, useRef, useState } from "react";
import { ensureAnonSession } from "@/lib/auth";
import { bookingRequest } from "@/lib/booking-client";
import { bookingLocale } from "@/lib/booking-storage";
import { isRecord } from "@/lib/input-validation";
import { parseSurveyFragment, parseSurveyPage, surveyAnswers, type SurveyAnswers, type SurveyQuestion } from "@/lib/launch-survey";
import type { Locale } from "@/lib/strings";
import { supabase } from "@/lib/supabase";
import { surveyStrings } from "@/lib/survey-strings";
import { BookingShell } from "./BookingShell";
import styles from "./booking.module.css";

const empty: SurveyAnswers = { matched: null, talked: null, at_ease: null, heard: null };

// #559: the next-day survey. Four optional questions and a separate, unticked
// next-night opt-in. It shows nothing about likes or matches: every answer is
// the guest's own statement.
export function SurveyView() {
  const read = useRef(false);
  const [locale, setLocale] = useState<Locale>("en"); const s = surveyStrings[locale];
  const [phase, setPhase] = useState<"loading" | "open" | "answered" | "expired" | "invalid" | "done">("loading");
  const [link, setLink] = useState<{ link: string; token: string } | null>(null);
  const [night, setNight] = useState<{ venue: string; date: string } | null>(null);
  const [answers, setAnswers] = useState<SurveyAnswers>(empty);
  const [nextNight, setNextNight] = useState(false); const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<"" | "empty" | "error">("");

  useEffect(() => {
    if (read.current) return; read.current = true;
    const value = parseSurveyFragment(window.location.hash); window.history.replaceState(null, "", window.location.pathname);
    void Promise.resolve().then(async () => {
      setLocale(bookingLocale());
      if (!value) { setPhase("invalid"); return; }
      setLink(value);
      try {
        const page = parseSurveyPage(await bookingRequest("survey", { action: "read", ...value }));
        if (page.status === "invalid") { setPhase("invalid"); return; }
        setLocale(page.locale);
        setNight({ venue: page.venue_name, date: new Intl.DateTimeFormat(page.locale, { weekday: "long", day: "numeric", month: "long", timeZone: page.timezone }).format(new Date(page.starts_at)) });
        setPhase(page.status);
      } catch { setPhase("invalid"); }
    });
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!link || busy) return;
    if (!nextNight && Object.values(answers).every(answer => answer === null)) { setError("empty"); return; }
    setBusy(true); setError("");
    try {
      let access: string | undefined;
      if (nextNight) {
        // The next-nights list belongs to a Supabase identity, like every other
        // subscription: this browser's own, created only when the box is ticked.
        await ensureAnonSession();
        access = (await supabase.auth.getSession()).data.session?.access_token;
        if (!access) throw new Error("no_session");
      }
      const result = await bookingRequest("survey", { action: "submit", ...link, answers, next_night: nextNight }, access);
      const status = isRecord(result) ? result.status : null;
      if (status === "recorded") { setSubscribed(nextNight); setPhase("done"); }
      else if (status === "answered" || status === "expired" || status === "invalid") setPhase(status);
      else throw new Error("unknown");
    } catch { setError("error"); }
    finally { setBusy(false); }
  }

  const question = (q: SurveyQuestion) => <fieldset key={q} className={styles.choices}><legend>{s[q]}</legend>
    <div>{surveyAnswers[q].map(value => <label className={styles.choice} key={value}><input type="radio" name={`survey-${q}`} value={value} checked={answers[q] === value}
      onChange={() => { setAnswers(current => ({ ...current, [q]: value })); setError(""); }} /><span>{s[value]}</span></label>)}</div>
  </fieldset>;

  return <BookingShell locale={locale} setLocale={setLocale}><section className="max-w-lg">
    <h1 className={styles.title}>{phase === "done" ? s.done : s.title}</h1>
    {night && phase !== "done" && <p className={styles.lead}>{night.venue}, {night.date}</p>}
    {phase === "loading" && <p role="status" className={styles.lead}>{s.loading}</p>}
    {phase === "invalid" && <p role="alert" className={styles.lead}>{s.invalid}</p>}
    {phase === "expired" && <p role="status" className={styles.lead}>{s.expired}</p>}
    {phase === "answered" && <p role="status" className={styles.lead}>{s.answered}</p>}
    {phase === "done" && <div role="status"><p className={styles.lead}>{s.saved}</p>{subscribed && <p className={styles.lead}>{s.subscribed}</p>}</div>}
    {phase === "open" && <form className={styles.form} onSubmit={submit} noValidate>
      <p className={styles.note}>{s.private} {s.optional}</p>
      {(Object.keys(surveyAnswers) as SurveyQuestion[]).map(question)}
      <label className={styles.check}><input type="checkbox" checked={nextNight} onChange={event => { setNextNight(event.target.checked); setError(""); }} /><span>{s.nextNight}</span></label>
      <p className={styles.note}>{s.nextNightHint}</p>
      {error && <p role="alert" className={styles.error}>{error === "empty" ? s.empty : s.error}</p>}
      <button className={styles.button} type="submit" disabled={busy} aria-busy={busy}>{busy ? s.sending : s.submit}</button>
    </form>}
  </section></BookingShell>;
}
