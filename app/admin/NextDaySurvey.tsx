"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatWorkspaceDate } from "@/lib/admin-venue-workspace";
import styles from "./ReservationOperations.module.css";

type Survey = {
  enabled: boolean; send_at: string; queued: number; answers: number;
  matched_yes: number; matched_no: number; talked_yes: number; talked_no: number;
  at_ease_yes: number; at_ease_somewhat: number; at_ease_no: number;
  heard_friend: number; heard_instagram: number; heard_venue: number; heard_street: number; heard_other: number;
};

// #559: off by default. A founder turns the next-day survey on for one night,
// once the legal basis of this email is settled (docs/decisions/2026-11-27-next-day-survey.md).
export function NextDaySurvey({ nightId, timezone, now }: { nightId: string; timezone: string; now: number }) {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_launch_survey", { p_night: nightId });
    if (error || !data) { setError("The next-day survey could not load. Refresh to try again."); return; }
    setSurvey(data as unknown as Survey); setError("");
  }, [nightId]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  async function set(enabled: boolean) {
    setBusy(true); setError("");
    const { error } = await supabase.rpc("admin_set_launch_survey", { p_night: nightId, p_enabled: enabled });
    setBusy(false); setConfirm(false);
    if (error) { setError("The setting could not be saved. Try again."); return; }
    await load();
  }
  const rows = (pairs: readonly (readonly [string, number])[]) => pairs.map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>);
  return <section className={styles.root} aria-label="Next-day survey"><h3>Next-day survey · {survey ? (survey.enabled ? "On" : "Off") : "…"}</h3>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {survey && <div className={styles.settings}>
      <p>A thank-you email with a four-question survey, sent once to guests whose arrival was verified, from {formatWorkspaceDate(survey.send_at, timezone, now, true)} for three days. The guest may also ask to hear about the next night.</p>
      {!survey.enabled && <p className={styles.hint}>Off by default. Turn it on only once the legal basis of this email is decided (service message or marketing): see docs/decisions/2026-11-27-next-day-survey.md.</p>}
      {survey.enabled ? <button disabled={busy} onClick={() => void set(false)}>Turn off</button>
        : confirm ? <div className={styles.actions}><button disabled={busy} onClick={() => void set(true)}>Confirm: send the survey for this night</button><button disabled={busy} onClick={() => setConfirm(false)}>Keep it off</button></div>
        : <button disabled={busy} onClick={() => setConfirm(true)}>Turn on for this night</button>}
    </div>}
    {survey && (survey.enabled || survey.queued > 0) && <div className={styles.finance} aria-label="Survey answers">
      {rows([["Emails queued", survey.queued], ["Answers", survey.answers], ["Got a match: yes", survey.matched_yes], ["Got a match: no", survey.matched_no],
        ["Talked in person: yes", survey.talked_yes], ["Talked in person: no", survey.talked_no], ["At ease: yes", survey.at_ease_yes],
        ["At ease: somewhat", survey.at_ease_somewhat], ["At ease: no", survey.at_ease_no], ["Heard via a friend", survey.heard_friend],
        ["Heard via Instagram", survey.heard_instagram], ["Heard at the bar", survey.heard_venue], ["Heard via a flyer or poster", survey.heard_street], ["Heard another way", survey.heard_other]])}
      <p>Totals only: answers are stored with the night, never with a guest, a reservation or a profile.</p>
    </div>}
  </section>;
}
