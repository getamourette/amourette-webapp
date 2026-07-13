"use client";

// Moderation queue — the highest-priority admin surface. Reports and blocks land
// here so the founders can finally see and act on them (until now reports were
// readable only by the reporter). Reads ride the admin RLS policies
// (reports_select_admin / blocks_select_admin / profiles_select_admin); a
// non-admin session sees nothing. No like/match data is ever shown here.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type MiniProfile = {
  id: string;
  first_name: string;
  photo_url: string;
};

type VenueActionRef = { id: string; name: string; slug: string } | null;

type ReportRow = {
  id: string;
  reason: string;
  note: string | null;
  created_at: string;
  reporter: MiniProfile | null;
  reported: MiniProfile | null;
  venue: VenueActionRef;
};

type BlockRow = {
  id: string;
  reason: string;
  note: string | null;
  created_at: string;
  blocker: MiniProfile | null;
  blocked: MiniProfile | null;
  venue: VenueActionRef;
};

type EjectionRow = {
  id: string;
  profile_id: string;
  venue_id: string;
  reason: string;
  note: string | null;
  created_at: string;
};

const REASON_LABELS: Record<string, string> = {
  harassment: "Harassment",
  fake_profile: "Fake profile",
  underage: "Underage",
  unsafe_behavior: "Unsafe behavior",
  other: "Other",
};

const RULE_GUIDANCE: Record<string, string> = {
  harassment: "Eject if the report describes targeted pressure, threats, or repeated unwanted contact.",
  fake_profile: "Eject if the person appears to be impersonating someone or using a misleading profile.",
  underage: "Eject immediately if there is any credible underage concern.",
  unsafe_behavior: "Eject if the behavior could make someone unsafe in the venue tonight.",
  other: "Review the note and use judgment before ejecting.",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function PersonChip({ profile }: { profile: MiniProfile | null }) {
  if (!profile) return <span className="night-muted">unknown</span>;
  return (
    <span className="inline-flex items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={profile.photo_url}
        alt={profile.first_name}
        className="h-7 w-7 rounded-full object-cover"
      />
      <span className="font-semibold">{profile.first_name}</span>
    </span>
  );
}

export function ModerationQueue() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [ejections, setEjections] = useState<EjectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [ejectingKey, setEjectingKey] = useState("");

  // setState only after the await so this is safe to call directly from the
  // mount effect (react-hooks/set-state-in-effect).
  const load = useCallback(async () => {
    const [reportsRes, blocksRes, ejectionsRes] = await Promise.all([
      supabase
        .from("reports")
        .select(
          `id, reason, note, created_at,
           reporter:profiles!reports_reporter_id_fkey ( id, first_name, photo_url ),
           reported:profiles!reports_reported_id_fkey ( id, first_name, photo_url ),
           venue:venues ( id, name, slug )`
        )
        .order("created_at", { ascending: false })
        .returns<ReportRow[]>(),
      supabase
        .from("blocks")
        .select(
          `id, reason, note, created_at,
           blocker:profiles!blocks_blocker_id_fkey ( id, first_name, photo_url ),
           blocked:profiles!blocks_blocked_id_fkey ( id, first_name, photo_url ),
           venue:venues ( id, name, slug )`
        )
        .order("created_at", { ascending: false })
        .returns<BlockRow[]>(),
      supabase
        .from("venue_ejections")
        .select("id, profile_id, venue_id, reason, note, created_at")
        .order("created_at", { ascending: false })
        .returns<EjectionRow[]>(),
    ]);

    if (reportsRes.error || blocksRes.error || ejectionsRes.error) {
      setError("Could not load the moderation queue.");
    } else {
      setError("");
      setReports(reportsRes.data ?? []);
      setBlocks(blocksRes.data ?? []);
      setEjections(ejectionsRes.data ?? []);
    }
    setLoading(false);
  }, []);

  function ejectionFor(profile: MiniProfile | null, venue: VenueActionRef) {
    if (!profile || !venue) return null;
    return (
      ejections.find(
        (ejection) =>
          ejection.profile_id === profile.id && ejection.venue_id === venue.id
      ) ?? null
    );
  }

  async function ejectFromVenue({
    profile,
    venue,
    reason,
    sourceId,
  }: {
    profile: MiniProfile | null;
    venue: VenueActionRef;
    reason: string;
    sourceId: string;
  }) {
    if (!profile || !venue) return;
    const label = REASON_LABELS[reason] ?? "Other";
    if (
      !window.confirm(
        `Eject ${profile.first_name} from ${venue.name} for tonight?\n\nReason: ${label}`
      )
    ) {
      return;
    }

    setActionMessage("");
    setEjectingKey(sourceId);
    const { error: ejectError } = await supabase.rpc("eject_from_venue", {
      p_profile_id: profile.id,
      p_venue_id: venue.id,
      p_reason: reason,
      p_note: `Admin action from moderation queue: ${label}`,
    });
    setEjectingKey("");

    if (ejectError) {
      console.error(ejectError);
      setActionMessage(`Could not eject this person: ${ejectError.message}`);
      return;
    }

    setActionMessage(`${profile.first_name} was ejected from ${venue.name}.`);
    await load();
  }

  async function restoreToVenue({
    profile,
    venue,
    sourceId,
  }: {
    profile: MiniProfile | null;
    venue: VenueActionRef;
    sourceId: string;
  }) {
    if (!profile || !venue) return;
    if (!window.confirm(`Restore ${profile.first_name} to ${venue.name}?`)) {
      return;
    }

    setActionMessage("");
    setEjectingKey(sourceId);
    const { error: restoreError } = await supabase.rpc("restore_to_venue", {
      p_profile_id: profile.id,
      p_venue_id: venue.id,
    });
    setEjectingKey("");

    if (restoreError) {
      console.error(restoreError);
      setActionMessage(`Could not restore this person: ${restoreError.message}`);
      return;
    }

    setActionMessage(`${profile.first_name} was restored to ${venue.name}.`);
    await load();
  }

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (loading) return <p className="night-muted">Loading…</p>;
  if (error) return <p className="text-sm text-red-300">{error}</p>;

  return (
    <div className="space-y-8">
      <div className="night-card rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="night-kicker mb-2">Safety queue</p>
            <h2 className="text-xl font-black tracking-tight">Moderation</h2>
          </div>
          <button
            type="button"
            onClick={load}
            className="night-button night-button-secondary px-3 py-1.5 text-xs"
          >
            Refresh
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="night-kicker mb-2">Reports</p>
            <p className="text-2xl font-black">{reports.length}</p>
          </div>
          <div>
            <p className="night-kicker mb-2">Blocks</p>
            <p className="text-2xl font-black">{blocks.length}</p>
          </div>
          <div>
            <p className="night-kicker mb-2">High risk</p>
            <p className="text-2xl font-black">
              {
                reports.filter((report) =>
                  ["underage", "unsafe_behavior", "harassment"].includes(
                    report.reason
                  )
                ).length
              }
            </p>
          </div>
        </div>
        {actionMessage && (
          <p className="night-muted mt-4 text-sm">{actionMessage}</p>
        )}
      </div>

      <section>
        <div className="mb-3">
          <p className="night-kicker mb-2">Reports</p>
          <h3 className="text-lg font-bold">Needs review</h3>
        </div>
        {reports.length === 0 ? (
          <p className="night-muted text-sm">No reports.</p>
        ) : (
          <ul className="space-y-3">
            {reports.map((report) => (
              <li key={report.id} className="night-card rounded-2xl p-4">
                {ejectionFor(report.reported, report.venue) && (
                  <p className="mb-3 rounded-xl border border-blush/25 bg-blush/10 px-3 py-2 text-sm text-blush">
                    Ejected tonight
                  </p>
                )}
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="night-pill rounded-full px-3 py-1 text-xs font-bold">
                    {REASON_LABELS[report.reason] ?? report.reason}
                  </span>
                  <span className="night-muted text-xs">
                    {formatDate(report.created_at)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <PersonChip profile={report.reporter} />
                  <span className="night-muted">reported</span>
                  <PersonChip profile={report.reported} />
                  {report.venue && (
                    <span className="night-muted">· at {report.venue.name}</span>
                  )}
                </div>
                <p className="night-muted mt-2 text-sm">
                  {RULE_GUIDANCE[report.reason] ?? RULE_GUIDANCE.other}
                </p>
                {report.note && (
                  <p className="mt-2 rounded-xl bg-black/30 px-3 py-2 text-sm">
                    “{report.note}”
                  </p>
                )}
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    disabled={
                      !report.reported ||
                      !report.venue ||
                      ejectingKey === report.id
                    }
                    onClick={() => {
                      if (ejectionFor(report.reported, report.venue)) {
                        void restoreToVenue({
                          profile: report.reported,
                          venue: report.venue,
                          sourceId: report.id,
                        });
                        return;
                      }
                      void ejectFromVenue({
                        profile: report.reported,
                        venue: report.venue,
                        reason: report.reason,
                        sourceId: report.id,
                      });
                    }}
                    className="night-button night-button-danger px-3 py-2 text-xs disabled:opacity-50"
                  >
                    {ejectingKey === report.id
                      ? "Working..."
                      : ejectionFor(report.reported, report.venue)
                        ? "Restore"
                        : "Eject"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-3">
          <p className="night-kicker mb-2">Blocks</p>
          <h3 className="text-lg font-bold">User-protected interactions</h3>
        </div>
        {blocks.length === 0 ? (
          <p className="night-muted text-sm">No blocks.</p>
        ) : (
          <ul className="space-y-3">
            {blocks.map((block) => (
              <li key={block.id} className="night-card rounded-2xl p-4">
                {ejectionFor(block.blocked, block.venue) && (
                  <p className="mb-3 rounded-xl border border-blush/25 bg-blush/10 px-3 py-2 text-sm text-blush">
                    Ejected tonight
                  </p>
                )}
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="night-pill rounded-full px-3 py-1 text-xs font-bold">
                    {REASON_LABELS[block.reason] ?? block.reason}
                  </span>
                  <span className="night-muted text-xs">
                    {formatDate(block.created_at)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <PersonChip profile={block.blocker} />
                  <span className="night-muted">blocked</span>
                  <PersonChip profile={block.blocked} />
                {block.venue && (
                  <span className="night-muted">· at {block.venue.name}</span>
                  )}
                </div>
                <p className="night-muted mt-2 text-sm">
                  {RULE_GUIDANCE[block.reason] ?? RULE_GUIDANCE.other}
                </p>
                {block.note && (
                  <p className="mt-2 rounded-xl bg-black/30 px-3 py-2 text-sm">
                    “{block.note}”
                  </p>
                )}
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    disabled={
                      !block.blocked ||
                      !block.venue ||
                      ejectingKey === block.id
                    }
                    onClick={() => {
                      if (ejectionFor(block.blocked, block.venue)) {
                        void restoreToVenue({
                          profile: block.blocked,
                          venue: block.venue,
                          sourceId: block.id,
                        });
                        return;
                      }
                      void ejectFromVenue({
                        profile: block.blocked,
                        venue: block.venue,
                        reason: block.reason,
                        sourceId: block.id,
                      });
                    }}
                    className="night-button night-button-danger px-3 py-2 text-xs disabled:opacity-50"
                  >
                    {ejectingKey === block.id
                      ? "Working..."
                      : ejectionFor(block.blocked, block.venue)
                        ? "Restore"
                        : "Eject blocked user"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
