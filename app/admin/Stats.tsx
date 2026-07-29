"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

const AUDIENCE_MIN_COHORT = 10;

type StatRow =
  Database["public"]["Functions"]["admin_night_stats"]["Returns"][number];

type Venue = Pick<
  Database["public"]["Tables"]["venues"]["Row"],
  "id" | "name" | "city" | "timezone" | "is_test_venue"
>;

type VenueNight = Pick<
  Database["public"]["Tables"]["venue_nights"]["Row"],
  | "id"
  | "venue_id"
  | "status"
  | "waiting_opens_at"
  | "closes_at"
  | "opened_at"
  | "terminal_at"
  | "terminal_reason"
>;

type GenderCounts = {
  woman: number;
  man: number;
  nonbinary: number;
};

type VenueActivity = {
  active: number;
  arrivals: number;
  score: number;
};

const EMPTY_GENDERS: GenderCounts = { woman: 0, man: 0, nonbinary: 0 };

function stateLabel(night: VenueNight | undefined) {
  if (!night) return "No night";
  if (night.terminal_reason === "cancelled") return "Cancelled";
  if (night.terminal_at) return "Ended";
  if (night.status === "live") return "Live";
  if (night.status === "waiting") return "Waiting";
  if (night.opened_at) return "Paused";
  return "Scheduled";
}

function nightPriority(night: VenueNight, now: number) {
  if (!night.terminal_at && night.status === "live") return 0;
  if (!night.terminal_at && night.status === "waiting") return 1;
  if (!night.terminal_at && Date.parse(night.waiting_opens_at) > now) return 2;
  return 3;
}

function selectVenueNight(nights: VenueNight[], now = Date.now()) {
  return [...nights].sort((a, b) => {
    const priority = nightPriority(a, now) - nightPriority(b, now);
    if (priority) return priority;
    if (nightPriority(a, now) === 2) {
      return a.waiting_opens_at.localeCompare(b.waiting_opens_at);
    }
    return b.waiting_opens_at.localeCompare(a.waiting_opens_at);
  })[0];
}

function venueNightKey(night: VenueNight, timezone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(night.closes_at));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function number(value: number) {
  return value.toLocaleString();
}

function percent(value: number, total: number) {
  if (total === 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

function Skeleton() {
  return (
    <section className="space-y-6" aria-label="Loading tonight's statistics">
      <div className="h-24 animate-pulse rounded-3xl bg-bordeaux/40" />
      <div className="h-72 animate-pulse rounded-3xl bg-bordeaux/40" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-32 animate-pulse rounded-3xl bg-bordeaux/40" />
        <div className="h-32 animate-pulse rounded-3xl bg-bordeaux/40" />
      </div>
    </section>
  );
}

export function Stats() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [nights, setNights] = useState<VenueNight[]>([]);
  const [analytics, setAnalytics] = useState<StatRow[]>([]);
  const [participantCounts, setParticipantCounts] = useState<
    Record<string, number>
  >({});
  const [activityByNight, setActivityByNight] = useState<Record<string, VenueActivity>>({});
  const [selectedVenueId, setSelectedVenueId] = useState("");
  const [genderCountsByNight, setGenderCountsByNight] = useState<
    Record<string, GenderCounts>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [arrivalDelta, setArrivalDelta] = useState(0);
  const previousAttendance = useRef<{
    venueNightId: string;
    count: number;
  } | null>(null);

  const load = useCallback(async () => {
    const [
      venuesResult,
      nightsResult,
      analyticsResult,
      countsResult,
      genderResult,
      activityResult,
    ] =
      await Promise.all([
        supabase
          .from("venues")
          .select("id, name, city, timezone, is_test_venue")
          .order("name"),
        supabase
          .from("venue_nights")
          .select(
            "id, venue_id, status, waiting_opens_at, closes_at, opened_at, terminal_at, terminal_reason"
          )
          .order("waiting_opens_at", { ascending: false }),
        supabase.rpc("admin_night_stats"),
        supabase.rpc("admin_venue_night_participant_counts"),
        supabase.rpc("admin_venue_night_gender_counts"),
        supabase.rpc("admin_venue_activity"),
      ]);

    const loadError =
      venuesResult.error ??
      nightsResult.error ??
      analyticsResult.error ??
      countsResult.error ??
      genderResult.error ??
      activityResult.error;

    if (loadError) {
      setError(`Could not load tonight's statistics: ${loadError.message}`);
      setLoading(false);
      return;
    }

    const availableVenues = venuesResult.data ?? [];
    const availableNights = nightsResult.data ?? [];
    const nextParticipantCounts = Object.fromEntries(
      (countsResult.data ?? []).map((row) => [
        row.venue_night_id,
        row.participant_count,
      ])
    );
    const nextActivityByNight = Object.fromEntries(
      (activityResult.data ?? []).map((row) => [
        row.venue_night_id,
        { active: row.active_participants, arrivals: row.arrivals_15m, score: row.trend_score },
      ])
    );
    const activeNightForVenue = (venueId: string) =>
      selectVenueNight(availableNights.filter((night) => night.venue_id === venueId));
    const sortedVenues = [...availableVenues].sort((a, b) => {
      const aNight = activeNightForVenue(a.id);
      const bNight = activeNightForVenue(b.id);
      const scoreDifference = (bNight ? nextActivityByNight[bNight.id]?.score ?? 0 : 0) - (aNight ? nextActivityByNight[aNight.id]?.score ?? 0 : 0);
      const attendanceDifference = (bNight ? nextParticipantCounts[bNight.id] ?? 0 : 0) - (aNight ? nextParticipantCounts[aNight.id] ?? 0 : 0);
      return scoreDifference || attendanceDifference || a.name.localeCompare(b.name);
    });

    setVenues(sortedVenues);
    setNights(availableNights);
    setAnalytics(analyticsResult.data ?? []);
    setParticipantCounts(nextParticipantCounts);
    setActivityByNight(nextActivityByNight);
    setGenderCountsByNight(
      Object.fromEntries(
        (genderResult.data ?? []).map((row) => [
          row.venue_night_id,
          {
            woman: row.women_count,
            man: row.men_count,
            nonbinary: row.nonbinary_count,
          },
        ])
      )
    );
    setSelectedVenueId((current) =>
      sortedVenues.some((venue) => venue.id === current)
        ? current
        : (sortedVenues[0]?.id ?? "")
    );
    setError("");
    setLastRefreshed(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
    const timer = window.setInterval(() => void load(), 10_000);
    const refreshOnFocus = () => void load();
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [load]);

  const selectedVenue = venues.find(
    (venue) => venue.id === selectedVenueId
  );

  const currentNight = useMemo(() => {
    const venueNights = nights.filter(
      (night) => night.venue_id === selectedVenueId
    );
    return selectVenueNight(venueNights, lastRefreshed?.getTime() ?? 0);
  }, [lastRefreshed, nights, selectedVenueId]);

  const selectedNightAnalytics = useMemo(() => {
    if (!currentNight || !selectedVenue) return undefined;
    const key = venueNightKey(currentNight, selectedVenue.timezone);
    return analytics.find(
      (row) => row.venue_id === selectedVenueId && row.night === key
    );
  }, [analytics, currentNight, selectedVenue, selectedVenueId]);

  const venueChoices = useMemo(
    () =>
      venues.map((venue) => {
        const venueNights = nights.filter(
          (night) => night.venue_id === venue.id
        );
        const night = selectVenueNight(venueNights, lastRefreshed?.getTime() ?? 0);
        return {
          venue,
          people: night ? (participantCounts[night.id] ?? 0) : 0,
          activity: night ? (activityByNight[night.id] ?? { active: 0, arrivals: 0, score: 0 }) : { active: 0, arrivals: 0, score: 0 },
        };
      }),
    [activityByNight, lastRefreshed, nights, participantCounts, venues]
  );

  const trendingVenueIds = new Set(
    venueChoices
      .filter((choice) => choice.activity.active >= 2 && choice.activity.score >= 4)
      .toSorted((a, b) => b.activity.score - a.activity.score || b.people - a.people)
      .slice(0, 2)
      .map((choice) => choice.venue.id)
  );

  const peopleInRoom = currentNight
    ? (participantCounts[currentNight.id] ?? 0)
    : 0;

  useEffect(() => {
    if (!currentNight) {
      previousAttendance.current = null;
      return;
    }

    const previous = previousAttendance.current;
    previousAttendance.current = {
      venueNightId: currentNight.id,
      count: peopleInRoom,
    };

    if (
      !previous ||
      previous.venueNightId !== currentNight.id ||
      peopleInRoom <= previous.count
    ) {
      return;
    }

    setArrivalDelta(peopleInRoom - previous.count);
    const timer = window.setTimeout(() => setArrivalDelta(0), 2200);
    return () => window.clearTimeout(timer);
  }, [currentNight, peopleInRoom]);

  if (loading) return <Skeleton />;
  if (error) return <p className="text-sm text-blush">{error}</p>;

  const genderCounts = currentNight
    ? (genderCountsByNight[currentNight.id] ?? EMPTY_GENDERS)
    : EMPTY_GENDERS;
  const showGenderMix = peopleInRoom >= AUDIENCE_MIN_COHORT;
  const genderRows = [
    { label: "Women", value: genderCounts.woman, color: "#F9737A" },
    { label: "Men", value: genderCounts.man, color: "#4DA3E8" },
    {
      label: "Non-binary",
      value: genderCounts.nonbinary,
      color: "#8B6FDB",
    },
  ];

  return (
    <section className="admin-stats-bright space-y-7">
      <header className="admin-page-header">
        <div>
          <p className="night-kicker mb-2">Step 2 · Monitor tonight</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-3xl font-semibold tracking-normal text-cream">
              {selectedVenue && trendingVenueIds.has(selectedVenue.id) && <span aria-label="Trending venue">🔥 </span>}
              {selectedVenue?.name ?? "No venue"}
            </h2>
            <span
              data-state={stateLabel(currentNight).toLowerCase()}
              className="admin-stats-status rounded-full px-3 py-1 text-xs font-semibold"
            >
              {stateLabel(currentNight)}
            </span>
            {selectedVenue?.is_test_venue && (
              <span className="admin-stats-test rounded-full px-3 py-1 text-xs font-semibold">
                Test data
              </span>
            )}
          </div>
          {selectedVenue?.city && (
            <p className="night-muted mt-2 text-sm">{selectedVenue.city}</p>
          )}
        </div>

        {venues.length > 1 && (
          <nav
            aria-label="Choose venue"
            className="mt-5 flex gap-2 overflow-x-auto pb-2"
          >
            {venueChoices.map(({ venue, people }) => {
              const selected = venue.id === selectedVenueId;
              const trending = trendingVenueIds.has(venue.id);
              return (
                <button
                  key={venue.id}
                  type="button"
                  aria-current={selected ? "page" : undefined}
                  onClick={() => setSelectedVenueId(venue.id)}
                  className={`admin-venue-choice min-w-fit rounded-2xl border px-4 py-3 text-left transition active:scale-[0.98] ${selected ? "is-selected" : ""}`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {venue.name}
                    {trending && (
                      <span className="admin-trending-badge rounded-full px-2 py-0.5 text-[0.6rem] uppercase tracking-wider">
                        🔥 Trending
                      </span>
                    )}
                    {venue.is_test_venue && (
                      <span className="rounded-full border border-blush/20 px-2 py-0.5 text-[0.6rem] uppercase tracking-wider text-blush">
                        Test
                      </span>
                    )}
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-xs opacity-70">
                    {venue.city && (
                      <>
                        <span>{venue.city}</span>
                        <span aria-hidden="true">·</span>
                      </>
                    )}
                    <span>{people} in room</span>
                  </span>
                </button>
              );
            })}
          </nav>
        )}
      </header>

      <section className="admin-stats-room night-panel relative overflow-hidden rounded-3xl">
        {arrivalDelta > 0 && (
          <div
            role="status"
            aria-live="polite"
            className="admin-arrival-toast absolute right-5 top-5 z-10 flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold"
          >
            <span aria-hidden="true">🎉</span>
            <span>+{arrivalDelta}</span>
          </div>
        )}
        <div className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center">
          <p className="night-kicker mb-5">In the room now</p>
          <p className="text-8xl font-semibold leading-none tabular-nums text-cream sm:text-9xl">
            {number(peopleInRoom)}
          </p>
          <p className="night-muted mt-4 text-sm">
            {peopleInRoom === 1 ? "person" : "people"} checked in
          </p>
        </div>

        <div className="border-t border-champagne/10 px-6 py-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="night-kicker mb-2">Gender mix</p>
              <h3 className="text-lg font-semibold text-cream">
                Who is here tonight
              </h3>
            </div>
            <span className="night-muted text-xs">
              {lastRefreshed ? "Updates automatically" : "Loading"}
            </span>
          </div>

          {showGenderMix ? (
            <div className="grid gap-5 sm:grid-cols-3">
              {genderRows.map((row) => (
                <article
                  key={row.label}
                  className="border-l border-champagne/20 pl-4"
                  style={{ borderColor: row.color }}
                >
                  <p className="text-sm text-taupe">{row.label}</p>
                  <p className="mt-2 text-3xl font-semibold tabular-nums text-cream">
                    {number(row.value)}
                  </p>
                  <p className="night-muted mt-1 text-xs">
                    {percent(row.value, peopleInRoom)} of the room
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="night-muted text-sm">
              Gender mix appears once at least {AUDIENCE_MIN_COHORT} people are
              in the room, protecting privacy in smaller groups.
            </p>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="admin-stats-profile night-card rounded-3xl p-6">
          <p className="night-kicker mb-4">Onboarding</p>
          <p className="text-5xl font-semibold tabular-nums text-cream">
            {selectedNightAnalytics
              ? number(selectedNightAnalytics.profile_completions)
              : "—"}
          </p>
          <h3 className="mt-3 text-base font-semibold text-cream">
            Profiles completed
          </h3>
          <p className="night-muted mt-1 text-sm">
            {selectedNightAnalytics ? "During this venue night" : "No analytics recorded for this night"}
          </p>
        </article>

        <article className="night-card rounded-3xl p-6">
          <p className="night-kicker mb-4">Interest</p>
          <p className="text-5xl font-semibold tabular-nums text-cream">
            {peopleInRoom > 0 && selectedNightAnalytics
              ? (selectedNightAnalytics.likes / peopleInRoom).toFixed(1)
              : "—"}
          </p>
          <h3 className="mt-3 text-base font-semibold text-cream">Likes per active participant</h3>
          <p className="night-muted mt-1 text-sm">
            {selectedNightAnalytics ? `${number(selectedNightAnalytics.likes)} aggregate likes` : "No analytics recorded for this night"}
          </p>
        </article>

        <article className="night-card rounded-3xl p-6">
          <p className="night-kicker mb-4">Matches</p>
          <p className="text-5xl font-semibold tabular-nums text-cream">
            {number(selectedNightAnalytics?.matches ?? 0)}
          </p>
          <h3 className="mt-3 text-base font-semibold text-cream">Mutual matches</h3>
          <p className="night-muted mt-1 text-sm">During this venue night</p>
        </article>

        <article className="admin-stats-conversation night-card rounded-3xl p-6">
          <p className="night-kicker mb-4">Connection</p>
          <p className="text-5xl font-semibold tabular-nums text-cream">
            {number(selectedNightAnalytics?.chats_started ?? 0)}
          </p>
          <h3 className="mt-3 text-base font-semibold text-cream">
            Conversations started
          </h3>
          <p className="night-muted mt-1 text-sm">During this venue night</p>
        </article>
      </section>
    </section>
  );
}
