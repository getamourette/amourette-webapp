"use client";

// Founder analytics only. The browser receives aggregate rows from the guarded
// admin_founder_analytics() RPC; it never reads raw users, events, or messages.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

const AUDIENCE_MIN_COHORT = 10;
const TRACKING_START_LABEL = "analytics tracking start";

type StatRow =
  Database["public"]["Functions"]["admin_founder_analytics"]["Returns"][number];

type DashboardMode = "single" | "trends";
type TrendRange = "5" | "10" | "30";
type TrendMetricKey =
  | "uniqueScanners"
  | "scanCheckins"
  | "profileCompletions"
  | "conversationsStarted"
  | "returningUsers";
type TableSortKey =
  | "night"
  | "uniqueScanners"
  | "profileCompletions"
  | "scanCheckins"
  | "conversationsStarted"
  | "returningUsers";

type CountKey = keyof Pick<
  StatRow,
  | "scans"
  | "unique_scanners"
  | "landing_views"
  | "sessions"
  | "profiles_created"
  | "profile_completions"
  | "checkins"
  | "scan_checkins"
  | "venue_experience_openers"
  | "discovery_openers"
  | "profile_viewers"
  | "profile_views"
  | "chat_openers"
  | "chat_opens"
  | "conversations_started"
  | "first_message_senders"
  | "reciprocal_conversations"
  | "engaged_conversations"
  | "replied_conversations"
  | "returning_users"
  | "returning_same_venue_users"
  | "returning_other_venue_users"
  | "women_checkins"
  | "men_checkins"
  | "nonbinary_checkins"
  | "same_gender_interest_checkins"
  | "multi_gender_interest_checkins"
  | "interested_in_women_checkins"
  | "interested_in_men_checkins"
  | "interested_in_nonbinary_checkins"
>;

type Aggregate = {
  scans: number;
  uniqueScanners: number;
  landingViews: number;
  sessions: number;
  profilesCreated: number;
  profileCompletions: number;
  checkins: number;
  scanCheckins: number;
  venueExperienceOpeners: number;
  discoveryOpeners: number;
  profileViewers: number;
  profileViews: number;
  chatOpeners: number;
  chatOpens: number;
  conversationsStarted: number;
  conversationOpeners: number;
  firstMessageSenders: number;
  reciprocalConversations: number;
  engagedConversations: number;
  repliedConversations: number;
  returningUsers: number;
  returningSameVenue: number;
  returningOtherVenue: number;
  womenCheckins: number;
  menCheckins: number;
  nonbinaryCheckins: number;
  sameGenderInterest: number;
  multiGenderInterest: number;
  interestedInWomen: number;
  interestedInMen: number;
  interestedInNonbinary: number;
  peakScanHour: number | null;
  peakActivityHour: number | null;
  hasEventTracking: boolean;
  hasSourceTracking: boolean;
};

type MetricDefinition = {
  key: string;
  displayName: string;
  description: string;
  numerator: string;
  denominator: string;
  format: "count" | "rate";
  comparison: "absolute" | "percentage-point";
  availability: string;
  privacyThreshold?: number;
  primaryLocation: string;
  why: string;
};

type OutcomeMetric = {
  label: string;
  value: number;
  detail: string;
  comparison: string;
  primary?: boolean;
};

type JourneyStep = {
  label: string;
  value: number | null;
  availability: string;
};

type VenueSummary = {
  venue_id: string;
  venue_name: string;
  venue_city: string | null;
  rows: StatRow[];
};

type Insight = {
  topic: string;
  value: string;
  body: string;
};

const METRIC_REGISTRY = {
  uniqueScanners: {
    key: "uniqueScanners",
    displayName: "Unique scanners",
    description: "Distinct users who scanned a venue QR code during the venue night.",
    numerator: "Distinct venue_scan_events.user_id",
    denominator: "None",
    format: "count",
    comparison: "absolute",
    availability: "Historical from venue scan tracking",
    primaryLocation: "Outcome summary and journey",
    why: "Shows whether the QR and venue placement are creating demand.",
  },
  profileCompletions: {
    key: "profileCompletions",
    displayName: "Profile completion",
    description: "Scanned users with a completed profile for the selected venue night.",
    numerator: "Scanned users with profile_private.adult_confirmed_at",
    denominator: "Unique scanners",
    format: "rate",
    comparison: "percentage-point",
    availability: "Historical from profile records",
    primaryLocation: "Current user journey",
    why: "Shows where acquisition turns into usable profiles.",
  },
  scanCheckins: {
    key: "scanCheckins",
    displayName: "Entered experience",
    description: "Scanned users who checked into the same venue night.",
    numerator: "Distinct scanned users with presence in the same venue night",
    denominator: "Unique scanners",
    format: "rate",
    comparison: "percentage-point",
    availability: "Historical scanned-user cohort",
    primaryLocation: "Outcome summary and journey",
    why: "Shows whether scanners actually entered the live venue experience.",
  },
  profileViewers: {
    key: "profileViewers",
    displayName: "Profile viewers",
    description: "Distinct users who viewed at least one profile after tracking began.",
    numerator: "Distinct analytics_events.user_id for profile_viewed",
    denominator: "Entered experience",
    format: "rate",
    comparison: "percentage-point",
    availability: `Tracked since ${TRACKING_START_LABEL}`,
    primaryLocation: "Current user journey",
    why: "Shows whether activated users reached discovery.",
  },
  conversationsStarted: {
    key: "conversationsStarted",
    displayName: "Conversation records",
    description: "Conversations with at least one message or durable chat-start aggregate.",
    numerator: "venue_conversation_events, live messages, or venue_chat_start_events",
    denominator: "Entered experience",
    format: "rate",
    comparison: "percentage-point",
    availability: "Message/chat aggregate",
    primaryLocation: "Outcome summary and conversation detail",
    why: "Shows whether in-room interest turns into interaction.",
  },
  reciprocalConversations: {
    key: "reciprocalConversations",
    displayName: "Reciprocal conversations",
    description: "Conversation records where both participants sent at least one message.",
    numerator: "venue_conversation_events.reciprocal_at is not null",
    denominator: "Conversation records",
    format: "rate",
    comparison: "percentage-point",
    availability: "Message aggregate",
    primaryLocation: "Conversation detail",
    why: "Separates one-sided starts from real two-sided interaction.",
  },
  returningUsers: {
    key: "returningUsers",
    displayName: "Returning users",
    description: "Users whose selected scan had an earlier scan record.",
    numerator: "Distinct scanned users with previous venue_scan_events",
    denominator: "Unique scanners",
    format: "rate",
    comparison: "percentage-point",
    availability: "Historical from scan tracking",
    primaryLocation: "Outcome summary and trends",
    why: "Shows whether people come back to Amourette.",
  },
  audienceComposition: {
    key: "audienceComposition",
    displayName: "Audience composition",
    description: "Aggregate gender and preference signals among checked-in attendees.",
    numerator: "Checked-in profiles by profile attributes",
    denominator: "Checked-in attendees",
    format: "rate",
    comparison: "percentage-point",
    availability: "Historical from checked-in profiles",
    privacyThreshold: AUDIENCE_MIN_COHORT,
    primaryLocation: "Audience composition",
    why: "Helps assess venue fit without exposing small cohorts.",
  },
} satisfies Record<string, MetricDefinition>;

function sum(rows: StatRow[], key: CountKey) {
  return rows.reduce((total, row) => total + row[key], 0);
}

function uniqueNights(rows: StatRow[]) {
  return [...new Set(rows.map((row) => row.night))].sort((a, b) =>
    b.localeCompare(a)
  );
}

function rate(numerator: number, denominator: number) {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

function number(value: number) {
  return value.toLocaleString();
}

function percentValue(numerator: number, denominator: number) {
  return Math.round(rate(numerator, denominator) * 100);
}

function percent(numerator: number, denominator: number) {
  if (denominator === 0) return "—";
  return `${percentValue(numerator, denominator)}%`;
}

function countOf(value: number, denominator: number, noun: string) {
  if (denominator === 0) return `${number(value)} ${noun}`;
  return `${number(value)} of ${number(denominator)} ${noun} · ${percent(value, denominator)}`;
}

function nightLabel(night: string) {
  return `Night ending ${night}`;
}

function hourLabel(hour: number | null) {
  if (hour === null) return "Not enough data";
  return `${hour.toString().padStart(2, "0")}:00`;
}

function absoluteChange(current: number, previous: number | null) {
  if (previous === null) return "No previous comparison";
  const delta = current - previous;
  if (delta === 0) return "No change";
  return `${delta > 0 ? "+" : ""}${number(delta)} vs previous night`;
}

function rateChange(
  currentNumerator: number,
  currentDenominator: number,
  previousNumerator: number,
  previousDenominator: number
) {
  if (previousDenominator === 0 || currentDenominator === 0) {
    return "No rate comparison";
  }
  const current = percentValue(currentNumerator, currentDenominator);
  const previous = percentValue(previousNumerator, previousDenominator);
  const delta = current - previous;
  if (delta === 0) return "No rate change";
  return `${delta > 0 ? "+" : ""}${delta} percentage points`;
}

function nullableMode(rows: StatRow[], key: "peak_scan_hour" | "peak_activity_hour") {
  const counts = new Map<number, number>();
  for (const row of rows) {
    const value = row[key];
    if (value === null) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function aggregateRows(rows: StatRow[]): Aggregate {
  const landingViews = sum(rows, "landing_views");
  const sessions = sum(rows, "sessions");
  const venueExperienceOpeners = sum(rows, "venue_experience_openers");
  const discoveryOpeners = sum(rows, "discovery_openers");
  const profileViewers = sum(rows, "profile_viewers");
  const profileViews = sum(rows, "profile_views");
  const chatOpeners = sum(rows, "chat_openers");
  const chatOpens = sum(rows, "chat_opens");
  const conversationsStarted = sum(rows, "conversations_started");

  return {
    scans: sum(rows, "scans"),
    uniqueScanners: sum(rows, "unique_scanners"),
    landingViews,
    sessions,
    profilesCreated: sum(rows, "profiles_created"),
    profileCompletions: sum(rows, "profile_completions"),
    checkins: sum(rows, "checkins"),
    scanCheckins: sum(rows, "scan_checkins"),
    venueExperienceOpeners,
    discoveryOpeners,
    profileViewers,
    profileViews,
    chatOpeners,
    chatOpens,
    conversationsStarted,
    conversationOpeners: Math.max(chatOpeners, conversationsStarted),
    firstMessageSenders: sum(rows, "first_message_senders"),
    reciprocalConversations: sum(rows, "reciprocal_conversations"),
    engagedConversations: sum(rows, "engaged_conversations"),
    repliedConversations: sum(rows, "replied_conversations"),
    returningUsers: sum(rows, "returning_users"),
    returningSameVenue: sum(rows, "returning_same_venue_users"),
    returningOtherVenue: sum(rows, "returning_other_venue_users"),
    womenCheckins: sum(rows, "women_checkins"),
    menCheckins: sum(rows, "men_checkins"),
    nonbinaryCheckins: sum(rows, "nonbinary_checkins"),
    sameGenderInterest: sum(rows, "same_gender_interest_checkins"),
    multiGenderInterest: sum(rows, "multi_gender_interest_checkins"),
    interestedInWomen: sum(rows, "interested_in_women_checkins"),
    interestedInMen: sum(rows, "interested_in_men_checkins"),
    interestedInNonbinary: sum(rows, "interested_in_nonbinary_checkins"),
    peakScanHour: nullableMode(rows, "peak_scan_hour"),
    peakActivityHour: nullableMode(rows, "peak_activity_hour"),
    hasEventTracking:
      landingViews +
        sessions +
        venueExperienceOpeners +
        discoveryOpeners +
        profileViewers +
        profileViews +
        chatOpeners +
        chatOpens >
      0,
    hasSourceTracking: rows.some(
      (row) =>
        row.top_source !== null ||
        row.top_medium !== null ||
        row.top_campaign !== null ||
        row.top_qr_code_id !== null
    ),
  };
}

function summarizeVenues(rows: StatRow[]) {
  const byVenue = new Map<string, VenueSummary>();
  for (const row of rows) {
    const existing = byVenue.get(row.venue_id);
    if (existing) {
      existing.rows.push(row);
    } else {
      byVenue.set(row.venue_id, {
        venue_id: row.venue_id,
        venue_name: row.venue_name,
        venue_city: row.venue_city,
        rows: [row],
      });
    }
  }
  return [...byVenue.values()].sort((a, b) =>
    a.venue_name.localeCompare(b.venue_name)
  );
}

function metricValue(metric: TrendMetricKey, aggregate: Aggregate) {
  switch (metric) {
    case "uniqueScanners":
      return aggregate.uniqueScanners;
    case "scanCheckins":
      return aggregate.scanCheckins;
    case "profileCompletions":
      return aggregate.profileCompletions;
    case "conversationsStarted":
      return aggregate.conversationsStarted;
    case "returningUsers":
      return aggregate.returningUsers;
  }
}

function readInitialMode(): DashboardMode {
  if (typeof window === "undefined") return "single";
  return window.location.search.includes("mode=trends") ? "trends" : "single";
}

function readInitialRange(): TrendRange {
  if (typeof window === "undefined") return "5";
  const value = new URLSearchParams(window.location.search).get("range");
  return value === "10" || value === "30" ? value : "5";
}

function readInitialTrendMetric(): TrendMetricKey {
  if (typeof window === "undefined") return "scanCheckins";
  const value = new URLSearchParams(window.location.search).get("metric");
  if (
    value === "uniqueScanners" ||
    value === "scanCheckins" ||
    value === "profileCompletions" ||
    value === "conversationsStarted" ||
    value === "returningUsers"
  ) {
    return value;
  }
  return "scanCheckins";
}

function readInitialParam(key: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(key) ?? "";
}

function Skeleton() {
  return (
    <section className="space-y-8" aria-label="Loading venue intelligence">
      <div className="h-20 animate-pulse border-b border-champagne/10" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse border-y border-champagne/10" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-lg border border-champagne/10 bg-bordeaux/35" />
    </section>
  );
}

function DataState({ children }: { children: string }) {
  return (
    <p className="night-muted rounded-lg border border-champagne/10 bg-bordeaux/30 px-4 py-3 text-sm">
      {children}
    </p>
  );
}

function MetricDefinitionTooltip({ metric }: { metric: MetricDefinition }) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={`Definition for ${metric.displayName}`}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-champagne/20 text-[10px] text-taupe"
      >
        ?
      </button>
      <span className="pointer-events-none absolute left-1/2 top-6 z-20 hidden w-72 -translate-x-1/2 rounded-md border border-champagne/15 bg-velvet px-3 py-2 text-left text-xs leading-relaxed text-taupe shadow-xl group-hover:block group-focus-within:block">
        <span className="block font-medium text-cream">{metric.displayName}</span>
        {metric.description}
        <span className="mt-2 block">Numerator: {metric.numerator}</span>
        <span className="block">Denominator: {metric.denominator}</span>
      </span>
    </span>
  );
}

function Section({
  eyebrow,
  title,
  description,
  children,
  surface = false,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  surface?: boolean;
}) {
  return (
    <section
      className={
        surface
          ? "rounded-lg border border-champagne/10 bg-bordeaux/30 p-5 sm:p-6"
          : "border-t border-champagne/10 pt-7"
      }
    >
      <div className="mb-6 max-w-3xl">
        <p className="night-kicker mb-2">{eyebrow}</p>
        <h3 className="text-xl font-semibold tracking-normal text-cream">
          {title}
        </h3>
        {description && (
          <p className="night-muted mt-2 text-sm leading-relaxed">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function VenueIntelligenceHeader({
  venues,
  selectedVenue,
  activeNight,
  nights,
  mode,
  trendRange,
  lastRefreshed,
  onVenueChange,
  onNightChange,
  onModeChange,
  onRangeChange,
  onRefresh,
}: {
  venues: VenueSummary[];
  selectedVenue: VenueSummary | undefined;
  activeNight: string;
  nights: string[];
  mode: DashboardMode;
  trendRange: TrendRange;
  lastRefreshed: Date | null;
  onVenueChange: (venueId: string) => void;
  onNightChange: (night: string) => void;
  onModeChange: (mode: DashboardMode) => void;
  onRangeChange: (range: TrendRange) => void;
  onRefresh: () => void;
}) {
  const activeIndex = nights.indexOf(activeNight);
  const previousNight = nights[activeIndex + 1] ?? "";
  const nextNight = nights[activeIndex - 1] ?? "";

  return (
    <header className="border-b border-champagne/10 pb-5">
      <div className="grid gap-5 xl:grid-cols-[1fr_auto] xl:items-end">
        <div>
          <p className="night-kicker mb-2">Founder dashboard</p>
          <h2 className="text-3xl font-semibold tracking-normal text-cream">
            Venue intelligence
          </h2>
          <p className="mt-2 text-sm text-cream">
            {selectedVenue?.venue_name ?? "Select a venue"}
            {selectedVenue?.venue_city ? ` · ${selectedVenue.venue_city}` : ""}
          </p>
          <p className="night-muted mt-1 text-xs">
            {mode === "single" && activeNight
              ? `${nightLabel(activeNight)} · venue-local night bucket`
              : `${trendRange} most recent venue nights`}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-44">
            <span className="mb-1 block text-xs text-taupe">Venue</span>
            <select
              value={selectedVenue?.venue_id ?? ""}
              onChange={(event) => onVenueChange(event.target.value)}
              className="night-input px-3 py-2 text-sm"
              aria-label="Select venue"
            >
              {venues.map((venue) => (
                <option key={venue.venue_id} value={venue.venue_id}>
                  {venue.venue_name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex rounded-full border border-champagne/15 p-0.5">
            {(["single", "trends"] as const).map((nextMode) => (
              <button
                key={nextMode}
                type="button"
                onClick={() => onModeChange(nextMode)}
                className={`rounded-full px-3 py-1.5 text-xs transition ${
                  mode === nextMode
                    ? "bg-red text-cream"
                    : "text-taupe hover:text-cream"
                }`}
              >
                {nextMode === "single" ? "Single night" : "Trends"}
              </button>
            ))}
          </div>

          {mode === "single" ? (
            <>
              <label className="min-w-48">
                <span className="mb-1 block text-xs text-taupe">Venue night</span>
                <select
                  value={activeNight}
                  onChange={(event) => onNightChange(event.target.value)}
                  className="night-input px-3 py-2 text-sm"
                  aria-label="Select venue night"
                >
                  {nights.map((night) => (
                    <option key={night} value={night}>
                      {nightLabel(night)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!previousNight}
                  onClick={() => onNightChange(previousNight)}
                  className="night-button night-button-secondary px-3 py-2 text-xs disabled:opacity-40"
                >
                  ‹ Previous
                </button>
                <button
                  type="button"
                  disabled={!nextNight}
                  onClick={() => onNightChange(nextNight)}
                  className="night-button night-button-secondary px-3 py-2 text-xs disabled:opacity-40"
                >
                  Next ›
                </button>
              </div>
            </>
          ) : (
            <label className="min-w-40">
              <span className="mb-1 block text-xs text-taupe">Range</span>
              <select
                value={trendRange}
                onChange={(event) => onRangeChange(event.target.value as TrendRange)}
                className="night-input px-3 py-2 text-sm"
                aria-label="Select trend range"
              >
                <option value="5">Last 5 nights</option>
                <option value="10">Last 10 nights</option>
                <option value="30">Last 30 nights</option>
              </select>
            </label>
          )}

          <button
            type="button"
            onClick={onRefresh}
            className="night-button night-button-secondary px-4 py-2 text-xs"
          >
            Refresh
          </button>
        </div>
      </div>
      <p className="night-muted mt-4 text-xs">
        Last refreshed: {lastRefreshed ? lastRefreshed.toLocaleString() : "Never"}
      </p>
    </header>
  );
}

function OutcomeScoreStrip({ metrics }: { metrics: OutcomeMetric[] }) {
  return (
    <section aria-label="Outcome summary" className="border-y border-champagne/10">
      <div className="grid gap-y-0 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <article
            key={metric.label}
            className="border-b border-champagne/10 py-5 pr-5 sm:odd:border-r sm:odd:border-champagne/10 lg:border-b-0 lg:border-r lg:last:border-r-0"
          >
            <p className="text-xs text-taupe">{metric.label}</p>
            <p
              className={`mt-2 font-semibold tabular-nums leading-none text-cream ${
                metric.primary ? "text-4xl" : "text-3xl"
              }`}
            >
              {number(metric.value)}
            </p>
            <p className="night-muted mt-2 text-xs">{metric.detail}</p>
            <p className="mt-1 text-xs text-blush">{metric.comparison}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function NightSummary({
  current,
  previous,
  largestDrop,
}: {
  current: Aggregate;
  previous: Aggregate;
  largestDrop: { label: string; drop: number; previous: number } | null;
}) {
  const sentences: string[] = [];
  if (current.uniqueScanners >= 5) {
    sentences.push(
      `${number(current.profileCompletions)} of ${number(
        current.uniqueScanners
      )} scanners completed a profile (${percent(
        current.profileCompletions,
        current.uniqueScanners
      )}).`
    );
  }
  if (current.scanCheckins > 0) {
    sentences.push(
      `${number(current.scanCheckins)} scanned users entered the experience; ${number(
        current.conversationsStarted
      )} conversation records followed.`
    );
  }
  if (current.uniqueScanners >= 5 && previous.uniqueScanners > 0) {
    sentences.push(
      `Reach ${current.uniqueScanners >= previous.uniqueScanners ? "improved" : "fell"} by ${number(
        Math.abs(current.uniqueScanners - previous.uniqueScanners)
      )} scanners versus the previous night.`
    );
  }
  if (sentences.length === 0 && largestDrop?.previous) {
    sentences.push(
      `${largestDrop.label} is the largest measured drop-off, but the sample is still small.`
    );
  }

  return (
    <Section
      eyebrow="Readout"
      title="Tonight at a glance"
      description="A deterministic summary from measured aggregates only."
    >
      {sentences.length === 0 ? (
        <DataState>Not enough measured activity yet to summarize this night.</DataState>
      ) : (
        <p className="max-w-3xl text-base leading-relaxed text-cream">
          {sentences.slice(0, 2).join(" ")}
        </p>
      )}
    </Section>
  );
}

function journeyDrop(steps: JourneyStep[]) {
  return steps
    .slice(1)
    .map((step, index) => {
      const previous = steps[index].value;
      if (previous === null || step.value === null) return null;
      return {
        label: `${steps[index].label} → ${step.label}`,
        drop: Math.max(previous - step.value, 0),
        previous,
      };
    })
    .filter((drop): drop is { label: string; drop: number; previous: number } =>
      drop !== null
    )
    .sort((a, b) => b.drop - a.drop)[0] ?? null;
}

function ConversionJourney({ steps }: { steps: JourneyStep[] }) {
  const first = steps.find((step) => step.value !== null)?.value ?? 0;
  const largestDrop = journeyDrop(steps);

  return (
    <Section
      eyebrow="Journey"
      title="Where did attendees drop off?"
      description="Sequential conversion uses one scanned-user cohort until event-only stages begin."
      surface
    >
      <div className="mb-6 max-w-2xl border-l border-red pl-4">
        <p className="text-sm text-taupe">Largest measured drop-off</p>
        <p className="mt-1 text-xl font-semibold text-cream">
          {largestDrop && largestDrop.previous > 0
            ? `${number(largestDrop.drop)} users · ${percent(
                largestDrop.drop,
                largestDrop.previous
              )} lost`
            : "Not enough measured drop-off"}
        </p>
        {largestDrop && largestDrop.previous > 0 && (
          <p className="night-muted mt-1 text-sm">{largestDrop.label}</p>
        )}
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[920px] grid-cols-7 gap-0">
          {steps.map((step, index) => {
            const previous = index === 0 ? step.value : steps[index - 1].value;
            const width =
              step.value === null || first === 0
                ? 0
                : Math.max(4, Math.round(rate(step.value, first) * 100));
            const drop =
              previous === null || step.value === null
                ? null
                : Math.max(previous - step.value, 0);
            return (
              <div key={step.label} className="relative border-t border-champagne/15 pt-5">
                {index < steps.length - 1 && (
                  <span className="absolute right-3 top-[-9px] text-taupe">→</span>
                )}
                <p className="pr-4 text-xs text-taupe">{step.label}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-cream">
                  {step.value === null ? "—" : number(step.value)}
                </p>
                <p className="mt-1 text-xs text-blush">
                  {step.value === null
                    ? "Not tracked yet"
                    : previous === null
                      ? "Previous stage not tracked"
                      : `${countOf(step.value, previous, "from previous")}`}
                </p>
                <div className="mt-4 h-2 rounded-full bg-velvet/80">
                  <div
                    className="h-full rounded-full bg-champagne"
                    style={{ width: `${width}%` }}
                  />
                </div>
                <p className="night-muted mt-2 pr-3 text-xs">
                  {drop === null ? "Drop-off unavailable" : `Drop-off ${number(drop)}`}
                  {` · ${step.availability}`}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

function NightActivity({ aggregate }: { aggregate: Aggregate }) {
  return (
    <Section
      eyebrow="Activity"
      title="When was the venue most active?"
      description="The current backend returns peak local hours, not a full hourly series yet."
    >
      <div className="grid gap-5 sm:grid-cols-3">
        <InlineValue label="Peak scan hour" value={hourLabel(aggregate.peakScanHour)} />
        <InlineValue
          label="Peak activity hour"
          value={hourLabel(aggregate.peakActivityHour)}
        />
        <InlineValue
          label="Scanner to entry"
          value={percent(aggregate.scanCheckins, aggregate.uniqueScanners)}
          detail={`${number(aggregate.scanCheckins)} of ${number(
            aggregate.uniqueScanners
          )} scanners`}
        />
      </div>
      <p className="night-muted mt-5 max-w-2xl text-sm leading-relaxed">
        Full hourly charts require interval-level aggregates. Until then, this
        section shows only the measured peak hours and conversion context.
      </p>
    </Section>
  );
}

function InlineValue({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="border-l border-champagne/15 pl-4">
      <p className="text-xs text-taupe">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-cream">
        {value}
      </p>
      {detail && <p className="night-muted mt-1 text-xs">{detail}</p>}
    </div>
  );
}

function AttentionInsightList({ insights }: { insights: Insight[] }) {
  return (
    <Section eyebrow="Attention" title="What deserves attention?">
      {insights.length === 0 ? (
        <DataState>Not enough measured volume yet to call out a reliable issue.</DataState>
      ) : (
        <div className="divide-y divide-champagne/10">
          {insights.slice(0, 3).map((insight) => (
            <article
              key={insight.topic}
              className="grid gap-3 py-4 sm:grid-cols-[12rem_1fr]"
            >
              <div className="border-l border-red pl-3">
                <p className="text-xs uppercase tracking-[0.18em] text-blush">
                  {insight.topic}
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-cream">
                  {insight.value}
                </p>
              </div>
              <p className="text-sm leading-relaxed text-cream">{insight.body}</p>
            </article>
          ))}
        </div>
      )}
    </Section>
  );
}

function AudienceComposition({ aggregate }: { aggregate: Aggregate }) {
  if (aggregate.checkins < AUDIENCE_MIN_COHORT) {
    return (
      <Section eyebrow="Audience" title="Who was in the room?">
        <DataState>
          Audience insights will appear when enough attendees are available to
          protect their privacy.
        </DataState>
      </Section>
    );
  }

  return (
    <Section
      eyebrow="Audience"
      title="Who was in the room?"
      description={`Sample size: ${number(
        aggregate.checkins
      )} checked-in attendees. Gender is mutually exclusive; preferences allow multiple selections.`}
    >
      <div className="grid gap-8 lg:grid-cols-2">
        <Distribution
          title="Gender distribution"
          total={aggregate.checkins}
          rows={[
            { label: "Women", value: aggregate.womenCheckins },
            { label: "Men", value: aggregate.menCheckins },
            { label: "Other / not specified", value: aggregate.nonbinaryCheckins },
          ]}
        />
        <Distribution
          title="Preferences · multiple selections allowed"
          total={aggregate.checkins}
          rows={[
            { label: "Same-gender interest", value: aggregate.sameGenderInterest },
            { label: "Multi-gender interest", value: aggregate.multiGenderInterest },
            { label: "Interested in women", value: aggregate.interestedInWomen },
            { label: "Interested in men", value: aggregate.interestedInMen },
            {
              label: "Interested in non-binary",
              value: aggregate.interestedInNonbinary,
            },
          ]}
        />
      </div>
    </Section>
  );
}

function Distribution({
  title,
  total,
  rows,
}: {
  title: string;
  total: number;
  rows: { label: string; value: number }[];
}) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-cream">{title}</h4>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[10rem_1fr_5rem] items-center gap-3 text-sm"
          >
            <span className="text-taupe">{row.label}</span>
            <div className="h-2 rounded-full bg-bordeaux">
              <div
                className="h-full rounded-full bg-champagne"
                style={{ width: `${percentValue(row.value, total)}%` }}
              />
            </div>
            <span className="text-right tabular-nums text-cream">
              {number(row.value)} · {percent(row.value, total)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailTable({ rows }: { rows: StatRow[] }) {
  if (rows.length === 0) {
    return <DataState>No detailed aggregate rows for this selection.</DataState>;
  }

  return (
    <Section
      eyebrow="Drill-down"
      title="What aggregate data supports this view?"
      description="Counts only. No raw users, message content, emails, or phone numbers."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-champagne/15 text-left text-xs text-taupe">
              <th className="py-3 font-normal">Night</th>
              <th className="py-3 text-right font-normal">Unique scanners</th>
              <th className="py-3 text-right font-normal">Profiles</th>
              <th className="py-3 text-right font-normal">Entered</th>
              <th className="py-3 text-right font-normal">Profile views</th>
              <th className="py-3 text-right font-normal">Conversations</th>
              <th className="py-3 text-right font-normal">Returning</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={`${row.venue_id}-${row.night}`}
                className="border-b border-champagne/10"
              >
                <td className="py-3 text-cream">{nightLabel(row.night)}</td>
                <td className="py-3 text-right tabular-nums text-taupe">
                  {number(row.unique_scanners)}
                </td>
                <td className="py-3 text-right tabular-nums text-taupe">
                  {number(row.profile_completions)}
                </td>
                <td className="py-3 text-right tabular-nums text-taupe">
                  {number(row.scan_checkins)}
                </td>
                <td className="py-3 text-right tabular-nums text-taupe">
                  {row.profile_viewers === 0 ? "—" : number(row.profile_viewers)}
                </td>
                <td className="py-3 text-right tabular-nums text-taupe">
                  {number(row.conversations_started)}
                </td>
                <td className="py-3 text-right tabular-nums text-taupe">
                  {number(row.returning_users)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function TrendMetricSelector({
  metric,
  onMetricChange,
}: {
  metric: TrendMetricKey;
  onMetricChange: (metric: TrendMetricKey) => void;
}) {
  const options: { key: TrendMetricKey; label: string }[] = [
    { key: "uniqueScanners", label: "Unique scanners" },
    { key: "scanCheckins", label: "Entered experience" },
    { key: "profileCompletions", label: "Profile completions" },
    { key: "conversationsStarted", label: "Conversation records" },
    { key: "returningUsers", label: "Returning users" },
  ];

  return (
    <label className="inline-flex items-center gap-3 text-sm text-taupe">
      Metric
      <select
        value={metric}
        onChange={(event) => onMetricChange(event.target.value as TrendMetricKey)}
        className="night-input w-56 px-3 py-2 text-sm"
      >
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function PrimaryTrend({
  rows,
  previousRows,
  metric,
  onMetricChange,
}: {
  rows: StatRow[];
  previousRows: StatRow[];
  metric: TrendMetricKey;
  onMetricChange: (metric: TrendMetricKey) => void;
}) {
  const max = Math.max(
    ...rows.map((row) => metricValue(metric, aggregateRows([row]))),
    0
  );
  const current = metricValue(metric, aggregateRows(rows));
  const previous = metricValue(metric, aggregateRows(previousRows));

  return (
    <Section
      eyebrow="Trend"
      title="Are nights improving?"
      description="One selected metric across recent venue nights. Use the table below for precise comparison."
      surface
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-4xl font-semibold tabular-nums text-cream">
            {number(current)}
          </p>
          <p className="night-muted mt-1 text-sm">
            {METRIC_REGISTRY[metric].displayName}
            <MetricDefinitionTooltip metric={METRIC_REGISTRY[metric]} />
          </p>
          <p className="mt-1 text-xs text-blush">
            {previousRows.length > 0
              ? absoluteChange(current, previous)
              : "No previous comparable range"}
          </p>
        </div>
        <TrendMetricSelector metric={metric} onMetricChange={onMetricChange} />
      </div>

      {rows.length === 0 ? (
        <DataState>No trend rows for this selection.</DataState>
      ) : (
        <div className="space-y-4">
          {rows.slice().reverse().map((row) => {
            const value = metricValue(metric, aggregateRows([row]));
            const width =
              max === 0 || value === 0 ? 0 : Math.max(5, Math.round((value / max) * 100));
            return (
              <div key={`${row.venue_id}-${row.night}`}>
                <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium text-cream">{nightLabel(row.night)}</span>
                  <span className="tabular-nums text-taupe">{number(value)}</span>
                </div>
                <div className="h-2 rounded-full bg-velvet/80">
                  <div
                    className="h-full rounded-full bg-red"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function NightComparisonTable({
  rows,
  selectedNight,
  sortKey,
  onSortChange,
  onDrillDown,
}: {
  rows: StatRow[];
  selectedNight: string;
  sortKey: TableSortKey;
  onSortChange: (key: TableSortKey) => void;
  onDrillDown: (night: string) => void;
}) {
  const sortedRows = rows.slice().sort((a, b) => {
    if (sortKey === "night") return b.night.localeCompare(a.night);
    const aValue = metricValue(sortKey, aggregateRows([a]));
    const bValue = metricValue(sortKey, aggregateRows([b]));
    return bValue - aValue || b.night.localeCompare(a.night);
  });

  const headers: { key: TableSortKey; label: string }[] = [
    { key: "night", label: "Night" },
    { key: "uniqueScanners", label: "Unique scanners" },
    { key: "profileCompletions", label: "Profiles" },
    { key: "scanCheckins", label: "Entered" },
    { key: "conversationsStarted", label: "Conversations" },
    { key: "returningUsers", label: "Returning" },
  ];

  return (
    <Section
      eyebrow="Comparison"
      title="Which nights performed better?"
      description="Sorted table for investigation. Select a row to inspect that night in Single night mode."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-champagne/15 text-left text-xs text-taupe">
              {headers.map((header, index) => (
                <th
                  key={header.key}
                  className={`py-3 font-normal ${index > 0 ? "text-right" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => onSortChange(header.key)}
                    className="hover:text-cream"
                  >
                    {header.label}
                    {sortKey === header.key ? " ↓" : ""}
                  </button>
                </th>
              ))}
              <th className="py-3 text-right font-normal">Entry rate</th>
              <th className="py-3 text-right font-normal">Conversation rate</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const aggregate = aggregateRows([row]);
              const selected = row.night === selectedNight;
              return (
                <tr
                  key={`${row.venue_id}-${row.night}`}
                  className={`border-b border-champagne/10 transition hover:bg-bordeaux/35 ${
                    selected ? "bg-bordeaux/40" : ""
                  }`}
                >
                  <td className="py-3">
                    <button
                      type="button"
                      onClick={() => onDrillDown(row.night)}
                      className="font-medium text-cream hover:text-blush"
                    >
                      {nightLabel(row.night)}
                    </button>
                  </td>
                  <td className="py-3 text-right tabular-nums text-taupe">
                    {number(aggregate.uniqueScanners)}
                  </td>
                  <td className="py-3 text-right tabular-nums text-taupe">
                    {number(aggregate.profileCompletions)}
                  </td>
                  <td className="py-3 text-right tabular-nums text-taupe">
                    {number(aggregate.scanCheckins)}
                  </td>
                  <td className="py-3 text-right tabular-nums text-taupe">
                    {number(aggregate.conversationsStarted)}
                  </td>
                  <td className="py-3 text-right tabular-nums text-taupe">
                    {number(aggregate.returningUsers)}
                  </td>
                  <td className="py-3 text-right tabular-nums text-cream">
                    {percent(aggregate.scanCheckins, aggregate.uniqueScanners)}
                  </td>
                  <td className="py-3 text-right tabular-nums text-cream">
                    {percent(aggregate.conversationsStarted, aggregate.scanCheckins)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function SourceAndReturnNotes({ rows, aggregate }: { rows: StatRow[]; aggregate: Aggregate }) {
  const sourceRows = rows.filter(
    (row) =>
      row.top_source !== null ||
      row.top_medium !== null ||
      row.top_campaign !== null ||
      row.top_qr_code_id !== null
  );

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <Section
        eyebrow="Source"
        title="Which source brings engaged users?"
        description="Shown only when attribution fields are present in tracked events."
      >
        {sourceRows.length === 0 ? (
          <DataState>Source and QR attribution are not available for this range yet.</DataState>
        ) : (
          <div className="space-y-3">
            {sourceRows.slice(0, 6).map((row) => (
              <div
                key={`${row.venue_id}-${row.night}-${row.top_source ?? "source"}`}
                className="flex items-center justify-between border-b border-champagne/10 py-2 text-sm"
              >
                <span className="text-cream">
                  {row.top_source ?? row.top_qr_code_id ?? "Unknown source"}
                </span>
                <span className="text-taupe">{nightLabel(row.night)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        eyebrow="Retention"
        title="Who returned?"
        description="Return signals come from previous scan activity."
      >
        <div className="grid gap-5 sm:grid-cols-3 lg:grid-cols-1">
          <InlineValue
            label="Returning users"
            value={number(aggregate.returningUsers)}
            detail={countOf(aggregate.returningUsers, aggregate.uniqueScanners, "scanners")}
          />
          <InlineValue label="Same venue" value={number(aggregate.returningSameVenue)} />
          <InlineValue label="Other venue" value={number(aggregate.returningOtherVenue)} />
        </div>
      </Section>
    </div>
  );
}

function buildInsights(current: Aggregate, previous: Aggregate, largestDrop: ReturnType<typeof journeyDrop>) {
  const insights: Insight[] = [];

  if (current.uniqueScanners >= 10 && rate(current.profileCompletions, current.uniqueScanners) < 0.5) {
    insights.push({
      topic: "Profile creation",
      value: percent(current.profileCompletions, current.uniqueScanners),
      body: `${number(current.profileCompletions)} of ${number(
        current.uniqueScanners
      )} scanners completed a profile. This is a measured setup drop-off.`,
    });
  }

  if (largestDrop && largestDrop.previous >= 10 && largestDrop.drop > 0) {
    insights.push({
      topic: "Largest drop-off",
      value: number(largestDrop.drop),
      body: `${largestDrop.label} lost ${number(largestDrop.drop)} of ${number(
        largestDrop.previous
      )} users.`,
    });
  }

  if (current.scanCheckins >= 10 && current.conversationsStarted === 0) {
    insights.push({
      topic: "Interaction",
      value: "0",
      body: "People entered the experience, but no conversation records were measured for this night.",
    });
  }

  if (current.conversationsStarted >= 5 && rate(current.reciprocalConversations, current.conversationsStarted) < 0.4) {
    insights.push({
      topic: "Conversation quality",
      value: percent(current.reciprocalConversations, current.conversationsStarted),
      body: `${number(current.reciprocalConversations)} of ${number(
        current.conversationsStarted
      )} conversation records became reciprocal.`,
    });
  }

  if (current.uniqueScanners >= 10 && previous.uniqueScanners > 0) {
    const change = current.uniqueScanners - previous.uniqueScanners;
    if (Math.abs(change) >= 5) {
      insights.push({
        topic: "Reach",
        value: `${change > 0 ? "+" : ""}${number(change)}`,
        body: `Unique scanners ${
          change > 0 ? "increased" : "decreased"
        } versus the previous venue night.`,
      });
    }
  }

  return insights.slice(0, 3);
}

function SingleNightView({
  rows,
  previousRows,
}: {
  rows: StatRow[];
  previousRows: StatRow[];
}) {
  const current = aggregateRows(rows);
  const previous = aggregateRows(previousRows);
  const journeySteps: JourneyStep[] = [
    {
      label: "QR scanned",
      value: current.uniqueScanners,
      availability: METRIC_REGISTRY.uniqueScanners.availability,
    },
    {
      label: "Profile created",
      value: current.profileCompletions,
      availability: METRIC_REGISTRY.profileCompletions.availability,
    },
    {
      label: "Entered experience",
      value: current.scanCheckins,
      availability: METRIC_REGISTRY.scanCheckins.availability,
    },
    {
      label: "Profile viewed",
      value: current.hasEventTracking ? current.profileViewers : null,
      availability: current.hasEventTracking
        ? METRIC_REGISTRY.profileViewers.availability
        : "Not historically tracked",
    },
    {
      label: "Conversation opened",
      value: current.conversationOpeners,
      availability: METRIC_REGISTRY.conversationsStarted.availability,
    },
    {
      label: "First message sent",
      value: current.firstMessageSenders,
      availability: "Message aggregate",
    },
    {
      label: "Reply received",
      value: current.repliedConversations,
      availability: "Message aggregate",
    },
  ];
  const largestDrop = journeyDrop(journeySteps);

  const outcomes: OutcomeMetric[] = [
    {
      label: "Reached",
      value: current.uniqueScanners,
      detail: "unique scanners",
      comparison: absoluteChange(current.uniqueScanners, previousRows.length ? previous.uniqueScanners : null),
      primary: true,
    },
    {
      label: "Activated",
      value: current.scanCheckins,
      detail: countOf(current.scanCheckins, current.uniqueScanners, "scanners"),
      comparison:
        previousRows.length > 0
          ? rateChange(
              current.scanCheckins,
              current.uniqueScanners,
              previous.scanCheckins,
              previous.uniqueScanners
            )
          : "No previous comparison",
    },
    {
      label: "Connected",
      value: current.conversationsStarted,
      detail: countOf(current.conversationsStarted, current.scanCheckins, "entered users"),
      comparison:
        previousRows.length > 0
          ? rateChange(
              current.conversationsStarted,
              current.scanCheckins,
              previous.conversationsStarted,
              previous.scanCheckins
            )
          : "No previous comparison",
    },
    {
      label: "Returning",
      value: current.returningUsers,
      detail: countOf(current.returningUsers, current.uniqueScanners, "scanners"),
      comparison:
        previousRows.length > 0
          ? rateChange(
              current.returningUsers,
              current.uniqueScanners,
              previous.returningUsers,
              previous.uniqueScanners
            )
          : "No previous comparison",
    },
  ];

  return (
    <>
      <OutcomeScoreStrip metrics={outcomes} />
      <NightSummary current={current} previous={previous} largestDrop={largestDrop} />
      <ConversionJourney steps={journeySteps} />
      <NightActivity aggregate={current} />
      <AttentionInsightList insights={buildInsights(current, previous, largestDrop)} />
      <AudienceComposition aggregate={current} />
      <DetailTable rows={rows} />
      <DataState>
        Profile views, chat opens, sessions, and attribution are available from
        the analytics tracking start date. Historical values for those stages are
        not backfilled.
      </DataState>
    </>
  );
}

function TrendsView({
  rows,
  previousRows,
  selectedNight,
  trendMetric,
  sortKey,
  onMetricChange,
  onSortChange,
  onDrillDown,
}: {
  rows: StatRow[];
  previousRows: StatRow[];
  selectedNight: string;
  trendMetric: TrendMetricKey;
  sortKey: TableSortKey;
  onMetricChange: (metric: TrendMetricKey) => void;
  onSortChange: (key: TableSortKey) => void;
  onDrillDown: (night: string) => void;
}) {
  const aggregate = aggregateRows(rows);

  return (
    <>
      <PrimaryTrend
        rows={rows}
        previousRows={previousRows}
        metric={trendMetric}
        onMetricChange={onMetricChange}
      />
      <NightComparisonTable
        rows={rows}
        selectedNight={selectedNight}
        sortKey={sortKey}
        onSortChange={onSortChange}
        onDrillDown={onDrillDown}
      />
      <SourceAndReturnNotes rows={rows} aggregate={aggregate} />
      <Section
        eyebrow="Definitions"
        title="How should these metrics be read?"
        description="Each metric has one primary home. Repeated values appear only as table detail or chart context."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {Object.values(METRIC_REGISTRY).map((metric) => (
            <article key={metric.key} className="border-t border-champagne/10 pt-4">
              <p className="text-sm font-medium text-cream">{metric.displayName}</p>
              <p className="night-muted mt-1 text-xs leading-relaxed">
                {metric.description}
              </p>
              <p className="night-muted mt-2 text-xs">
                Primary location: {metric.primaryLocation}
              </p>
            </article>
          ))}
        </div>
      </Section>
    </>
  );
}

export function Stats() {
  const [rows, setRows] = useState<StatRow[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState(() =>
    readInitialParam("venue")
  );
  const [selectedNight, setSelectedNight] = useState(() => readInitialParam("night"));
  const [mode, setMode] = useState<DashboardMode>(() => readInitialMode());
  const [trendRange, setTrendRange] = useState<TrendRange>(() => readInitialRange());
  const [trendMetric, setTrendMetric] = useState<TrendMetricKey>(() =>
    readInitialTrendMetric()
  );
  const [sortKey, setSortKey] = useState<TableSortKey>("night");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("admin_founder_analytics");
    if (rpcError) {
      setError(`Could not load stats: ${rpcError.message}`);
      setRows([]);
    } else {
      const analyticsRows = data ?? [];
      if (analyticsRows.some((row) => !("scan_checkins" in row))) {
        setError(
          "Could not load stats: admin_founder_analytics is out of date. Run the latest founder analytics SQL migration."
        );
        setRows([]);
        setLoading(false);
        return;
      }
      setError("");
      setRows(analyticsRows);
      setLastRefreshed(new Date());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const venues = useMemo(() => summarizeVenues(rows), [rows]);
  const selectedVenue =
    venues.find((venue) => venue.venue_id === selectedVenueId) ?? venues[0];
  const venueRows = selectedVenue?.rows ?? [];
  const nights = uniqueNights(venueRows);
  const activeNight =
    selectedNight && nights.includes(selectedNight) ? selectedNight : nights[0] ?? "";
  const singleNightRows = venueRows.filter((row) => row.night === activeNight);
  const activeIndex = nights.indexOf(activeNight);
  const previousNightRows =
    activeIndex >= 0 && nights[activeIndex + 1]
      ? venueRows.filter((row) => row.night === nights[activeIndex + 1])
      : [];
  const rangeSize = Number(trendRange);
  const trendRows = venueRows.slice(0, rangeSize);
  const previousTrendRows = venueRows.slice(rangeSize, rangeSize * 2);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (selectedVenue?.venue_id) params.set("venue", selectedVenue.venue_id);
    if (activeNight) params.set("night", activeNight);
    params.set("mode", mode);
    if (mode === "trends") {
      params.set("range", trendRange);
      params.set("metric", trendMetric);
    }
    const next = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, "", next);
  }, [selectedVenue?.venue_id, activeNight, mode, trendRange, trendMetric]);

  if (loading) return <Skeleton />;
  if (error) return <p className="text-sm text-red-300">{error}</p>;

  return (
    <section className="space-y-9">
      <VenueIntelligenceHeader
        venues={venues}
        selectedVenue={selectedVenue}
        activeNight={activeNight}
        nights={nights}
        mode={mode}
        trendRange={trendRange}
        lastRefreshed={lastRefreshed}
        onVenueChange={(venueId) => {
          setSelectedVenueId(venueId);
          setSelectedNight("");
        }}
        onNightChange={(night) => {
          setSelectedNight(night);
          setMode("single");
        }}
        onModeChange={setMode}
        onRangeChange={setTrendRange}
        onRefresh={load}
      />

      {rows.length === 0 || !selectedVenue ? (
        <DataState>
          Stats will appear once people scan, create profiles, check in, view
          profiles, or message.
        </DataState>
      ) : mode === "single" ? (
        <SingleNightView rows={singleNightRows} previousRows={previousNightRows} />
      ) : (
        <TrendsView
          rows={trendRows}
          previousRows={previousTrendRows}
          selectedNight={activeNight}
          trendMetric={trendMetric}
          sortKey={sortKey}
          onMetricChange={setTrendMetric}
          onSortChange={setSortKey}
          onDrillDown={(night) => {
            setSelectedNight(night);
            setMode("single");
          }}
        />
      )}
    </section>
  );
}
