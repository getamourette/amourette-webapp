"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Profile = { id: string; first_name: string; photo_url: string };
type Venue = { id: string; name: string; slug: string };
type CaseStatus = "pending_review" | "suspended" | "removed_for_night" | "reviewed";
type ReportRow = {
  id: string;
  case_id: string | null;
  venue_night_id: string | null;
  reason: string;
  note: string | null;
  created_at: string;
  reviewed_at: string | null;
  interaction_evidence: string | null;
  interaction_verified_at: string | null;
  reporter: Profile | null;
  reported: Profile | null;
  moderation_case: { id: string; status: CaseStatus; action_expires_at: string | null } | null;
  venue_night: { id: string; venue: Venue | null } | null;
};
type Priority = "high" | "medium" | "low";
type QueueMeta = {
  report_id: string;
  total_reports: number;
  unique_reporters: number;
  reporter_activity: number;
  priority_score: number;
  priority_reason: string;
  is_handled: boolean;
  handled_at: string | null;
};

const REASONS: Record<string, string> = {
  harassment: "Harassment",
  fake_profile: "Fake profile",
  underage: "Underage concern",
  unsafe_behavior: "Unsafe behavior",
  other: "Other",
};
const EVIDENCE: Record<string, { title: string; detail: string; strong: boolean }> = {
  two_way_conversation: { title: "Two-way conversation verified ✓", detail: "Both people sent at least one message. Message contents are never accessed.", strong: true },
  conversation_started: { title: "One person messaged", detail: "A conversation started, but only one participant sent a message.", strong: false },
  mutual_match: { title: "Mutual match", detail: "They matched, but no messages were sent.", strong: false },
  shared_venue_night: { title: "Shared venue night", detail: "Both people participated in the same venue night; no conversation was found.", strong: false },
};
const CASE_STATUS: Record<CaseStatus, string> = {
  pending_review: "Pending",
  suspended: "Suspended 30 min",
  removed_for_night: "Removed tonight",
  reviewed: "Reviewed",
};

function age(iso: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function Person({ profile, large = false }: { profile: Profile | null; large?: boolean }) {
  if (!profile) return <span className="text-white/45">Unknown profile</span>;
  return <span className="inline-flex items-center gap-2.5">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={profile.photo_url} alt="" className={`${large ? "h-12 w-12" : "h-9 w-9"} rounded-full object-cover ring-1 ring-white/15`} />
    <span className={large ? "text-lg font-extrabold" : "font-bold"}>{profile.first_name}</span>
  </span>;
}

export function ModerationQueue() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [queueMeta, setQueueMeta] = useState<Map<string, QueueMeta>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [renderedAt] = useState(() => Date.now());

  const load = useCallback(async () => {
    const [reportResult, queueResult] = await Promise.all([
      supabase.from("reports").select(`
        id, case_id, venue_night_id, reason, note, created_at, reviewed_at,
        interaction_evidence, interaction_verified_at,
        reporter:profiles!reports_reporter_id_fkey ( id, first_name, photo_url ),
        reported:profiles!reports_reported_id_fkey ( id, first_name, photo_url ),
        moderation_case:moderation_cases!reports_case_id_fkey ( id, status, action_expires_at ),
        venue_night:venue_nights!reports_venue_night_id_fkey ( id, venue:venues ( id, name, slug ) )
      `).order("created_at", { ascending: false }).returns<ReportRow[]>(),
      supabase.rpc("admin_moderation_queue"),
    ]);
    if (reportResult.error || queueResult.error) setError("Could not load moderation reports.");
    else {
      setReports(reportResult.data ?? []);
      setQueueMeta(new Map((queueResult.data ?? []).map((row) => [row.report_id, row])));
      setError("");
    }
    setLoading(false);
  }, []);

  useEffect(() => { void (async () => { await load(); })(); }, [load]);

  function reportStatus(report: ReportRow) {
    if (report.moderation_case?.status === "suspended" || report.moderation_case?.status === "removed_for_night") return CASE_STATUS[report.moderation_case.status];
    return report.reviewed_at ? "Reviewed" : "Pending";
  }
  const priority = useCallback((report: ReportRow): Priority => {
    const score = queueMeta.get(report.id)?.priority_score ?? 0;
    if (score >= 500) return "high";
    if (score >= 150) return "medium";
    return "low";
  }, [queueMeta]);
  const activeReports = useMemo(() => reports.filter((report) => !queueMeta.get(report.id)?.is_handled)
    .toSorted((a, b) => (queueMeta.get(b.id)?.priority_score ?? 0) - (queueMeta.get(a.id)?.priority_score ?? 0) || b.created_at.localeCompare(a.created_at)), [queueMeta, reports]);
  const handledReports = useMemo(() => reports.filter((report) => queueMeta.get(report.id)?.is_handled)
    .toSorted((a, b) => (queueMeta.get(b.id)?.handled_at ?? b.created_at).localeCompare(queueMeta.get(a.id)?.handled_at ?? a.created_at)), [queueMeta, reports]);
  const selected = reports.find((report) => report.id === selectedId) ?? null;

  async function act(action: "review" | "suspend_30m" | "remove_for_night" | "restore") {
    if (!selected) return;
    setWorking(true); setMessage("");
    const { error: actionError } = action === "review"
      ? await supabase.rpc("review_report", { p_report_id: selected.id })
      : selected.case_id
        ? await supabase.rpc("moderate_case", { p_case_id: selected.case_id, p_action: action })
        : { error: new Error("This legacy report has no moderation case.") };
    setWorking(false);
    if (actionError) { setMessage(`Action failed: ${actionError.message}`); return; }
    setMessage("Report updated."); await load();
  }

  function reportTable(items: ReportRow[], quiet = false) {
    if (items.length === 0) return <div className="px-6 py-12 text-center"><p className="font-bold">Nothing here</p><p className="mt-1 text-sm text-white/40">You are all caught up.</p></div>;
    return <table className="w-full min-w-[1040px] border-collapse text-left"><thead><tr className="border-b border-white/10 text-[11px] font-black uppercase tracking-[0.13em] text-white/35"><th className="px-5 py-3">Reporter</th><th className="px-4 py-3">Reported user</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3">Reports received</th><th className="px-4 py-3">Reporter history</th><th className="px-4 py-3">Status</th><th className="px-5 py-3"></th></tr></thead><tbody>
      {items.map((report) => {
        const meta = queueMeta.get(report.id);
        const level = priority(report);
        const expiredSuspension = report.moderation_case?.status === "suspended" && report.moderation_case.action_expires_at && new Date(report.moderation_case.action_expires_at).getTime() <= renderedAt;
        return <tr key={report.id} tabIndex={0} role="button" onClick={() => { setSelectedId(report.id); setMessage(""); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(report.id); } }} className={`cursor-pointer border-b border-white/8 transition last:border-0 hover:bg-white/[0.055] focus:bg-white/[0.055] focus:outline-none ${quiet ? "admin-table-row-quiet" : ""}`}>
          <td className={`border-l-2 px-5 py-4 ${quiet ? "border-white/10" : level === "high" ? "border-red-400" : level === "medium" ? "border-amber-300" : "border-white/15"}`}><Person profile={report.reporter} /><p className="mt-1.5 text-xs text-white/35">{report.venue_night?.venue?.name ?? "Unknown venue"}</p></td>
          <td className="px-4 py-4"><Person profile={report.reported} /></td>
          <td className="px-4 py-4"><p className="font-bold">{REASONS[report.reason] ?? report.reason}</p><p className={`mt-1.5 text-xs font-bold ${quiet ? "text-white/35" : level === "high" ? "text-red-200" : level === "medium" ? "text-amber-100" : "text-white/40"}`}>{quiet ? EVIDENCE[report.interaction_evidence ?? ""]?.title ?? "Legacy report" : meta?.priority_reason ?? "New report"}</p></td>
          <td className="px-4 py-4"><p className="font-black">{meta?.total_reports ?? 1} tonight</p><p className="mt-1 text-xs text-white/45">{meta?.unique_reporters ?? 1} unique</p></td>
          <td className="px-4 py-4"><p className="font-black">{meta?.reporter_activity ?? 1} tonight</p><p className="mt-1 text-xs text-white/45">by this reporter</p></td>
          <td className="px-4 py-4"><span className="rounded-full bg-white/8 px-2.5 py-1 text-xs font-bold">{expiredSuspension ? "Suspension ended" : reportStatus(report)}</span><p className="mt-2 text-xs text-white/35">{age(report.created_at, renderedAt)}</p></td>
          <td className="px-5 py-4 text-right text-lg text-white/35">›</td>
        </tr>;
      })}
    </tbody></table>;
  }

  if (loading) return <p className="night-muted">Loading moderation reports…</p>;
  if (error) return <p className="text-sm text-red-300">{error}</p>;

  return <div className="relative">
    <header className="admin-page-header mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="night-kicker mb-2">Step 3 · Intervene</p><h2 className="text-3xl font-black tracking-tight">Moderation</h2><p className="mt-2 max-w-xl text-sm text-white/55">What needs attention is already at the top. Click any report to understand and act.</p></div><button type="button" onClick={() => void load()} className="night-button night-button-secondary px-4 py-2 text-sm">Refresh</button></header>

    <section><div className="mb-3 flex items-center justify-between"><div><p className="night-kicker mb-1">Needs attention</p><h3 className="text-xl font-black">Active queue</h3></div><span className="rounded-full bg-amber-300/12 px-3 py-1 text-xs font-black text-amber-100">{activeReports.length} open</span></div><div className="admin-table-surface overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.035]">{reportTable(activeReports)}</div></section>

    <section className="mt-10"><div className="mb-3"><p className="night-kicker mb-1">Recently handled</p><h3 className="text-lg font-black text-white/70">Done for now</h3></div><div className="admin-table-surface overflow-x-auto rounded-2xl border border-white/7 bg-white/[0.02]">{reportTable(handledReports, true)}</div></section>

    {selected && (() => {
      const evidence = EVIDENCE[selected.interaction_evidence ?? ""];
      const meta = queueMeta.get(selected.id);
      const restricted = selected.moderation_case?.status === "suspended" || selected.moderation_case?.status === "removed_for_night";
      return <div className="admin-modal-overlay fixed inset-0 z-50 flex justify-end bg-black/55 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}><aside className="admin-modal-surface h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[#191722] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><p className="night-kicker mb-2">Report details</p><p className="text-sm text-white/45">{selected.venue_night?.venue?.name} · {new Date(selected.created_at).toLocaleString()}</p></div><button type="button" onClick={() => setSelectedId(null)} className="rounded-full bg-white/8 px-3 py-2 text-sm text-white/65">Close</button></div>
        <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl bg-white/[0.045] p-4"><div><p className="mb-2 text-xs font-bold text-white/40">Reporter</p><Person profile={selected.reporter} large /></div><span className="text-white/25">→</span><div><p className="mb-2 text-xs font-bold text-white/40">Reported user</p><Person profile={selected.reported} large /></div></div>
        <section className="mt-6"><p className="night-kicker mb-2">Reason</p><h3 className="text-xl font-black">{REASONS[selected.reason]}</h3>{selected.note && <p className="mt-3 rounded-xl bg-white/5 p-4 text-sm leading-6 text-white/75">“{selected.note}”</p>}</section>
        <section className={`mt-6 rounded-xl border p-4 ${evidence?.strong ? "border-emerald-300/20 bg-emerald-300/8" : "border-white/10 bg-white/[0.035]"}`}><p className={`font-black ${evidence?.strong ? "text-emerald-100" : "text-white"}`}>{evidence?.title ?? "Interaction evidence unavailable"}</p><p className="mt-1.5 text-sm leading-5 text-white/50">{evidence?.detail ?? "This report predates interaction evidence snapshots."}</p></section>
        <div className="mt-6 grid grid-cols-2 gap-3"><div className="rounded-xl bg-white/6 p-4"><p className="text-xs text-white/45">Reporter activity</p><p className="mt-1 text-2xl font-black">{meta?.reporter_activity ?? 1}</p><p className="mt-1 text-xs text-white/40">people reported this night</p></div><div className="rounded-xl bg-white/6 p-4"><p className="text-xs text-white/45">Reported-user history</p><p className="mt-1 text-2xl font-black">{meta?.total_reports ?? 1}</p><p className="mt-1 text-xs text-white/40">from {meta?.unique_reporters ?? 1} unique users</p></div></div>
        {message && <p className="mt-5 rounded-xl bg-white/7 px-4 py-3 text-sm">{message}</p>}
        <div className="admin-modal-actions sticky bottom-0 mt-7 grid gap-2 border-t border-white/10 bg-[#191722]/95 py-5 backdrop-blur sm:grid-cols-2">{restricted ? <button disabled={working} onClick={() => void act("restore")} className="night-button night-button-secondary px-4 py-3 text-sm sm:col-span-2">Restore access</button> : <><button disabled={working || Boolean(selected.reviewed_at)} onClick={() => void act("review")} className="night-button night-button-secondary px-4 py-3 text-sm">{selected.reviewed_at ? "Reviewed" : "Mark reviewed"}</button><button disabled={working} onClick={() => void act("suspend_30m")} className="rounded-full bg-amber-200 px-4 py-3 text-sm font-black text-amber-950 disabled:opacity-50">Block 30 min</button><button disabled={working} onClick={() => void act("remove_for_night")} className="rounded-full bg-red-400 px-4 py-3 text-sm font-black text-red-950 disabled:opacity-50 sm:col-span-2">Block until end of night</button></>}</div>
      </aside></div>;
    })()}
  </div>;
}
