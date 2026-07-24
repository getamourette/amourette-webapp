"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Database, Json } from "@/lib/database.types";
import { formatVenueInstant, isoToVenueLocalInput, resolveVenueLocalDateTime } from "@/lib/venue-time";

type Venue = Pick<Database["public"]["Tables"]["venues"]["Row"], "id" | "name" | "city" | "timezone" | "is_test_venue">;
type Night = Database["public"]["Tables"]["venue_nights"]["Row"];
type Transition = Database["public"]["Tables"]["venue_night_transitions"]["Row"];
type ConfigAudit = Database["public"]["Tables"]["venue_night_configuration_audits"]["Row"];
type Action = "open" | "launch" | "close" | "cancel" | "reopen";
type ConfirmAction = Extract<Action, "close" | "cancel">;

function stateOf(night: Night) {
  if (night.terminal_reason === "cancelled") return "Cancelled";
  if (night.terminal_at) return "Ended";
  if (night.status === "live") return "Live";
  if (night.status === "waiting") return "Waiting";
  if (night.opened_at) return "Paused";
  return "Scheduled";
}

function actorLabel(actorId: string | null, me: string | null) {
  if (!actorId) return "Automatic";
  return actorId === me ? "You" : "Other founder";
}

function jsonSummary(value: Json | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const item = value as Record<string, Json | undefined>;
  return `${item.launch_threshold ?? "?"} participants · ${String(item.waiting_opens_at ?? "")} → ${String(item.closes_at ?? "")}`;
}

export function VenueNights() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [nights, setNights] = useState<Night[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [audits, setAudits] = useState<ConfigAudit[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Night | null>(null);
  const [confirming, setConfirming] = useState<{ night: Night; action: ConfirmAction } | null>(null);

  const [venueId, setVenueId] = useState("");
  const [waiting, setWaiting] = useState("");
  const [guaranteed, setGuaranteed] = useState("");
  const [closes, setCloses] = useState("");
  const [threshold, setThreshold] = useState(4);

  const load = useCallback(async () => {
    const [venueResult, activeNightResult, historyNightResult, countResult, userResult] = await Promise.all([
      supabase.from("venues").select("id, name, city, timezone, is_test_venue").order("name"),
      supabase.from("venue_nights").select("*").is("terminal_at", null).order("waiting_opens_at"),
      supabase.from("venue_nights").select("*").not("terminal_at", "is", null).order("closes_at", { ascending: false }).limit(20),
      supabase.rpc("admin_venue_night_participant_counts"),
      supabase.auth.getUser(),
    ]);
    const nightRows = [...(activeNightResult.data ?? []), ...(historyNightResult.data ?? [])];
    const nightIds = nightRows.map((night) => night.id);
    const [transitionResult, auditResult] = nightIds.length > 0
      ? await Promise.all([
          supabase.from("venue_night_transitions").select("*").in("venue_night_id", nightIds).order("created_at", { ascending: false }),
          supabase.from("venue_night_configuration_audits").select("*").in("venue_night_id", nightIds).order("created_at", { ascending: false }),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];
    const firstError = venueResult.error ?? activeNightResult.error ?? historyNightResult.error ?? countResult.error ?? transitionResult.error ?? auditResult.error;
    if (firstError) setError(`Could not refresh nights: ${firstError.message}`);
    else {
      setError(""); setVenues(venueResult.data ?? []); setNights(nightRows);
      setCounts(Object.fromEntries((countResult.data ?? []).map((row) => [row.venue_night_id, row.participant_count])));
      setTransitions(transitionResult.data ?? []); setAudits(auditResult.data ?? []);
      setMe(userResult.data.user?.id ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [load]);

  const venue = venues.find((item) => item.id === venueId);
  const resolved = [waiting, guaranteed, closes].map((value) => venue ? resolveVenueLocalDateTime(value, venue.timezone) : null);
  const instants = resolved.every((item) => item?.ok) ? resolved.map((item) => item && item.ok ? item.iso : "") : null;
  const orderingError = instants && !(instants[0] < instants[1] && instants[1] < instants[2]) ? "Times must be ordered: waiting, guaranteed launch, then close." : "";
  const overlap = instants && nights.find((night) => night.id !== editing?.id && night.venue_id === venueId && !night.terminal_at && night.waiting_opens_at < instants[2] && instants[0] < night.closes_at);
  const pastOpening = instants ? Date.parse(instants[0]) <= Date.now() : false;
  const pastClose = instants ? Date.parse(instants[2]) <= Date.now() : false;

  function resetForm() {
    setEditing(null); setVenueId(""); setWaiting(""); setGuaranteed(""); setCloses(""); setThreshold(4);
  }

  function editNight(night: Night) {
    const item = venues.find((candidate) => candidate.id === night.venue_id);
    if (!item) return;
    setEditing(night); setVenueId(night.venue_id);
    setWaiting(isoToVenueLocalInput(night.waiting_opens_at, item.timezone));
    setGuaranteed(isoToVenueLocalInput(night.guaranteed_launch_at, item.timezone));
    setCloses(isoToVenueLocalInput(night.closes_at, item.timezone)); setThreshold(night.launch_threshold);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!instants || orderingError || overlap || pastClose || threshold < 1) return;
    setBusy("form"); setError(""); setMessage("");
    const result = editing
      ? await supabase.rpc("update_venue_night_schedule", { p_venue_night_id: editing.id, p_waiting_opens_at: instants[0], p_guaranteed_launch_at: instants[1], p_closes_at: instants[2], p_launch_threshold: threshold })
      : await supabase.rpc("schedule_venue_night", { p_venue_id: venueId, p_waiting_opens_at: instants[0], p_guaranteed_launch_at: instants[1], p_closes_at: instants[2], p_launch_threshold: threshold });
    if (result.error) setError(result.error.message);
    else { setMessage(editing ? "Schedule updated and audited." : "Night scheduled and audited."); resetForm(); await load(); }
    setBusy(null);
  }

  async function act(night: Night, action: Action) {
    setBusy(night.id); setError(""); setMessage(""); setConfirming(null);
    const expected: Record<Action, string[]> = { open: ["waiting"], launch: ["live"], close: ["closed"], cancel: ["closed"], reopen: night.launched_at ? ["live"] : ["waiting"] };
    const eventByAction: Record<Action, string> = { open: "opened", launch: "launched", close: "closed", cancel: "cancelled", reopen: "reopened" };
    const previousTransitionResult = await supabase
      .from("venue_night_transitions")
      .select("id")
      .eq("venue_night_id", night.id)
      .eq("event", eventByAction[action])
      .eq("actor_id", me ?? "")
      .order("id", { ascending: false })
      .limit(1);
    if (previousTransitionResult.error) {
      setError(`The ${action} request could not start because its audit baseline was unavailable: ${previousTransitionResult.error.message}`);
      setBusy(null);
      return;
    }
    const previousTransitionId = previousTransitionResult.data[0]?.id ?? null;
    const rpc = `${action}_venue_night` as "open_venue_night";
    const result = await supabase.rpc(rpc, { p_venue_night_id: night.id });
    if (result.error) setError(result.error.message);
    else {
      const returned = Array.isArray(result.data) ? result.data[0] : result.data;
      const terminalOk = action !== "cancel" || returned?.terminal_reason === "cancelled";
      const transitionResult = await supabase
        .from("venue_night_transitions")
        .select("id")
        .eq("venue_night_id", night.id)
        .eq("event", eventByAction[action])
        .eq("actor_id", me ?? "")
        .order("id", { ascending: false })
        .limit(1);
      if (transitionResult.error) {
        setError(`The ${action} request returned, but its audit event could not be verified: ${transitionResult.error.message}`);
      } else if (!returned || !expected[action].includes(returned.status) || !terminalOk || !transitionResult.data[0] || transitionResult.data[0].id === previousTransitionId) {
        setError(`The ${action} request did not change this night from its current server state. It may already be stale.`);
      } else setMessage(`${action[0].toUpperCase()}${action.slice(1)} completed. Server state: ${stateOf(returned)}.`);
      await load();
    }
    setBusy(null);
  }

  const filtered = nights.filter((night) => !filter || night.venue_id === filter);
  const current = filtered.filter((night) => !night.terminal_at);
  const history = filtered.filter((night) => night.terminal_at).sort((a, b) => b.closes_at.localeCompare(a.closes_at));
  const real = current.filter((night) => !venues.find((v) => v.id === night.venue_id)?.is_test_venue);
  const qa = current.filter((night) => venues.find((v) => v.id === night.venue_id)?.is_test_venue);

  return (
    <div className="space-y-8">
      <section className="night-panel rounded-3xl p-5">
        <p className="night-kicker mb-2">Schedule</p>
        <h2 className="mb-4 text-xl font-bold">{editing ? "Edit night" : "Add venue night"}</h2>
        <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
          <label className="text-sm">Venue<select required disabled={Boolean(editing)} value={venueId} onChange={(e) => setVenueId(e.target.value)} className="night-input mt-1 px-3 py-2"><option value="">Choose venue</option>{venues.filter((v) => !v.is_test_venue).map((v) => <option key={v.id} value={v.id}>{v.name} · {v.timezone}</option>)}</select></label>
          {["Waiting opens", "Guaranteed launch", "Closes"].map((label, index) => <label key={label} className="text-sm">{label}<input required type="datetime-local" value={[waiting, guaranteed, closes][index]} onChange={(e) => [setWaiting, setGuaranteed, setCloses][index](e.target.value)} className="night-input mt-1 px-3 py-2" />{resolved[index] && !resolved[index]?.ok && <span className="mt-1 block text-xs text-blush">{resolved[index]?.message}</span>}</label>)}
          <label className="text-sm">Launch threshold<input required min="1" type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className={`night-input mt-1 px-3 py-2 ${threshold !== 4 ? "ring-1 ring-blush" : ""}`} />{threshold !== 4 && <span className="mt-1 block text-xs text-blush">Override from the default of 4.</span>}</label>
          {instants && venue && <div className="night-card rounded-2xl p-4 text-xs md:col-span-2"><p className="font-semibold">Review absolute instants</p>{instants.map((iso, index) => <p key={iso} className="night-muted mt-1">{["Waiting", "Guaranteed", "Close"][index]}: {formatVenueInstant(iso, venue.timezone)} · {resolved[index]?.ok ? resolved[index].offsetLabel : ""} · {iso}</p>)}<p className="mt-2">Threshold: {threshold}</p></div>}
          {(orderingError || overlap || pastClose) && <p className="text-sm text-blush md:col-span-2">{orderingError || (overlap ? `Overlaps another non-terminal night (${overlap.id}).` : "Close time must remain in the future.")}</p>}
          {pastOpening && !pastClose && <p className="text-sm text-blush md:col-span-2">Waiting is already due. Saving is allowed; the lifecycle engine or Open waiting now will activate it.</p>}
          <div className="flex gap-2 md:col-span-2"><button disabled={busy === "form" || !instants || Boolean(orderingError || overlap || pastClose)} className="night-button night-button-primary px-4 py-2 disabled:opacity-50">{busy === "form" ? "Saving…" : editing ? "Save changes" : "Schedule night"}</button>{editing && <button type="button" onClick={resetForm} className="night-button night-button-secondary px-4 py-2">Discard</button>}</div>
        </form>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="night-kicker">Operations</p><h2 className="text-2xl font-black">Nights</h2></div><div className="flex gap-2"><select value={filter} onChange={(e) => setFilter(e.target.value)} className="night-input px-3 py-2 text-sm"><option value="">All venues</option>{venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select><button type="button" onClick={load} className="night-button night-button-secondary px-3 py-2 text-xs">Refresh</button></div></div>
        {error && <p className="mb-3 text-sm text-blush">{error}</p>}{message && <p className="mb-3 text-sm font-medium">{message}</p>}{loading ? <p className="night-muted">Loading…</p> : <><NightList title="Upcoming and active" items={real} /><NightList title="QA fixtures · permanent test venues" items={qa} qa /><button type="button" onClick={() => setHistoryOpen(!historyOpen)} className="night-button night-button-secondary mt-5 px-4 py-2 text-xs">{historyOpen ? "Hide" : "Show"} recent history ({history.length})</button>{historyOpen && <NightList title="Recent history" items={history.slice(0, 20)} history />}</>}
      </section>

      {confirming && <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-velvet/90 p-5"><div className="night-panel max-w-md rounded-3xl p-6"><h3 className="text-xl font-bold">{confirming.action === "close" ? "Close temporarily?" : "Cancel this night?"}</h3><p className="night-muted mt-3 text-sm">{confirming.action === "close" ? "Everyone is checked out and room/chat access is hidden. Interactions are preserved; reopening before the configured close requires fresh check-ins." : "This is terminal. The night’s ephemeral likes, matches, messages, and ejections are removed and it cannot be reopened."}</p><div className="mt-5 flex gap-2"><button type="button" onClick={() => void act(confirming.night, confirming.action)} className="night-button night-button-danger px-4 py-2">Confirm {confirming.action}</button><button type="button" onClick={() => setConfirming(null)} className="night-button night-button-secondary px-4 py-2">Keep night</button></div></div></div>}
    </div>
  );

  function NightList({ title, items, qa: isQa = false, history: isHistory = false }: { title: string; items: Night[]; qa?: boolean; history?: boolean }) {
    return <div className="mt-5"><h3 className="mb-3 text-sm font-bold uppercase tracking-widest">{title}</h3>{items.length === 0 ? <p className="night-muted text-sm">None.</p> : <ul className="space-y-3">{items.map((night) => {
      const itemVenue = venues.find((v) => v.id === night.venue_id)!; const state = stateOf(night); const isBusy = busy === night.id;
      const timeline = [...audits.filter((a) => a.venue_night_id === night.id).map((a) => ({ at: a.created_at, label: `Configuration ${a.action}`, actor: actorLabel(a.actor_id, me), detail: jsonSummary(a.after_values) })), ...transitions.filter((t) => t.venue_night_id === night.id).map((t) => ({ at: t.created_at, label: `${t.event}: ${t.from_status} → ${t.to_status}`, actor: actorLabel(t.actor_id, me), detail: t.reason ?? "" }))].sort((a, b) => b.at.localeCompare(a.at));
      const consequence = state === "Scheduled"
        ? "Opening waiting now admits check-ins, but keeps participant profiles hidden until launch."
        : state === "Waiting"
          ? "Launching now reveals checked-in participants and opens the room immediately."
          : state === "Paused"
            ? `Reopening resumes the ${night.launched_at ? "live room" : "waiting period"}; everyone must check in again.`
            : "";
      return <li key={night.id} className="night-card rounded-2xl p-4"><div className="flex flex-wrap justify-between gap-4"><div><div className="flex items-center gap-2"><strong>{itemVenue?.name}</strong><span className="night-pill rounded-full px-3 py-1 text-xs">{state}</span></div><p className="night-muted mt-2 text-sm">{formatVenueInstant(night.waiting_opens_at, itemVenue.timezone)} → {formatVenueInstant(night.closes_at, itemVenue.timezone)}</p>{state === "Waiting" && <p className="mt-2 text-sm">{counts[night.id] ?? 0} / {night.launch_threshold} participants · guaranteed launch at {new Intl.DateTimeFormat("en", { timeZone: itemVenue.timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(night.guaranteed_launch_at))}</p>}{consequence && !isHistory && <p className="night-muted mt-2 max-w-xl text-xs">{consequence}</p>}</div>{!isHistory && <div className="flex flex-wrap gap-2">{!isQa && state === "Scheduled" && <><button disabled={isBusy} onClick={() => editNight(night)} className="night-button night-button-secondary px-3 py-2 text-xs">Edit</button><button disabled={isBusy} onClick={() => void act(night, "open")} className="night-button night-button-primary px-3 py-2 text-xs">Open waiting now</button></>}{!isQa && state === "Waiting" && <button disabled={isBusy} onClick={() => void act(night, "launch")} className="night-button night-button-primary px-3 py-2 text-xs">Launch now</button>}{["Waiting", "Live"].includes(state) && <button disabled={isBusy} onClick={() => setConfirming({ night, action: "close" })} className="night-button night-button-secondary px-3 py-2 text-xs">Close temporarily</button>}{state === "Paused" && Date.parse(night.closes_at) > Date.now() && <button disabled={isBusy} onClick={() => void act(night, "reopen")} className="night-button night-button-primary px-3 py-2 text-xs">Reopen</button>}{!isQa && ["Scheduled", "Waiting", "Live", "Paused"].includes(state) && <button disabled={isBusy} onClick={() => setConfirming({ night, action: "cancel" })} className="night-button night-button-danger px-3 py-2 text-xs">Cancel</button>}</div>}</div><details className="mt-4 border-t border-champagne/10 pt-3"><summary className="cursor-pointer text-xs font-semibold">Audit timeline ({timeline.length})</summary><ol className="night-muted mt-2 space-y-2 text-xs">{timeline.map((event, index) => <li key={`${event.at}-${index}`}><span className="text-cream">{event.label}</span> · {event.actor} · {new Date(event.at).toLocaleString()}<br />{event.detail}</li>)}</ol></details></li>;
    })}</ul>}</div>;
  }
}
