"use client";

// Aggregate stats only. This dashboard is allowed to show counts, rates, and
// venue/night segments; it must never expose who liked, matched, or attended.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type StatRow = {
  venue_id: string;
  venue_name: string;
  night: string;
  scans?: number;
  profile_completions?: number;
  profile_dropoffs?: number;
  checkins: number;
  likes: number;
  matches: number;
  chats_started: number;
  women_checkins?: number;
  men_checkins?: number;
  nonbinary_checkins?: number;
  same_gender_interest_checkins?: number;
  multi_gender_interest_checkins?: number;
  interested_in_women_checkins?: number;
  interested_in_men_checkins?: number;
  interested_in_nonbinary_checkins?: number;
  likes_from_women?: number;
  likes_from_men?: number;
  likes_from_nonbinary?: number;
};

type CountKey = keyof Pick<
  StatRow,
  "checkins" | "likes" | "matches" | "chats_started"
>;

type TimeScope = "night" | "all";

type Metric = {
  label: string;
  value: string;
  detail?: string;
};

type MetricGroup = {
  title: string;
  eyebrow: string;
  metrics: Metric[];
};

type VenueSummary = {
  venue_id: string;
  venue_name: string;
  rows: StatRow[];
  scans: number;
  profile_completions: number;
  profile_dropoffs: number;
  checkins: number;
  likes: number;
  matches: number;
  chats_started: number;
};

type GenderSegment = {
  label: string;
  value: number;
};

function sum(rows: StatRow[], key: CountKey) {
  return rows.reduce((total, row) => total + row[key], 0);
}

function optionalSum(
  rows: StatRow[],
  key:
    | "scans"
    | "profile_completions"
    | "profile_dropoffs"
    | "women_checkins"
    | "men_checkins"
    | "nonbinary_checkins"
    | "same_gender_interest_checkins"
    | "multi_gender_interest_checkins"
    | "interested_in_women_checkins"
    | "interested_in_men_checkins"
    | "interested_in_nonbinary_checkins"
    | "likes_from_women"
    | "likes_from_men"
    | "likes_from_nonbinary"
) {
  return rows.reduce((total, row) => total + (row[key] ?? 0), 0);
}

function summarizeVenues(rows: StatRow[]) {
  const byVenue = new Map<string, VenueSummary>();
  for (const row of rows) {
    const existing = byVenue.get(row.venue_id);
    if (existing) {
      existing.rows.push(row);
      existing.scans += row.scans ?? 0;
      existing.profile_completions += row.profile_completions ?? 0;
      existing.profile_dropoffs += row.profile_dropoffs ?? 0;
      existing.checkins += row.checkins;
      existing.likes += row.likes;
      existing.matches += row.matches;
      existing.chats_started += row.chats_started;
    } else {
      byVenue.set(row.venue_id, {
        venue_id: row.venue_id,
        venue_name: row.venue_name,
        rows: [row],
        scans: row.scans ?? 0,
        profile_completions: row.profile_completions ?? 0,
        profile_dropoffs: row.profile_dropoffs ?? 0,
        checkins: row.checkins,
        likes: row.likes,
        matches: row.matches,
        chats_started: row.chats_started,
      });
    }
  }
  return [...byVenue.values()].sort(
    (a, b) => b.scans + b.checkins - (a.scans + a.checkins)
  );
}

function uniqueNights(rows: StatRow[]) {
  return [...new Set(rows.map((row) => row.night))].sort((a, b) =>
    b.localeCompare(a)
  );
}

function percent(numerator: number, denominator: number) {
  if (denominator === 0) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function ratio(numerator: number, denominator: number) {
  if (denominator === 0) return "0.0";
  return (numerator / denominator).toFixed(1);
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

function genderRatio(men: number, women: number) {
  if (men === 0 && women === 0) return "No data";
  if (women === 0) return `${men}:0`;
  if (men === 0) return `0:${women}`;

  const divisor = greatestCommonDivisor(men, women);
  return `${men / divisor}:${women / divisor}`;
}

function MetricCard({ metric }: { metric: Metric }) {
  return (
    <article className="night-card rounded-2xl p-4">
      <p className="night-kicker mb-3">{metric.label}</p>
      <p className="text-3xl font-black tracking-tight">{metric.value}</p>
      {metric.detail && <p className="night-muted mt-2 text-sm">{metric.detail}</p>}
    </article>
  );
}

function MetricSection({ group }: { group: MetricGroup }) {
  return (
    <section className="space-y-3">
      <div>
        <p className="night-kicker mb-2">{group.eyebrow}</p>
        <h3 className="text-lg font-bold">{group.title}</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {group.metrics.map((metric) => (
          <MetricCard key={metric.label} metric={metric} />
        ))}
      </div>
    </section>
  );
}

function GenderMix({ segments }: { segments: GenderSegment[] }) {
  const total = segments.reduce((count, segment) => count + segment.value, 0);

  return (
    <section className="night-panel rounded-3xl p-5">
      <div className="mb-5">
        <p className="night-kicker mb-2">Audience mix</p>
        <h3 className="text-lg font-bold">Gender balance</h3>
      </div>
      {total === 0 ? (
        <p className="night-muted text-sm">
          No gender mix yet.
        </p>
      ) : (
        <div className="space-y-4">
          {segments.map((segment) => (
            <div key={segment.label}>
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold">{segment.label}</span>
                <span className="night-muted">
                  {segment.value} · {percent(segment.value, total)}
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-velvet/70">
                <div
                  className="h-full rounded-full bg-champagne"
                  style={{
                    width:
                      total === 0 || segment.value === 0
                        ? "0%"
                        : `${Math.max(
                            6,
                            Math.round((segment.value / total) * 100)
                          )}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function Stats() {
  const [rows, setRows] = useState<StatRow[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState("");
  const [selectedNight, setSelectedNight] = useState("");
  const [timeScope, setTimeScope] = useState<TimeScope>("night");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // setState only after the await so this is safe to call directly from the
  // mount effect (react-hooks/set-state-in-effect).
  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("admin_night_stats");
    if (rpcError) {
      setError(`Could not load stats: ${rpcError.message}`);
      setRows([]);
    } else {
      setError("");
      setRows((data as StatRow[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  if (loading) return <p className="night-muted">Loading...</p>;
  if (error) return <p className="text-sm text-red-300">{error}</p>;

  const venues = summarizeVenues(rows);
  const selectedVenue =
    venues.find((venue) => venue.venue_id === selectedVenueId) ?? venues[0];
  const venueRows = selectedVenue?.rows ?? [];
  const nights = uniqueNights(venueRows);
  const activeNight = selectedNight && nights.includes(selectedNight)
    ? selectedNight
    : nights[0] ?? "";
  const scopedRows =
    timeScope === "all"
      ? venueRows
      : venueRows.filter((row) => row.night === activeNight);

  const comparisonRows =
    timeScope === "all"
      ? rows
      : rows.filter((row) => row.night === activeNight);
  const comparisonVenues = summarizeVenues(comparisonRows);

  const hasScanTracking = rows.some((row) => "scans" in row);
  const hasPreferenceTracking = rows.some(
    (row) => "same_gender_interest_checkins" in row
  );
  const totalScans = optionalSum(scopedRows, "scans");
  const totalCheckins = sum(scopedRows, "checkins");
  const totalLikes = sum(scopedRows, "likes");
  const totalMatches = sum(scopedRows, "matches");
  const totalChats = sum(scopedRows, "chats_started");
  const womenCheckins = optionalSum(scopedRows, "women_checkins");
  const menCheckins = optionalSum(scopedRows, "men_checkins");
  const nonbinaryCheckins = optionalSum(scopedRows, "nonbinary_checkins");
  const sameGenderInterestCheckins = optionalSum(
    scopedRows,
    "same_gender_interest_checkins"
  );
  const multiGenderInterestCheckins = optionalSum(
    scopedRows,
    "multi_gender_interest_checkins"
  );
  const interestedInWomenCheckins = optionalSum(
    scopedRows,
    "interested_in_women_checkins"
  );
  const interestedInMenCheckins = optionalSum(
    scopedRows,
    "interested_in_men_checkins"
  );
  const interestedInNonbinaryCheckins = optionalSum(
    scopedRows,
    "interested_in_nonbinary_checkins"
  );
  const likesFromWomen = optionalSum(scopedRows, "likes_from_women");
  const likesFromMen = optionalSum(scopedRows, "likes_from_men");
  const likesFromNonbinary = optionalSum(scopedRows, "likes_from_nonbinary");
  const maxVenueCheckins = Math.max(
    ...comparisonVenues.map((venue) => venue.scans || venue.checkins),
    0
  );
  const scopeLabel =
    timeScope === "all" ? "all nights combined" : activeNight || "selected night";

  const metricGroups: MetricGroup[] = [
    {
      eyebrow: "Acquisition",
      title: "Can this venue fill the room?",
      metrics: [
        {
          label: "QR scans",
          value: hasScanTracking ? totalScans.toLocaleString() : "Not tracked",
          detail: hasScanTracking ? undefined : "Migration needed.",
        },
        {
          label: "People in-room",
          value: totalCheckins.toLocaleString(),
        },
      ],
    },
    {
      eyebrow: "Audience",
      title: "Who is showing up?",
      metrics: [
        {
          label: "Men:women",
          value: genderRatio(menCheckins, womenCheckins),
          detail: `${menCheckins} men · ${womenCheckins} women${
            nonbinaryCheckins > 0 ? ` · ${nonbinaryCheckins} non-binary` : ""
          }`,
        },
        {
          label: "Same-gender interest",
          value: hasPreferenceTracking
            ? percent(sameGenderInterestCheckins, totalCheckins)
            : "Not tracked",
          detail: hasPreferenceTracking
            ? `${sameGenderInterestCheckins} of ${totalCheckins} checked in`
            : "Migration needed.",
        },
        {
          label: "Multi-gender interest",
          value: hasPreferenceTracking
            ? percent(multiGenderInterestCheckins, totalCheckins)
            : "Not tracked",
          detail: hasPreferenceTracking
            ? `${multiGenderInterestCheckins} of ${totalCheckins} checked in`
            : "Migration needed.",
        },
        {
          label: "Interested in women",
          value: hasPreferenceTracking
            ? percent(interestedInWomenCheckins, totalCheckins)
            : "Not tracked",
          detail: hasPreferenceTracking
            ? `${interestedInWomenCheckins} checked in`
            : "Migration needed.",
        },
        {
          label: "Interested in men",
          value: hasPreferenceTracking
            ? percent(interestedInMenCheckins, totalCheckins)
            : "Not tracked",
          detail: hasPreferenceTracking
            ? `${interestedInMenCheckins} checked in`
            : "Migration needed.",
        },
        {
          label: "Interested in non-binary",
          value: hasPreferenceTracking
            ? percent(interestedInNonbinaryCheckins, totalCheckins)
            : "Not tracked",
          detail: hasPreferenceTracking
            ? `${interestedInNonbinaryCheckins} checked in`
            : "Migration needed.",
        },
      ],
    },
    {
      eyebrow: "Intent",
      title: "Is the room creating sparks?",
      metrics: [
        {
          label: "Interest rate",
          value: `${ratio(totalLikes, totalCheckins)} likes / guest`,
        },
        {
          label: "Likes from women",
          value: likesFromWomen.toLocaleString(),
          detail: `${percent(likesFromWomen, totalLikes)} of likes`,
        },
        {
          label: "Likes from men",
          value: likesFromMen.toLocaleString(),
          detail: `${percent(likesFromMen, totalLikes)} of likes`,
        },
        {
          label: "Likes from non-binary",
          value: likesFromNonbinary.toLocaleString(),
          detail: `${percent(likesFromNonbinary, totalLikes)} of likes`,
        },
        {
          label: "Match efficiency",
          value: percent(totalMatches, totalLikes),
        },
        {
          label: "Conversation pull",
          value: percent(totalChats, totalMatches),
        },
      ],
    },
  ];

  const genderSegments: GenderSegment[] = [
    { label: "Women", value: womenCheckins },
    { label: "Men", value: menCheckins },
    { label: "Non-binary", value: nonbinaryCheckins },
  ];

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="night-kicker mb-2">Founder dashboard</p>
          <h2 className="text-2xl font-black tracking-tight">
            Venue intelligence
          </h2>
        </div>
        <button
          type="button"
          onClick={load}
          className="night-button night-button-secondary shrink-0 px-3 py-1.5 text-xs"
        >
          Refresh
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="night-card rounded-2xl p-5">
          <p className="font-semibold">No activity yet.</p>
          <p className="night-muted mt-1 text-sm">
            Stats will appear once people check in, like, match, or start chats.
          </p>
        </div>
      ) : (
        <>
          <section className="night-card rounded-2xl p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="night-kicker mb-2">Scope</p>
                <h3 className="text-lg font-bold">
                  {selectedVenue?.venue_name ?? "Select a venue"} · {scopeLabel}
                </h3>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              {venues.map((venue) => (
                <button
                  key={venue.venue_id}
                  type="button"
                  onClick={() => {
                    setSelectedVenueId(venue.venue_id);
                    setSelectedNight("");
                  }}
                  className={`night-button px-4 py-2 text-xs ${
                    selectedVenue?.venue_id === venue.venue_id
                      ? "night-button-primary"
                      : "night-button-secondary"
                  }`}
                >
                  {venue.venue_name}
                </button>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold">Night</span>
                <select
                  value={activeNight}
                  onChange={(event) => {
                    setSelectedNight(event.target.value);
                    setTimeScope("night");
                  }}
                  className="night-input px-4 py-3"
                >
                  {nights.map((night) => (
                    <option key={night} value={night}>
                      {night}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTimeScope("night")}
                  className={`night-button px-4 py-3 text-xs ${
                    timeScope === "night"
                      ? "night-button-primary"
                      : "night-button-secondary"
                  }`}
                >
                  Selected night
                </button>
                <button
                  type="button"
                  onClick={() => setTimeScope("all")}
                  className={`night-button px-4 py-3 text-xs ${
                    timeScope === "all"
                      ? "night-button-primary"
                      : "night-button-secondary"
                  }`}
                >
                  All nights
                </button>
              </div>
            </div>
          </section>

          <div className="space-y-7">
            {metricGroups.map((group) => (
              <MetricSection key={group.title} group={group} />
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <GenderMix segments={genderSegments} />

            <section className="night-card rounded-2xl p-5">
              <div className="mb-5">
                <p className="night-kicker mb-2">Venue comparison</p>
                <h3 className="text-lg font-bold">Performance by venue</h3>
              </div>
              <div className="space-y-4">
                {comparisonVenues.map((venue) => (
                  <div key={venue.venue_id}>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-semibold">{venue.venue_name}</span>
                      <span className="night-muted">
                        {hasScanTracking
                          ? `${venue.scans} scans · ${venue.profile_dropoffs} drop-offs · `
                          : ""}
                        {venue.checkins} check-ins · {venue.likes} likes ·{" "}
                        {ratio(venue.likes, venue.checkins)} likes / guest
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-velvet/70">
                      <div
                        className="h-full rounded-full bg-champagne"
                        style={{
                          width:
                            maxVenueCheckins === 0 ||
                            (venue.scans || venue.checkins) === 0
                              ? "0%"
                              : `${Math.max(
                                  6,
                                  Math.round(
                                    ((venue.scans || venue.checkins) /
                                      maxVenueCheckins) *
                                      100
                                  )
                                )}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  );
}
