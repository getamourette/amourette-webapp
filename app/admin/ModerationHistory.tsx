"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type Event = Database["public"]["Functions"]["admin_moderation_history"]["Returns"][number];

const ACTIONS: Record<Event["action"], string> = {
  removed_for_night: "Removed for the night",
  access_restored: "Access restored",
  case_reviewed: "Case marked reviewed",
  case_reopened: "Case reopened",
  report_reviewed: "Report marked reviewed",
};
const REASONS: Record<string, string> = {
  harassment: "harassment",
  fake_profile: "fake profile",
  underage: "underage concern",
  unsafe_behavior: "unsafe behavior",
  other: "other",
};
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

// #234: the append-only record of founder moderation actions, read through the
// founder-only `admin_moderation_history`. With a person and a night it shows
// that case's trail; without, the latest actions across nights, door removals
// included. `version` changes after an action to read the new event.
export function ModerationHistory({ profileId, nightId, version = 0 }: { profileId?: string; nightId?: string; version?: number }) {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const scoped = Boolean(profileId);

  useEffect(() => {
    let active = true;
    void supabase.rpc("admin_moderation_history", { p_profile_id: profileId, p_venue_night_id: nightId })
      .abortSignal(AbortSignal.timeout(15_000))
      .then(({ data, error: readError }) => {
        if (!active) return;
        if (readError) { setError(true); return; }
        setError(false); setEvents(data ?? []);
      }, () => { if (active) setError(true); });
    return () => { active = false; };
  }, [profileId, nightId, version, attempt]);

  return <section aria-label={scoped ? "Action history for this person" : "Action history"} className={scoped ? "mt-6" : "mt-10"}>
    <div className="mb-3"><p className="night-kicker mb-1">Kept after the night</p><h3 className={scoped ? "text-base font-black" : "text-lg font-black text-white/70"}>Action history</h3></div>
    {error && <p role="alert" className="text-sm text-red-300">Could not load the action history. <button type="button" onClick={() => setAttempt(value => value + 1)} className="underline underline-offset-4">Retry</button></p>}
    {!error && !events && <p role="status" className="text-sm text-white/45">Loading action history…</p>}
    {!error && events?.length === 0 && <p className="text-sm text-white/45">{scoped ? "No founder action on this person for this night yet." : "No founder action recorded yet."}</p>}
    {!error && events && events.length > 0 && <ol className="divide-y divide-white/8 rounded-2xl border border-white/10 bg-white/[0.035]">
      {events.map(event => <li key={event.id} className="px-4 py-3 text-sm">
        <p className="font-bold">{ACTIONS[event.action] ?? event.action}{event.reason ? ` · ${REASONS[event.reason] ?? event.reason}` : ""}{!scoped && <span className="font-normal text-white/70"> · {event.target_first_name ?? "Deleted profile"}</span>}</p>
        <p className="mt-1 text-xs text-white/45">
          <time dateTime={event.occurred_at}>{when(event.occurred_at)}</time>
          {" · "}{event.by_me ? "by you" : "by another founder"}
          {!scoped && event.venue_night_id && ` · ${event.venue_name ?? "Deleted venue"}${event.night_starts_at ? `, night of ${new Date(event.night_starts_at).toLocaleDateString("en-GB", { dateStyle: "medium" })}` : ""}`}
          {event.case_id ? " · from a report" : event.action === "removed_for_night" || event.action === "access_restored" ? " · without a report" : ""}
        </p>
      </li>)}
    </ol>}
  </section>;
}
