"use client";

import { ProfilePhoto as AuthorizedPhoto } from "@/components/ProfilePhoto";
import { PhotoStatus } from "@/components/PhotoStatus";
import { usePhotoState, PHOTO_REFRESH_EVENT, photoGeneration, invalidatePhotos } from "@/lib/usePhotoState";
import { isVenueSlug, isValidText, SAFETY_NOTE_MAX_LENGTH } from "@/lib/input-validation";

import { BrandLogo } from "@/app/BrandLogo";

import {
  FormEvent,
  MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Heart, MoreHorizontal } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { ensureAnonSession } from "@/lib/auth";
import { createVenueSession, venueEffect, venueResources, coalesceVenueChecks, presenceHasEnded } from "@/lib/venue-session";
import { releaseVenueChannel } from "@/lib/venue-channel";
import { resolveEntryCycle } from "@/lib/entry-cycle";
import { browserLocale, localeForCity, t } from "@/lib/strings";
import {
  preferredLocale,
  useBrowserLocale,
  usePreferredLocale,
} from "@/lib/useLocale";
import { LanguageSelector } from "@/app/LanguageSelector";
import { EmptyLiveRoom } from "./EmptyLiveRoom";
import { emptyRoomVariant, feedTransition } from "@/lib/empty-room";
import { PreLaunchWaitingRoom } from "./PreLaunchWaitingRoom";
import { Modal } from "@/components/ui/modal";
import type { Database } from "@/lib/database.types";
import {
  getEmailSubscription,
  subscribeEmail,
} from "@/lib/email-subscriptions";
import {
  chatReadMarkerKey,
  countUnreadByMatch,
  legacyChatReadMarkerKey,
} from "@/lib/chat-read-state";
import { orderMatchesByAttention } from "@/lib/match-order";

// Public-facing profile: only the columns other users are ever allowed to see.
type PublicProfile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "first_name" | "photo_url" | "bio"
>;
const PUBLIC_COLUMNS = "id, first_name, photo_url, bio";

// A room candidate is a public profile plus its check-in time. "Just arrived"
// is computed at fetch time (render must stay pure) and re-derived on a slow
// interval so the tag expires even in a quiet room. The feed is ordered by
// arrival (oldest first): new people append at the bottom, so the list never
// reshuffles under the thumb.
type Candidate = PublicProfile & { checkedInAt: string; justArrived: boolean };

type GestureHeart = {
  x: number;
  y: number;
};

type Venue = Pick<
  Database["public"]["Tables"]["venues"]["Row"],
  "id" | "name" | "city" | "timezone"
>;

type VenueNightState = Pick<
  Database["public"]["Tables"]["venue_night_public_state"]["Row"],
  | "venue_night_id"
  | "status"
  | "participant_count"
  | "launch_threshold"
  | "guaranteed_launch_at"
  | "closes_at"
  | "terminal_reason"
  | "updated_at"
>;

type PresenceChange = Pick<
  Database["public"]["Tables"]["presence"]["Row"],
  "left_at" | "is_visible"
>;

type EntryPresence = Pick<
  Database["public"]["Tables"]["presence"]["Row"],
  "id" | "left_at" | "is_visible"
>;

type MatchRow = Pick<
  Database["public"]["Tables"]["matches"]["Row"],
  "id" | "profile_a" | "profile_b" | "expires_at" | "created_at"
>;

type RoomMessage = Pick<
  Database["public"]["Tables"]["messages"]["Row"],
  "match_id" | "sender_id" | "created_at"
>;

type ActiveMatch = {
  id: string;
  other: PublicProfile;
  createdAt: string;
  latestMessageAt: string | null;
};

const REPORT_REASONS = [
  "harassment",
  "fake_profile",
  "underage",
  "unsafe_behavior",
  "other",
] as const;
type ReportReason = (typeof REPORT_REASONS)[number];

// How often we bump our presence heartbeat. Presence does not expire on this
// timer (the room lasts the night, closed by the rollover cron) — the heartbeat
// just keeps last_seen_at fresh while the tab is open.
const HEARTBEAT_MS = 120_000;
// A candidate checked in within this window gets a "just arrived" tag —
// arrivals are the heartbeat of the room, they should be felt.
const JUST_ARRIVED_MS = 10 * 60_000;
// Coalesce realtime presence bursts into a single room reload.
const PRESENCE_REFETCH_THROTTLE_MS = 2_500;
// Realtime is the fast path; this slow poll repairs a missed lifecycle event.
const VENUE_NIGHT_POLL_MS = 5_000;
const ROOM_HINT_DISMISS_KEY = "amourette-room-hint-dismissed";
const LEGACY_ROOM_HINT_DISMISS_KEY = "paramour-room-hint-dismissed";
// The entry threshold is an arrival ceremony, not a loading spinner (#103):
// held for a readable minimum the FIRST time you enter a venue this session,
// and skipped entirely on re-entry (bouncing back from the profile editor, a
// re-boot) so it never flashes as an unreadable "stamp".
const ARRIVAL_MIN_MS = 2200;
const ENTERED_SESSION_PREFIX = "amourette-entered";
const VENUE_NIGHT_SESSION_PREFIX = "amourette-venue-night";
const EMAIL_PROMPT_ACTIVE_MS = 2 * 60_000;
const EMAIL_PROMPT_DISMISS_PREFIX = "amourette-email-prompt-dismissed";
const EMAIL_WAITING_ROOM_OFFERED_PREFIX = "amourette-email-waiting-room-offered";
// A single card tap unfolds the bio, while two quick taps like the profile.
// Keep this short enough to feel responsive but long enough for a natural
// one-handed double tap in a busy room.
const DOUBLE_TAP_MS = 280;

type Status =
  | "loading"
  | "ready"
  | "error"
  | "notfound"
  | "left"
  | "invisible"
  | "offHours"
  | "waiting"
  | "paused"
  | "cancelled"
  | "ended";

// Per-tab-session marker that this venue has already been entered, so the
// arrival ceremony plays once and re-entries stay quiet (#103).
function enteredSessionKey(slug: string) {
  return `${ENTERED_SESSION_PREFIX}:${slug}`;
}

function venueNightSessionKey(slug: string) {
  return `${VENUE_NIGHT_SESSION_PREFIX}:${slug}`;
}

function hasEnteredThisSession(slug: string) {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(enteredSessionKey(slug)) === "1";
}

function getReadMarker(matchId: string) {
  if (typeof window === "undefined") return "1970-01-01T00:00:00.000Z";
  return (
    window.localStorage.getItem(chatReadMarkerKey(matchId)) ??
    window.localStorage.getItem(legacyChatReadMarkerKey(matchId)) ??
    "1970-01-01T00:00:00.000Z"
  );
}

function countUnreadMessages(messages: RoomMessage[], myId: string) {
  const markers = Object.fromEntries(
    [...new Set(messages.map((message) => message.match_id))].map((matchId) => [
      matchId,
      getReadMarker(matchId),
    ]),
  );
  return countUnreadByMatch(messages, myId, markers);
}

// The database calls a venue night by the local date on which it ends at
// 06:00. Use that same key so dismissing the optional prompt survives refreshes
// and leave/rejoin without suppressing it forever.
function venueNightKey(timezone: string, at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const year = value("year");
  const month = value("month");
  const day = value("day");
  const hour = value("hour");
  const endDate = new Date(Date.UTC(year, month - 1, day + (hour >= 6 ? 1 : 0)));
  return endDate.toISOString().slice(0, 10);
}

function emailPromptDismissKey(timezone: string) {
  return `${EMAIL_PROMPT_DISMISS_PREFIX}:${venueNightKey(timezone)}`;
}

function emailWaitingRoomOfferedKey(timezone: string) {
  return `${EMAIL_WAITING_ROOM_OFFERED_PREFIX}:${venueNightKey(timezone)}`;
}

function removeVenueChannel(channel: RealtimeChannel) {
  void releaseVenueChannel(channel, () => supabase.removeChannel(channel));
}

export default function VenueRoom() {
  const params = useParams<{ venueSlug: string }>();
  return <VenueRoomSession key={params.venueSlug} venueSlug={params.venueSlug} />;
}

function VenueRoomSession({ venueSlug }: { venueSlug: string }) {
  const router = useRouter();
  const session = useRef(createVenueSession());
  useLayoutEffect(() => () => session.current.stop(), []);

  const [me, setMe] = useState<PublicProfile | null>(null);
  const photoState = usePhotoState(me?.id ?? null);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [venueNight, setVenueNight] = useState<VenueNightState | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [pendingLikeIds, setPendingLikeIds] = useState<Set<string>>(new Set());
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());
  const [matches, setMatches] = useState<ActiveMatch[]>([]);
  const [unreadByMatchId, setUnreadByMatchId] = useState<Record<string, number>>(
    {}
  );
  const [newMatch, setNewMatch] = useState<ActiveMatch | null>(null);
  const [roomCount, setRoomCountState] = useState<number | null>(null);
  const [activePresenceId, setActivePresenceId] = useState<string | null>(null);
  const [justLeftVenue, setJustLeftVenue] = useState(false);
  const [leaveConfirmationOpen, setLeaveConfirmationOpen] = useState(false);
  const [leavePending, setLeavePending] = useState(false);
  const [roomMenuOpen, setRoomMenuOpen] = useState(false);
  // The profile currently filling the viewport, so the single chrome ⋯ can
  // carry that person's safety actions (report/block). Tracked on feed scroll.
  const [currentVisibleId, setCurrentVisibleId] = useState<string | null>(null);
  // Matches float as a collapsed pill; tapping expands to the full strip.
  const [matchesExpanded, setMatchesExpanded] = useState(false);
  const [reportTarget, setReportTarget] = useState<PublicProfile | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>("harassment");
  const [reportNote, setReportNote] = useState("");
  const [reportNoteError, setReportNoteError] = useState("");
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const reportNoteRef = useRef<HTMLTextAreaElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [arrivalCue, setArrivalCue] = useState(false);
  // Bumped to re-run the bootstrap (the closed screen reopening the room).
  const [bootNonce, setBootNonce] = useState(0);
  const [blockTarget, setBlockTarget] = useState<PublicProfile | null>(null);
  const [blockReason, setBlockReason] = useState<ReportReason>("unsafe_behavior");
  const [blockNote, setBlockNote] = useState("");
  // Blocking is a one-tap safety action: the reason (a moderation signal) is
  // folded away behind an optional disclosure, defaulted so the insert stays a
  // valid signal without asking anything of the user.
  const [blockReasonOpen, setBlockReasonOpen] = useState(false);
  const [status, setStatusState] = useState<Status>("loading");
  // Whether the loading screen shows the full arrival doorway (first entry) or
  // stays a quiet ambient beat (re-entry). Seeded from the session marker so the
  // first paint is already right, then re-decided each bootstrap.
  const [showDoorway, setShowDoorway] = useState(
    () => !hasEnteredThisSession(venueSlug)
  );
  // The doorway is the ceremony of someone actually walking in, so it stays
  // shut until every prerequisite for entering is resolved and satisfied:
  // venue, open night, completed profile, adult confirmation, and an entry
  // cycle that is not checked out. Without this gate a first-ever scanner sees
  // "you're entering <venue>" flash before onboarding even opens (#135).
  const [entryEligible, setEntryEligible] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showRoomHint, setShowRoomHint] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem(ROOM_HINT_DISMISS_KEY) !== "1" &&
      window.localStorage.getItem(LEGACY_ROOM_HINT_DISMISS_KEY) !== "1"
  );
  const [emailPromptEligible, setEmailPromptEligible] = useState(false);
  const [emailPromptOpen, setEmailPromptOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [emailConsent, setEmailConsent] = useState(false);
  const [emailPromptState, setEmailPromptState] = useState<
    "idle" | "saving" | "success"
  >("idle");
  const [emailPromptError, setEmailPromptError] = useState("");
  const [waitingRoomEmailVisible, setWaitingRoomEmailVisible] = useState(false);
  // Already on the list (from the landing, a previous night, or tonight's
  // popup): the empty room shows a confirmation instead of asking again.
  const [emailSubscribed, setEmailSubscribed] = useState(false);
  // Empty-room framing. Once the room has held more than just us tonight,
  // "it's filling up" is no longer the honest line to show when it drains back
  // to nobody, so every count that lands is remembered.
  const [roomHadCrowd, setRoomHadCrowd] = useState(false);
  const setRoomCount = useCallback((count: number | null) => {
    setRoomCountState(count);
    if ((count ?? 0) > 1) setRoomHadCrowd(true);
  }, []);
  // Transient acknowledgement when the feed drains under the participant
  // (the last profile left, blocked us, or turned into a match).
  const [feedDrained, setFeedDrained] = useState(false);
  // An answer is being typed on the empty room: hold the feed back rather than
  // swapping the screen away mid-sentence.
  const [emptyRoomHeld, setEmptyRoomHeld] = useState(false);
  const emailPromptElapsedRef = useRef(0);
  const emailPromptVenueSlugRef = useRef(venueSlug);
  // Render-safe mirror of the ref above: the render gate can't read a ref's
  // `.current` during render, so we keep the prompt's venue in state too. It is
  // set in lockstep with the ref so the stale-venue guard behaves identically.
  const [emailPromptVenueSlug, setEmailPromptVenueSlug] = useState(venueSlug);

  // Locale follows the venue's city once it is known; before that (loading,
  // hard errors) we fall back to the browser language (resolved after mount to
  // avoid an SSR hydration mismatch on the loading screen).
  const browserLoc = useBrowserLocale();
  const locale = usePreferredLocale(
    venue ? localeForCity(venue.city) : browserLoc
  );
  const s = t[locale].room;

  // Keep the latest "me"/status available to realtime callbacks without
  // resubscribing.
  const meRef = useRef<PublicProfile | null>(null);
  const statusRef = useRef<Status>("loading");
  const venueNightRef = useRef<VenueNightState | null>(null);
  const setStatus = useCallback((next: Status) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);
  const resources = venueResources(status);
  const reentryRequestedRef = useRef(false);
  const matchIdsRef = useRef<Set<string>>(new Set());
  const matchStackRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    meRef.current = me;
  }, [me]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    venueNightRef.current = venueNight;
  }, [venueNight]);
  useEffect(() => {
    matchIdsRef.current = new Set(matches.map((match) => match.id));
  }, [matches]);

  // Collapse on a press outside the match stack without placing a backdrop
  // over the room. The document listener observes the gesture but never
  // cancels it, so the same touch can continue into a vertical feed swipe.
  useEffect(() => {
    if (!matchesExpanded) return;
    function onPointerDown(event: PointerEvent) {
      if (
        matchStackRef.current &&
        event.target instanceof Node &&
        !matchStackRef.current.contains(event.target)
      ) {
        setMatchesExpanded(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [matchesExpanded]);

  // Count time actually spent using the visible room, not wall-clock time
  // while the phone is locked. Safety and match overlays always take priority.
  useEffect(() => {
    const blocked = Boolean(
      newMatch || reportTarget || blockTarget || roomMenuOpen
    );
    if (
      !emailPromptEligible ||
      emailPromptOpen ||
      status !== "ready" ||
      blocked
    ) {
      return;
    }

    const scope = venueEffect(session.current.signal);
    const interval = window.setInterval(() => {
      if (scope.signal.aborted) return;
      if (document.visibilityState !== "visible") return;
      emailPromptElapsedRef.current += 1_000;
      if (emailPromptElapsedRef.current >= EMAIL_PROMPT_ACTIVE_MS) {
        setEmailPromptOpen(true);
      }
    }, 1_000);
    scope.signal.addEventListener("abort", () => window.clearInterval(interval), { once: true });
    return scope.stop;
  }, [
    emailPromptEligible,
    emailPromptOpen,
    status,
    newMatch,
    reportTarget,
    blockTarget,
    roomMenuOpen,
  ]);

  // Esc-to-dismiss lives in the shared Modal now, gated by its `dismissable`
  // prop (which we tie to the saving state below).

  useEffect(() => {
    if (emailPromptState !== "success" || session.current.signal.aborted) return;
    const scope = venueEffect(session.current.signal);
    const timeout = window.setTimeout(() => {
      if (!scope.signal.aborted) setEmailPromptOpen(false);
    }, 1_800);
    scope.signal.addEventListener("abort", () => window.clearTimeout(timeout), { once: true });
    return scope.stop;
  }, [emailPromptState]);

  // The feed's scroll container plus what it takes to keep the profile under
  // the thumb in place across list changes (see the anchoring layout effect).
  const feedRef = useRef<HTMLDivElement | null>(null);
  const feedIdsRef = useRef<string[]>([]);
  const anchorIdRef = useRef<string | null>(null);
  const arrivalCueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const feedDrainedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (arrivalCueTimerRef.current) clearTimeout(arrivalCueTimerRef.current);
      if (feedDrainedTimerRef.current) clearTimeout(feedDrainedTimerRef.current);
    },
    []
  );

  const clearRoom = useCallback(() => {
    setCandidates([]);
    setLikedIds(new Set());
    setPendingLikeIds(new Set());
    setMatchedIds(new Set());
    setMatches([]);
    matchIdsRef.current = new Set();
    setUnreadByMatchId({});
    setNewMatch(null);
    setRoomCount(null);
    setActivePresenceId(null);
    setLeaveConfirmationOpen(false);
    setLeavePending(false);
    setRoomMenuOpen(false);
    setReportTarget(null);
    setBlockTarget(null);
    setMatchesExpanded(false);
    setExpandedId(null);
    setCurrentVisibleId(null);
    setEmailPromptOpen(false);
    setEmailPromptEligible(false);
    setArrivalCue(false);
    setFeedDrained(false);
    setEmptyRoomHeld(false);
    if (arrivalCueTimerRef.current) clearTimeout(arrivalCueTimerRef.current);
    if (feedDrainedTimerRef.current) clearTimeout(feedDrainedTimerRef.current);
  }, [setRoomCount]);

  const stopRoom = useCallback((next: "left" | "paused" | "ended" | "cancelled") => {
    session.current.stop();
    // A pause still watches the night, but none of the old live work survives.
    if (next === "paused") session.current.restart();
    clearRoom();
    setErrorMsg("");
    setStatus(next);
  }, [clearRoom, setStatus]);

  const restartEntry = useCallback(() => {
    session.current.stop();
    clearRoom();
    setStatus("loading");
    setBootNonce((nonce) => nonce + 1);
  }, [clearRoom, setStatus]);

  function dismissRoomHint() {
    window.localStorage.setItem(ROOM_HINT_DISMISS_KEY, "1");
    window.localStorage.removeItem(LEGACY_ROOM_HINT_DISMISS_KEY);
    setShowRoomHint(false);
  }

  const loadProfileById = useCallback(async (id: string, signal = session.current.signal) => {
    const { data } = await supabase
      .from("profiles")
      .select(PUBLIC_COLUMNS)
      .eq("id", id)
      .abortSignal(signal)
      .maybeSingle();
    return data as PublicProfile | null;
  }, []);

  // Who is checked in here right now and mutually compatible with me. Scoped to
  // active presence (left_at IS NULL) — this is the live room, not the user table.
  // Ordered by check-in time (oldest first) so the feed is stable across
  // refetches: arrivals append at the bottom, nobody reshuffles mid-scroll.
  const loadCandidates = useCallback(
    async (
      venueId: string,
      myId: string,
      signal = session.current.signal
    ) => {
      const { data } = await supabase
        .from("presence")
        .select(`checked_in_at, profiles!inner(${PUBLIC_COLUMNS})`)
        .eq("venue_id", venueId)
        .is("left_at", null)
        .neq("profile_id", myId)
        // A stable, unique tiebreaker so the order is deterministic across
        // reloads: checked_in_at alone is not unique (seed profiles share one
        // timestamp; real check-ins can collide too), and any reshuffle of the
        // ties makes the scroll-anchoring effect yank the feed under the thumb.
        .order("checked_in_at", { ascending: true })
        .order("profile_id", { ascending: true })
        .abortSignal(signal);
      if (signal.aborted) return [];
      const now = Date.now();
      const profiles = (data ?? []).map((row) => ({
        ...(row.profiles as unknown as PublicProfile),
        checkedInAt: row.checked_in_at,
        justArrived: now - Date.parse(row.checked_in_at) < JUST_ARRIVED_MS,
      }));
      return profiles;
    },
    []
  );

  // Aggregate eligible attendance comes from the participant-safe projection,
  // never from other participants' presence rows. Invisible participants count
  // because visibility controls discovery, not whether someone is at the bar.
  const loadRoomCount = useCallback(async (venueId: string, signal = session.current.signal) => {
    const { data } = await supabase
      .from("venue_night_public_state")
      .select("participant_count")
      .eq("venue_id", venueId)
      .eq("venue_night_id", venueNightRef.current?.venue_night_id ?? "")
      .abortSignal(signal)
      .maybeSingle();
    return data?.participant_count ?? null;
  }, []);

  // Active matches for this venue night plus their unread counts. Shared by
  // the bootstrap and every resync (foreground return, realtime re-subscribe).
  const loadMatches = useCallback(
    async (venueId: string, myId: string, signal = session.current.signal) => {
      const { data: matchRows } = await supabase
        .from("matches")
        .select("id, profile_a, profile_b, expires_at, created_at")
        .eq("venue_id", venueId)
        .gt("expires_at", new Date().toISOString())
        .abortSignal(signal);
      if (signal.aborted) return { matches: [], unread: {} };
      const activeMatches = (
        await Promise.all(
          ((matchRows ?? []) as MatchRow[]).map(async (m): Promise<ActiveMatch | null> => {
            const otherId = m.profile_a === myId ? m.profile_b : m.profile_a;
            const other = await loadProfileById(otherId, signal);
            return other
              ? {
                  id: m.id,
                  other,
                  createdAt: m.created_at,
                  latestMessageAt: null,
                }
              : null;
          })
        )
      ).filter((m): m is ActiveMatch => m !== null);
      if (signal.aborted) return { matches: [], unread: {} };
      const matchIds = activeMatches.map((match) => match.id);
      const { data: messageRows } =
        matchIds.length > 0
          ? await supabase
              .from("messages")
              .select("match_id, sender_id, created_at")
              .in("match_id", matchIds).abortSignal(signal)
          : { data: [] };
      const messages = (messageRows ?? []) as RoomMessage[];
      const latestMessageByMatchId = messages.reduce<Record<string, string>>(
        (latest, message) => {
          if (
            !latest[message.match_id] ||
            Date.parse(message.created_at) > Date.parse(latest[message.match_id])
          ) {
            latest[message.match_id] = message.created_at;
          }
          return latest;
        },
        {},
      );
      return {
        matches: activeMatches.map((match) => ({
          ...match,
          latestMessageAt: latestMessageByMatchId[match.id] ?? null,
        })),
        unread: countUnreadMessages(
          messages,
          myId
        ),
      };
    },
    [loadProfileById]
  );

  const registerMatch = useCallback((match: ActiveMatch, reveal: boolean) => {
    setMatchedIds((prev) => {
      if (prev.has(match.other.id)) return prev;
      const next = new Set(prev);
      next.add(match.other.id);
      return next;
    });
    setMatches((prev) =>
      prev.some((existing) => existing.id === match.id) ? prev : [...prev, match]
    );
    if (reveal) setNewMatch((current) => current ?? match);
  }, []);

  // Full resync of the live room. Realtime drips changes while the tab is up,
  // but after a background stint or a websocket drop we don't replay missed
  // events — we just re-photograph the room. A match that landed while we were
  // away still gets its reveal.
  const resyncRoom = useCallback(async () => {
    const signal = session.current.signal;
    if (signal.aborted) return;
    const myProfile = meRef.current;
    if (!venue || !myProfile) return;
    if (statusRef.current !== "ready" && statusRef.current !== "invisible") {
      return;
    }
    const generation = photoGeneration();
    const [nextCandidates, count, matchState, likesState] = await Promise.all([
      statusRef.current === "ready"
        ? loadCandidates(
            venue.id,
            myProfile.id
          )
        : Promise.resolve<Candidate[]>([]),
      loadRoomCount(venue.id),
      loadMatches(venue.id, myProfile.id),
      supabase.from("likes").select("liked_id").eq("venue_id", venue.id).eq("liker_id", myProfile.id).abortSignal(signal),
    ]);
    if (signal.aborted || generation !== photoGeneration()) return;
    if (statusRef.current === "ready") setCandidates(nextCandidates);
    setRoomCount(count);
    if (!likesState.error) setLikedIds(new Set(likesState.data.map(row => row.liked_id)));
    const newlyMatched = matchState.matches.filter(
      (match) => !matchIdsRef.current.has(match.id)
    );
    setMatches(matchState.matches);
    setMatchedIds(new Set(matchState.matches.map((m) => m.other.id)));
    setUnreadByMatchId(matchState.unread);
    if (newlyMatched.length > 0) {
      setNewMatch((current) => current ?? newlyMatched[0]);
    }
  }, [venue, loadCandidates, loadRoomCount, loadMatches, setRoomCount]);

  useEffect(() => {
    if (!resources.social) return;
    const refresh = () => { void resyncRoom(); };
    window.addEventListener(PHOTO_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(PHOTO_REFRESH_EVENT, refresh);
  }, [resyncRoom, resources.social]);

  // Bootstrap: session, profile, venue, check-in, then the live room state.
  useEffect(() => {
    const entrySession = session.current;
    const signal = entrySession.restart();
    (async () => {
      // Arrival vs re-entry: the doorway plays in full (and is held for a
      // readable minimum) only the first time this session; a re-entry stays a
      // quiet ambient beat.
      const isArrival = !hasEnteredThisSession(venueSlug);
      setShowDoorway(isArrival);
      // The readable minimum runs from the instant the threshold actually
      // paints, not from mount: it now waits on the entry prerequisites, so a
      // slow bootstrap would otherwise burn the whole floor before showing
      // anything and turn the ceremony back into a flash.
      let doorwayShownAt: number | null = null;
      const openDoorway = () => {
        doorwayShownAt = Date.now();
        setEntryEligible(true);
      };
      setStatus("loading");
      clearRoom();
      try {
        if (!isVenueSlug(venueSlug)) {
          setStatus("notfound");
          return;
        }
        const user = await ensureAnonSession();
        if (signal.aborted) return;

        // Re-entry resolves the current venue, profile and access from scratch.
        // Slug changes additionally remount this keyed session.
        setStatus("loading");
        setErrorMsg("");
        setVenue(null);
        setVenueNight(null);
        setMe(null);
        setJustLeftVenue(false);
        setEntryEligible(false);

        // The optional email prompt is global to the profile, but its timer
        // and dismissal state are specific to the current venue night.
        if (emailPromptVenueSlugRef.current !== venueSlug) {
          emailPromptVenueSlugRef.current = venueSlug;
          setEmailPromptVenueSlug(venueSlug);
          emailPromptElapsedRef.current = 0;
          setEmailPromptEligible(false);
          setEmailPromptOpen(false);
          setEmail("");
          setEmailConsent(false);
          setEmailPromptState("idle");
          setEmailPromptError("");
        }

        const { data: venueRow, error: venueError } = await supabase
          .from("venues")
          .select("id, name, city, timezone")
          .eq("slug", venueSlug)
          .abortSignal(signal).maybeSingle();
        if (venueError) throw venueError;
        if (signal.aborted) return;
        if (!venueRow) {
          setStatus("notfound");
          return;
        }
        const { error: scanError } = await supabase.rpc("record_venue_scan", {
          p_venue_id: venueRow.id,
        }).abortSignal(signal);
        if (scanError) {
          console.warn("Could not record venue scan", scanError);
        }
        if (signal.aborted) return;

        setVenue(venueRow);

        // Resolve the participant lifecycle before asking anyone to create a
        // profile. A closed venue is a dead end; waiting/live are the only
        // states that should continue into onboarding and check-in.
        const { data: nightRows, error: nightStateError } = await supabase.rpc(
          "venue_night_state",
          { p_venue_id: venueRow.id }
        ).abortSignal(signal);
        if (nightStateError) throw nightStateError;
        if (signal.aborted) return;
        const openNight = nightRows?.find(
          (night) => night.status === "waiting" || night.status === "live"
        );

        // sessionStorage binds a refreshed tab to the exact night it entered.
        // That lets the safe projection restore a manual pause, cancellation,
        // or scheduled end after presence has been closed and the entry RPC no
        // longer returns a terminal night. A newly open night always wins over
        // a remembered historical one.
        const rememberedNightId = window.sessionStorage.getItem(
          venueNightSessionKey(venueSlug)
        );
        let rememberedNight: VenueNightState | null = null;
        if (!openNight && rememberedNightId) {
          const { data, error } = await supabase
            .from("venue_night_public_state")
            .select(
              "venue_night_id, status, participant_count, launch_threshold, guaranteed_launch_at, closes_at, terminal_reason, updated_at"
            )
            .eq("venue_id", venueRow.id)
            .eq("venue_night_id", rememberedNightId)
            .abortSignal(signal).maybeSingle();
          if (error) throw error;
          rememberedNight = data;
        }
        if (signal.aborted) return;

        const initialNight: VenueNightState | null = openNight
          ? { ...openNight, terminal_reason: null, updated_at: "" }
          : rememberedNight;
        if (!initialNight) {
          setStatus("offHours");
          return;
        }
        venueNightRef.current = initialNight;
        setVenueNight(initialNight);
        setRoomCount(initialNight.participant_count);
        if (initialNight.terminal_reason === "cancelled") {
          setStatus("cancelled");
          return;
        }
        if (initialNight.terminal_reason === "scheduled_end") {
          setStatus("ended");
          return;
        }
        if (initialNight.status === "closed") {
          setStatus("paused");
          return;
        }

        const profilePath = `/profile?venue=${encodeURIComponent(venueSlug)}`;
        const myProfile = await loadProfileById(user.id);
        if (signal.aborted) return;
        if (!myProfile) {
          router.replace(profilePath);
          return;
        }

        const { data: privateProfile, error: privateError } = await supabase
          .from("profile_private")
          .select("adult_confirmed_at")
          .eq("id", user.id)
          .abortSignal(signal).maybeSingle();
        if (privateError) throw privateError;
        if (signal.aborted) return;
        if (!privateProfile?.adult_confirmed_at) {
          router.replace(profilePath);
          return;
        }

        // Marketing capture is optional. If its owner-scoped read is
        // unavailable, fail closed (show no email ask) and continue check-in;
        // room presence and lifecycle must never depend on this surface.
        try {
          const emailSubscription = await getEmailSubscription();
          if (signal.aborted) return;
          setEmail(emailSubscription?.email ?? "");
          const subscribed = emailSubscription?.status === "subscribed";
          const dismissedTonight =
            window.localStorage.getItem(
              emailPromptDismissKey(venueRow.timezone)
            ) === "1";
          const offeredInWaitingRoom =
            window.localStorage.getItem(
              emailWaitingRoomOfferedKey(venueRow.timezone)
            ) === "1";
          setEmailSubscribed(subscribed);
          setEmailPromptEligible(
            !subscribed && !dismissedTonight && !offeredInWaitingRoom
          );
          // Dismissal suppresses the later modal but only collapses this inline
          // action. While the guest is waiting, they can still change their mind.
          setWaitingRoomEmailVisible(!subscribed);
        } catch (emailSubscriptionError) {
          if (signal.aborted) return;
          console.error(emailSubscriptionError);
          setEmailPromptEligible(false);
          setWaitingRoomEmailVisible(false);
        }

        setMe(myProfile);

        // Resolve this exact venue-night from durable presence history before
        // check-in. Returning to an old URL after leaving must stay checked out
        // until the participant explicitly asks to join again.
        const { data: presenceRows, error: presenceHistoryError } = await supabase
          .from("presence")
          .select("id, left_at, is_visible")
          .eq("profile_id", user.id)
          .eq("venue_night_id", initialNight.venue_night_id)
          .order("checked_in_at", { ascending: false }).abortSignal(signal);
        if (presenceHistoryError) throw presenceHistoryError;
        if (signal.aborted) return;
        const reentryRequested = reentryRequestedRef.current;
        reentryRequestedRef.current = false;
        const entry = resolveEntryCycle(
          (presenceRows ?? []) as EntryPresence[],
          reentryRequested
        );
        if (entry.kind === "checked-out") {
          setStatus("left");
          return;
        }

        // Every prerequisite is now resolved and this participant really is
        // walking in: open the threshold so it covers check-in and the room
        // load instead of the profile lookup that may still bounce to
        // onboarding.
        openDoorway();

        let presenceRow: EntryPresence & { venue_night_id: string };
        if (entry.kind === "resume") {
          presenceRow = {
            ...entry.presence,
            venue_night_id: initialNight.venue_night_id,
          };
        } else {
          const { data, error: checkInError } = await supabase.rpc("check_in", {
            p_venue_id: venueRow.id,
          }).abortSignal(signal);
          if (checkInError) {
            if (checkInError.message?.includes("venue not open")) {
              if (!signal.aborted) setStatus("offHours");
              return;
            }
            throw checkInError;
          }
          if (!data) throw new Error("Check-in returned no presence");
          presenceRow = data;
        }
        if (signal.aborted) return;
        setActivePresenceId(presenceRow.id);
        const isVisible = presenceRow.is_visible;
        const venueNightId = presenceRow.venue_night_id;
        window.sessionStorage.setItem(
          venueNightSessionKey(venueSlug),
          venueNightId
        );

        // check_in may itself be the threshold-crossing transaction. Read the
        // projection after it commits so the fourth arrival never flashes the
        // waiting room after the night has already launched.
        const { data: projectedNight, error: projectedNightError } = await supabase
          .from("venue_night_public_state")
          .select(
            "venue_night_id, status, participant_count, launch_threshold, guaranteed_launch_at, closes_at, terminal_reason, updated_at"
          )
          .eq("venue_night_id", venueNightId)
          .abortSignal(signal).maybeSingle();
        if (projectedNightError) throw projectedNightError;
        if (signal.aborted) return;
        const currentNight: VenueNightState = projectedNight ?? {
          ...initialNight,
          terminal_reason: null,
        };
        venueNightRef.current = currentNight;
        setVenueNight(currentNight);
        setRoomCount(currentNight.participant_count);

        if (currentNight.terminal_reason === "cancelled") {
          setStatus("cancelled");
          return;
        }
        if (currentNight.terminal_reason === "scheduled_end") {
          setStatus("ended");
          return;
        }
        if (currentNight.status === "closed") {
          setStatus("paused");
          return;
        }
        if (currentNight.status === "waiting") {
          window.sessionStorage.setItem(enteredSessionKey(venueSlug), "1");
          setStatus("waiting");
          return;
        }

        const [candidatesData, roomCountData, { data: myLikes }, matchState] =
          await Promise.all([
            isVisible
              ? loadCandidates(
                  venueRow.id,
                  user.id
                )
              : Promise.resolve([]),
            Promise.resolve(currentNight.participant_count),
            supabase
              .from("likes")
              .select("liked_id")
              .eq("venue_id", venueRow.id)
              .gt("expires_at", new Date().toISOString()).abortSignal(signal),
            loadMatches(venueRow.id, user.id),
          ]);
        if (signal.aborted) return;

        setCandidates(candidatesData);
        setRoomCount(roomCountData);
        setLikedIds(new Set((myLikes ?? []).map((l) => l.liked_id)));
        setMatches(matchState.matches);
        setUnreadByMatchId(matchState.unread);
        setMatchedIds(new Set(matchState.matches.map((m) => m.other.id)));

        // Hold the arrival doorway for its readable minimum even if the room
        // loaded faster, so it reads as a deliberate threshold, never a flash.
        // Re-entries fall through instantly.
        if (isArrival && doorwayShownAt !== null) {
          const remaining = ARRIVAL_MIN_MS - (Date.now() - doorwayShownAt);
          if (remaining > 0) {
            await new Promise<void>((resolve) => {
              const finish = () => {
                clearTimeout(timer);
                signal.removeEventListener("abort", finish);
                resolve();
              };
              const timer = setTimeout(finish, remaining);
              signal.addEventListener("abort", finish, { once: true });
            });
          }
          if (signal.aborted) return;
        }
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(enteredSessionKey(venueSlug), "1");
        }
        setStatus(isVisible ? "ready" : "invisible");
      } catch (e) {
        if (signal.aborted) return;
        console.error(e);
        setStatus("error");
        setErrorMsg(t[preferredLocale(browserLocale())].room.loadError);
      }
    })();
    return () => {
      // Abort only this bootstrap, never a newer entry.
      if (entrySession.signal === signal) entrySession.stop();
    };
  }, [venueSlug, router, loadProfileById, loadCandidates, loadRoomCount, loadMatches, bootNonce, setRoomCount, setStatus, clearRoom]);

  // The heartbeat only updates this entry; it never creates a presence.
  useEffect(() => {
    if (!activePresenceId || !resources.heartbeat) return;
    const scope = venueEffect(session.current.signal);
    const beat = async () => {
      if (scope.signal.aborted || document.visibilityState !== "visible") return;
      await supabase.from("presence")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", activePresenceId).is("left_at", null).abortSignal(scope.signal);
    };
    const id = window.setInterval(() => { void beat(); }, HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState !== "visible" || scope.signal.aborted) return;
      void beat();
      void resyncRoom();
    };
    document.addEventListener("visibilitychange", onVisible);
    scope.signal.addEventListener("abort", () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    }, { once: true });
    return scope.stop;
  }, [activePresenceId, resources.heartbeat, resyncRoom]);

  // Public revisions invalidate the exact owner presence as well as discovery.
  // One queue serializes polling, Realtime and foreground/reconnect repair.
  useEffect(() => {
    if (!venue || !resources.lifecycle || session.current.signal.aborted) return;
    const scope = venueEffect(session.current.signal);
    const signal = scope.signal;
    let verifiedRevision: string | null = null;
    let retryPresence = false;
    const readNight = async (nightId: string) => {
      const { data, error } = await supabase.from("venue_night_public_state")
        .select("venue_night_id, status, participant_count, launch_threshold, guaranteed_launch_at, closes_at, terminal_reason, updated_at")
        .eq("venue_id", venue.id).eq("venue_night_id", nightId)
        .abortSignal(signal).maybeSingle();
      if (error) throw error;
      return data;
    };
    const applyClosure = (night: VenueNightState) => {
      if (night.terminal_reason === "cancelled") { stopRoom("cancelled"); return true; }
      if (night.terminal_reason === "scheduled_end") { stopRoom("ended"); return true; }
      if (night.status === "closed") {
        if (statusRef.current !== "paused") stopRoom("paused");
        return true;
      }
      return false;
    };
    const loadState = coalesceVenueChecks(signal, async (force) => {
      retryPresence ||= force;
      const knownNightId = venueNightRef.current?.venue_night_id;
      if (!knownNightId) {
        if (statusRef.current !== "offHours") return;
        const { data } = await supabase.rpc("venue_night_state", { p_venue_id: venue.id }).abortSignal(signal);
        if (!signal.aborted && data?.some(night => night.status !== "closed")) restartEntry();
        return;
      }
      const nextNight = await readNight(knownNightId);
      if (signal.aborted || !nextNight) return;
      if (applyClosure(nextNight)) return;

      if (activePresenceId && me && (force || retryPresence || verifiedRevision !== nextNight.updated_at)) {
        // A failed forced check also retries on the existing poll, even when
        // the public revision itself has not changed.
        retryPresence = true;
        const { data: presence, error } = await supabase.from("presence")
          .select("id, left_at").eq("id", activePresenceId).eq("profile_id", me.id)
          .abortSignal(signal).maybeSingle();
        if (signal.aborted) return;
        if (error) throw error;
        if (presenceHasEnded(presence, activePresenceId)) {
          // Night closure may have committed between the two reads. Prefer its
          // pause/end/cancellation screen; failed reads retry, never guess.
          const latestNight = await readNight(knownNightId);
          if (signal.aborted || !latestNight) return;
          if (!applyClosure(latestNight)) stopRoom("left");
          return;
        }
        verifiedRevision = nextNight.updated_at;
        retryPresence = false;
      }
      if (signal.aborted) return;
      const revisionChanged = venueNightRef.current?.updated_at !== nextNight.updated_at;
      venueNightRef.current = nextNight;
      setVenueNight(nextNight);
      setRoomCount(nextNight.participant_count);
      if (statusRef.current === "paused" || statusRef.current === "offHours" ||
          (nextNight.status === "live" && statusRef.current === "waiting")) {
        if (statusRef.current === "paused") reentryRequestedRef.current = true;
        restartEntry();
        return;
      }
      if (revisionChanged) { invalidatePhotos(); void resyncRoom(); }
    }, (error) => console.warn("Could not verify venue presence", error));

    const channel = supabase.channel(`venue-night-${venue.id}-${crypto.randomUUID()}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "venue_night_public_state",
        filter: `venue_id=eq.${venue.id}`,
      }, () => { void loadState(); })
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus === "SUBSCRIBED") void loadState(true);
      });
    // Do not depend on a successful WebSocket connection for the first check.
    void loadState(true);
    const poll = window.setInterval(() => { void loadState(); }, VENUE_NIGHT_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void loadState(true);
    };
    const onResume = () => { void loadState(true); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onResume);
    window.addEventListener("online", onResume);
    signal.addEventListener("abort", () => {
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onResume);
      window.removeEventListener("online", onResume);
      removeVenueChannel(channel);
    }, { once: true });
    return scope.stop;
  }, [venue, me, activePresenceId, resources.lifecycle, status, resyncRoom, setRoomCount, stopRoom, restartEntry]);

  // Realtime: the room fills and empties as people check in / leave. Pure
  // heartbeats (only last_seen_at moved) are skipped — presence has REPLICA
  // IDENTITY FULL so the old row tells us whether anything visible changed;
  // otherwise 30 phones beating every 2 minutes means a full room reload every
  // few seconds on every client. A short trailing throttle coalesces arrival
  // bursts, and a re-subscribe after a socket drop triggers a full resync.
  useEffect(() => {
    if (!venue || !me || !resources.feed || session.current.signal.aborted) return;
    const scope = venueEffect(session.current.signal);
    const signal = scope.signal;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastRefetch = 0;
    const refetch = async () => {
      if (signal.aborted) return;
      lastRefetch = Date.now();
      const generation = photoGeneration();
      const [next, count] = await Promise.all([
        loadCandidates(venue.id, me.id, signal),
        loadRoomCount(venue.id, signal),
      ]);
      if (signal.aborted || generation !== photoGeneration()) return;
      setCandidates(next);
      setRoomCount(count);
    };
    const scheduleRefetch = () => {
      if (signal.aborted || timer) return;
      const wait = Math.max(
        0,
        lastRefetch + PRESENCE_REFETCH_THROTTLE_MS - Date.now()
      );
      timer = setTimeout(() => {
        timer = null;
        refetch();
      }, wait);
    };
    let wasSubscribed = false;
    const channel = supabase
      .channel(`presence-${venue.id}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "presence",
          filter: `venue_id=eq.${venue.id}`,
        },
        (payload) => {
          if (signal.aborted) return;
          if (payload.eventType === "UPDATE") {
            const before = payload.old as Partial<PresenceChange>;
            const after = payload.new as PresenceChange;
            // Pure heartbeat: nothing the room can see changed. (Before the
            // replica-identity migration lands, `old` only carries the PK, the
            // comparison fails open and we refetch — the safe fallback.)
            if (
              "left_at" in before &&
              before.left_at === after.left_at &&
              before.is_visible === after.is_visible
            ) {
              return;
            }
          }
          scheduleRefetch();
        }
      )
      .subscribe((subscribeState) => {
        if (signal.aborted || subscribeState !== "SUBSCRIBED") return;
        if (wasSubscribed) resyncRoom();
        wasSubscribed = true;
      });
    signal.addEventListener("abort", () => {
      if (timer) clearTimeout(timer);
      removeVenueChannel(channel);
    }, { once: true });
    return scope.stop;
  }, [venue, me, resources.feed, loadCandidates, loadRoomCount, resyncRoom, setRoomCount]);

  // Realtime: a match unlocks the moment a reciprocal like lands (for either side).
  useEffect(() => {
    if (!venue || !resources.social || session.current.signal.aborted) return;
    const scope = venueEffect(session.current.signal);
    const signal = scope.signal;
    let wasSubscribed = false;
    const channel = supabase
      .channel(`matches-${venue.id}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "matches",
          filter: `venue_id=eq.${venue.id}`,
        },
        async (payload) => {
          if (signal.aborted) return;
          const m = payload.new as MatchRow;
          const myId = meRef.current?.id;
          if (!myId || (m.profile_a !== myId && m.profile_b !== myId)) return;
          if (Date.parse(m.expires_at) <= Date.now()) return;
          const otherId = m.profile_a === myId ? m.profile_b : m.profile_a;
          const other = await loadProfileById(otherId, signal);
          if (signal.aborted) return;
          if (other) {
            registerMatch(
              {
                id: m.id,
                other,
                createdAt: m.created_at,
                latestMessageAt: null,
              },
              true,
            );
          }
        }
      )
      .subscribe((subscribeState) => {
        if (signal.aborted || subscribeState !== "SUBSCRIBED") return;
        if (wasSubscribed) resyncRoom();
        wasSubscribed = true;
      });

    signal.addEventListener("abort", () => removeVenueChannel(channel), { once: true });
    return scope.stop;
  }, [venue, resources.social, loadProfileById, registerMatch, resyncRoom]);

  // Realtime: show a small unread badge when a new message lands in one of my
  // active conversations. This reduces uncertainty without adding read receipts.
  useEffect(() => {
    if (!me || matches.length === 0 || !resources.social || session.current.signal.aborted) {
      return;
    }

    const scope = venueEffect(session.current.signal);
    const signal = scope.signal;
    let wasSubscribed = false;
    const channel = supabase
      .channel(`room-messages-${me.id}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          if (signal.aborted) return;
          const message = payload.new as RoomMessage;
          if (!matchIdsRef.current.has(message.match_id)) return;
          setMatches((current) =>
            current.map((match) =>
              match.id === message.match_id &&
              (!match.latestMessageAt ||
                Date.parse(message.created_at) > Date.parse(match.latestMessageAt))
                ? { ...match, latestMessageAt: message.created_at }
                : match,
            ),
          );
          if (message.sender_id === me.id) return;
          if (
            Date.parse(message.created_at) <=
            Date.parse(getReadMarker(message.match_id))
          ) {
            return;
          }

          setUnreadByMatchId((prev) => ({
            ...prev,
            [message.match_id]: (prev[message.match_id] ?? 0) + 1,
          }));
        }
      )
      .subscribe((subscribeState) => {
        if (signal.aborted || subscribeState !== "SUBSCRIBED") return;
        if (wasSubscribed) resyncRoom();
        wasSubscribed = true;
      });

    signal.addEventListener("abort", () => removeVenueChannel(channel), { once: true });
    return scope.stop;
  }, [matches.length, me, resources.social, resyncRoom]);

  // Re-derive "just arrived" once a minute so tags expire even in a quiet room
  // (the clock is only read in callbacks — render stays pure).
  useEffect(() => {
    if (status !== "ready") return;
    const scope = venueEffect(session.current.signal);
    const id = setInterval(() => {
      if (scope.signal.aborted) return;
      const now = Date.now();
      setCandidates((prev) => {
        let changed = false;
        const next = prev.map((candidate) => {
          const fresh =
            now - Date.parse(candidate.checkedInAt) < JUST_ARRIVED_MS;
          if (fresh === candidate.justArrived) return candidate;
          changed = true;
          return { ...candidate, justArrived: fresh };
        });
        return changed ? next : prev;
      });
    }, 60_000);
    scope.signal.addEventListener("abort", () => clearInterval(id), { once: true });
    return scope.stop;
  }, [status]);

  // Scroll anchoring: when the list changes (someone above the thumb leaves,
  // someone new appends below), keep the profile currently in view exactly in
  // place — the feed must never move under the thumb — and cue fresh arrivals
  // instead of letting anything shift.
  const visibleFeedKey = candidates
    .filter((c) => !matchedIds.has(c.id))
    .map((c) => c.id)
    .join("|");
  useLayoutEffect(() => {
    const ids = visibleFeedKey ? visibleFeedKey.split("|") : [];
    const prevIds = feedIdsRef.current;
    feedIdsRef.current = ids;
    const el = feedRef.current;
    if (!el || el.clientHeight === 0) return;
    const anchorId = anchorIdRef.current;
    if (anchorId) {
      const idx = ids.indexOf(anchorId);
      if (idx >= 0) {
        const top = idx * el.clientHeight;
        if (Math.abs(el.scrollTop - top) > 2) el.scrollTop = top;
      }
    }
    const transition = feedTransition(prevIds, ids);
    if (transition === "arrival") {
      setArrivalCue(true);
      if (arrivalCueTimerRef.current) clearTimeout(arrivalCueTimerRef.current);
      arrivalCueTimerRef.current = setTimeout(() => setArrivalCue(false), 5_000);
    }
    // The other direction (#118): the feed drained under the thumb, because the
    // last profile left, blocked us, or turned into a match. The empty room
    // takes over, and it says so rather than appearing out of nowhere.
    if (transition === "drained") {
      setFeedDrained(true);
      if (feedDrainedTimerRef.current) clearTimeout(feedDrainedTimerRef.current);
      feedDrainedTimerRef.current = setTimeout(
        () => setFeedDrained(false),
        6_000
      );
    }
  }, [visibleFeedKey]);

  // Remember which profile is under the thumb; the anchoring effect restores it.
  function handleFeedScroll() {
    const el = feedRef.current;
    if (!el || el.clientHeight === 0) return;
    const index = Math.round(el.scrollTop / el.clientHeight);
    anchorIdRef.current = feedIdsRef.current[index] ?? null;
    setCurrentVisibleId(anchorIdRef.current);
  }

  function jumpToNewestArrival() {
    const el = feedRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setArrivalCue(false);
  }

  async function toggleLike(candidate: PublicProfile) {
    const signal = session.current.signal;
    if (signal.aborted) return;
    if (!photoState.state || photoState.state.correction_required) return;
    if (!me || !venue || pendingLikeIds.has(candidate.id)) return;

    const wasLiked = likedIds.has(candidate.id);
    setPendingLikeIds((prev) => new Set(prev).add(candidate.id));
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (wasLiked) next.delete(candidate.id);
      else next.add(candidate.id);
      return next;
    });

    const { error } = wasLiked
      ? await supabase
          .from("likes")
          .delete()
          .eq("liker_id", me.id)
          .eq("liked_id", candidate.id)
          .eq("venue_id", venue.id)
          .gt("expires_at", new Date().toISOString()).abortSignal(signal)
      : await supabase.from("likes").insert({
          liker_id: me.id,
          liked_id: candidate.id,
          venue_id: venue.id,
        }).abortSignal(signal);

    if (signal.aborted) return;
    setPendingLikeIds((prev) => {
      const next = new Set(prev);
      next.delete(candidate.id);
      return next;
    });

    if (error) {
      console.error(error);
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.add(candidate.id);
        else next.delete(candidate.id);
        return next;
      });

      // The profile may have left between being rendered and this tap. In that
      // race the like is correctly rejected by the database; refresh discovery
      // and silently remove the stale card instead of blaming the participant.
      if (!wasLiked) {
        const nextCandidates = await loadCandidates(
          venue.id,
          me.id
        );
        if (signal.aborted) return;
        setCandidates(nextCandidates);
        if (!nextCandidates.some((profile) => profile.id === candidate.id)) {
          setErrorMsg("");
          return;
        }
      }
      setErrorMsg(wasLiked ? s.unlikeError : s.likeError);
      return;
    }

    setErrorMsg("");
    if (wasLiked) return;

    // If they had already liked me, the trigger just created the match. Realtime
    // will deliver it, but check directly too so the reveal feels instant.
    const { data: match } = await supabase
      .from("matches")
      .select("id, profile_a, profile_b, expires_at, created_at")
      .eq("venue_id", venue.id)
      .or(`profile_a.eq.${candidate.id},profile_b.eq.${candidate.id}`)
      .gt("expires_at", new Date().toISOString())
      .abortSignal(signal).maybeSingle();
    if (signal.aborted) return;
    if (match) {
      registerMatch(
        {
          id: match.id,
          other: candidate,
          createdAt: match.created_at,
          latestMessageAt: null,
        },
        true,
      );
    }
  }

  async function blockProfile(
    profile: PublicProfile,
    reason: ReportReason,
    note: string
  ) {
    const signal = session.current.signal;
    if (signal.aborted) return;
    if (!me) return;
    if (!isValidText(note, SAFETY_NOTE_MAX_LENGTH, false)) {
      setErrorMsg(s.noteTooLong);
      return;
    }
    const { error } = await supabase.from("blocks").insert({
      blocker_id: me.id,
      blocked_id: profile.id,
      venue_id: venue?.id ?? null,
      reason,
      note: note.trim() || null,
    }).abortSignal(signal);
    if (signal.aborted) return;
    if (error && error.code !== "23505") {
      console.error(error);
      setErrorMsg(s.blockError);
      return;
    }

    setCandidates((prev) => prev.filter((candidate) => candidate.id !== profile.id));
    setLikedIds((prev) => {
      const next = new Set(prev);
      next.delete(profile.id);
      return next;
    });
    setMatchedIds((prev) => {
      const next = new Set(prev);
      next.delete(profile.id);
      return next;
    });
    setMatches((prev) => prev.filter((match) => match.other.id !== profile.id));
    setNewMatch((current) => (current?.other.id === profile.id ? null : current));
    if (reportTarget?.id === profile.id) setReportTarget(null);
    if (blockTarget?.id === profile.id) setBlockTarget(null);
    setReportSubmitted(false);
    setErrorMsg("");
  }

  function openBlock(profile: PublicProfile) {
    setBlockTarget(profile);
    setBlockReason("unsafe_behavior");
    setBlockNote("");
    setBlockReasonOpen(false);
    setErrorMsg("");
  }

  // The modal is itself the confirmation step now (no native window.confirm),
  // and the reason is optional — a default already sits in blockReason.
  async function submitBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!blockTarget) return;
    await blockProfile(blockTarget, blockReason, blockNote);
  }

  function openReport(profile: PublicProfile) {
    setReportTarget(profile);
    setReportReason("harassment");
    setReportNote("");
    setReportNoteError("");
    setReportSubmitted(false);
    setErrorMsg("");
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    const signal = session.current.signal;
    if (signal.aborted) return;
    event.preventDefault();
    if (!me || !reportTarget) return;

    if (!isValidText(reportNote, SAFETY_NOTE_MAX_LENGTH, false)) {
      setReportNoteError(s.noteTooLong);
      return;
    }
    const trimmedNote = reportNote.trim();
    if (reportReason === "other" && !trimmedNote) {
      setReportNoteError(s.reportNoteRequiredError);
      reportNoteRef.current?.focus();
      return;
    }

    const venueNightId = venueNightRef.current?.venue_night_id;
    if (!venueNightId) {
      setErrorMsg(s.reportError);
      return;
    }

    const { error } = await supabase.rpc("submit_report", {
      p_reported_id: reportTarget.id,
      p_venue_night_id: venueNightId,
      p_reason: reportReason,
      p_note: trimmedNote || null,
    }).abortSignal(signal);
    if (signal.aborted) return;
    if (error) {
      console.error(error);
      if (error.message.includes("note is required for other reports")) {
        setReportNoteError(s.reportNoteRequiredError);
        reportNoteRef.current?.focus();
        return;
      }
      setErrorMsg(
        error.message.includes("only report users")
          ? s.reportEligibilityError
          : s.reportError
      );
      return;
    }

    setReportSubmitted(true);
    setErrorMsg("");
  }

  async function goInvisible() {
    const signal = session.current.signal;
    if (signal.aborted) return;
    if (!me) return;
    const { error } = await supabase
      .from("presence")
      .update({ is_visible: false })
      .eq("profile_id", me.id)
      .eq("id", activePresenceId ?? "")
      .is("left_at", null).abortSignal(signal);
    if (signal.aborted) return;
    if (error) {
      console.error(error);
      setErrorMsg(s.visibilityError);
      return;
    }
    setCandidates([]);
    setStatus("invisible");
    setErrorMsg("");
  }

  async function becomeVisible() {
    const signal = session.current.signal;
    if (signal.aborted) return;
    if (!me || !venue) return;
    const { error } = await supabase
      .from("presence")
      .update({ is_visible: true })
      .eq("profile_id", me.id)
      .eq("venue_id", venue.id)
      .eq("id", activePresenceId ?? "")
      .is("left_at", null).abortSignal(signal);
    if (signal.aborted) return;
    if (error) {
      console.error(error);
      setErrorMsg(s.visibilityError);
      return;
    }
    const [nextCandidates, count] = await Promise.all([
      loadCandidates(venue.id, me.id),
      loadRoomCount(venue.id),
    ]);
    if (signal.aborted) return;
    setCandidates(nextCandidates);
    setRoomCount(count);
    setStatus("ready");
    setErrorMsg("");
  }

  // Explicit control over your own presence (women-first): leave the room and
  // disappear from it immediately, without waiting for the nightly rollover.
  function requestLeave() {
    setRoomMenuOpen(false);
    setErrorMsg("");
    setLeaveConfirmationOpen(true);
  }

  async function leave() {
    const signal = session.current.signal;
    if (!me || !activePresenceId || leavePending || signal.aborted) return;
    setLeavePending(true);
    try {
      const { data, error } = await supabase.from("presence")
        .update({ left_at: new Date().toISOString() })
        .eq("id", activePresenceId).eq("profile_id", me.id).is("left_at", null)
        .select("id, left_at").abortSignal(signal).maybeSingle();
      if (signal.aborted) return;
      if (error) throw error;
      if (!data) {
        const { data: current, error: readError } = await supabase.from("presence")
          .select("id, left_at").eq("id", activePresenceId).eq("profile_id", me.id)
          .abortSignal(signal).maybeSingle();
        if (signal.aborted) return;
        if (readError) throw readError;
        if (!presenceHasEnded(current, activePresenceId)) throw new Error("Presence is still active");
      } else if (!presenceHasEnded(data, activePresenceId)) {
        throw new Error("Departure was not confirmed");
      }
      setJustLeftVenue(true);
      stopRoom("left");
    } catch (error) {
      if (signal.aborted) return;
      console.warn("Could not confirm departure", error);
      setErrorMsg(s.leaveError);
      setLeavePending(false);
    }
  }

  async function rejoin() {
    if (!venue || !me) return;
    // The bootstrap resolves whether this night is waiting or live and performs
    // the idempotent check-in. Reusing it prevents a waiting participant from
    // touching any live-room query during re-entry.
    reentryRequestedRef.current = true;
    setShowDoorway(false);
    restartEntry();
  }

  function dismissEmailPrompt() {
    if (venue) {
      window.localStorage.setItem(
        emailPromptDismissKey(venue.timezone),
        "1"
      );
    }
    setEmailPromptEligible(false);
    setEmailPromptOpen(false);
    setEmailPromptError("");
  }

  // Showing the inline email card (waiting room or empty live room) is the ask
  // for tonight: the popup must not come back and repeat it later.
  const markEmailOffered = useCallback(() => {
    if (!venue) return;
    window.localStorage.setItem(emailWaitingRoomOfferedKey(venue.timezone), "1");
    setEmailPromptEligible(false);
    setEmailPromptOpen(false);
  }, [venue]);

  const dismissEmailAction = useCallback(() => {
    if (!venue) return;
    window.localStorage.setItem(emailPromptDismissKey(venue.timezone), "1");
    setEmailPromptEligible(false);
  }, [venue]);

  const finishEmailAction = useCallback((subscribedEmail: string) => {
    setEmail(subscribedEmail);
    setEmailSubscribed(true);
    setEmailPromptEligible(false);
  }, []);

  async function submitEmailPrompt(event: FormEvent<HTMLFormElement>) {
    const signal = session.current.signal;
    if (signal.aborted) return;
    event.preventDefault();
    if (!me || !emailConsent || emailPromptState === "saving") return;

    setEmailPromptState("saving");
    setEmailPromptError("");
    try {
      const result = await subscribeEmail(email, locale, "room_popup");
      if (signal.aborted) return;
      setEmail(result.email);
    } catch (error) {
      if (signal.aborted) return;
      console.error(error);
      setEmailPromptState("idle");
      setEmailPromptError(s.emailPromptError);
      return;
    }

    setEmailPromptEligible(false);
    setEmailPromptState("success");
  }

  const leaveConfirmation = leaveConfirmationOpen && venue && (
    <Modal
      onClose={() => setLeaveConfirmationOpen(false)}
      dismissable={!leavePending}
      closeLabel={s.leaveStay}
      labelledById="leave-venue-title"
      overlayClassName="z-[70]"
    >
      <p className="night-kicker">{venue.name}</p>
      <h2
        id="leave-venue-title"
        className="font-display mt-3 pr-10 text-3xl font-medium text-cream"
      >
        {s.leaveConfirmTitle}
      </h2>
      <p className="night-muted mt-4 text-sm leading-relaxed">
        {s.leaveConfirmBody}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-blush">
        {s.leavePreserved}
      </p>
      {errorMsg && <p className="mt-4 text-sm text-blush" role="alert">{errorMsg}</p>}
      <div className="mt-6 grid gap-3">
        <button
          type="button"
          onClick={() => setLeaveConfirmationOpen(false)}
          disabled={leavePending}
          className="night-button night-button-primary px-5 py-4 disabled:opacity-60"
        >
          {s.leaveStay}
        </button>
        <button
          type="button"
          onClick={leave}
          disabled={leavePending}
          className="night-button night-button-secondary px-5 py-4 disabled:opacity-60"
        >
          {leavePending ? s.leaving : s.leave}
        </button>
      </div>
    </Modal>
  );

  if (status === "loading") {
    // Anything short of a confirmed entry stays the ambient night, never
    // room-entry copy: a re-entry (bouncing back from the profile editor, a
    // re-boot), a bootstrap whose prerequisites are still unresolved — a
    // first-ever scanner about to be sent to onboarding lives here (#135) —
    // and a night the authoritative state has not confirmed `live`.
    if (!showDoorway || !entryEligible || !venue || venueNight?.status !== "live") {
      return (
        <main
          className="night-shell flex min-h-[100dvh] flex-col items-center justify-center px-8 py-12 text-cream"
          aria-busy="true"
        >
          <BrandLogo className="entry-standby" />
        </main>
      );
    }
    // Entering = a designed doorway (#103), not a spinner: the check-in RPC and
    // the room load run while this shows, so the threshold names the place
    // before it hands off to the feed. The live-dot beats red because the room
    // really is live. Held for a readable minimum (ARRIVAL_MIN_MS) from the
    // moment it paints, so a fast load still reads as a threshold.
    return (
      <EntryThreshold ember>
        <BrandLogo />
        <p className="night-kicker mt-14">{s.enterKicker}</p>
        <h1 className="font-display mt-3 text-[2.5rem] font-medium leading-[1.03] text-cream">
          {venue.name}
        </h1>
        <hr className="hairline mt-6 w-28" />
        <p className="night-kicker mt-5 inline-flex items-center gap-2.5">
          <LiveDot />
          {venue.city ? `${venue.city} · ${s.enterLiveTag}` : s.enterLiveTag}
        </p>
        <p className="night-muted mt-7 max-w-[17rem] leading-relaxed">
          {s.enterReassure}
        </p>
      </EntryThreshold>
    );
  }

  if (status === "error") {
    // A real technical failure (anonymous sign-in off, etc.) — neutral tone,
    // no live-dot, no ember: nothing here is live.
    return (
      <EntryThreshold>
        <BrandLogo />
        <hr className="hairline mt-16 w-28" />
        <h1 className="font-display mt-6 text-3xl font-medium leading-tight text-cream">
          {s.errorTitle}
        </h1>
        <hr className="hairline mt-6 w-28" />
        <p className="night-muted mt-6 max-w-[17rem] leading-relaxed">
          {s.loadError}
        </p>
      </EntryThreshold>
    );
  }

  if (status === "notfound") {
    // The slug matches no venue. Same threshold language, neutral tone, and a
    // nudge back to the real entry point (the QR at the door).
    return (
      <EntryThreshold>
        <BrandLogo />
        <hr className="hairline mt-16 w-28" />
        <h1 className="font-display mt-6 text-3xl font-medium leading-tight text-cream">
          {s.notFoundTitle}
        </h1>
        <hr className="hairline mt-6 w-28" />
        <p className="night-muted mt-6 max-w-[17rem] leading-relaxed">
          {s.venueNotFound}
        </p>
      </EntryThreshold>
    );
  }

  if (status === "offHours") {
    return (
      <EntryThreshold ember>
        <BrandLogo />
        <p className="night-kicker mt-14 inline-flex items-center gap-2.5">
          <LiveDot dormant />
          {venue?.city ? `${venue.name} · ${venue.city}` : venue?.name ?? ""}
        </p>
        <h1 className="font-display mt-4 text-3xl font-medium leading-tight text-cream">
          {s.closedTitle}
        </h1>
        <hr className="hairline mt-6 w-28" />
        <p className="night-muted mt-6 max-w-[18rem] leading-relaxed">
          {s.closedBody}
        </p>
      </EntryThreshold>
    );
  }

  if (status === "waiting" && venue && venueNight) {
    const guaranteedLaunchTime = new Intl.DateTimeFormat(locale, {
      timeZone: venue.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(venueNight.guaranteed_launch_at));
    return (
      <>
      <PreLaunchWaitingRoom
        venueName={venue.name}
        participantCount={venueNight.participant_count}
        guaranteedLaunchAt={venueNight.guaranteed_launch_at}
        guaranteedLaunchTime={guaranteedLaunchTime}
        hasBio={Boolean(me?.bio)}
        polishPath={`/profile?edit=1&venue=${encodeURIComponent(venueSlug)}`}
        locale={locale}
        emailActionVisible={waitingRoomEmailVisible}
        emailSubscribed={emailSubscribed}
        initialEmail={email}
        onEmailOffered={markEmailOffered}
        onEmailDismissed={dismissEmailAction}
        onEmailSubscribed={finishEmailAction}
        errorMessage={errorMsg}
        onLeave={requestLeave}
        s={s}
      />
      {leaveConfirmation}
      </>
    );
  }

  if (status === "paused") {
    return (
      <VenueNightNotice
        venue={venue}
        title={s.pausedTitle}
        body={s.pausedBody}
      />
    );
  }

  if (status === "cancelled" || status === "ended") {
    return (
      <VenueNightNotice
        venue={venue}
        title={status === "cancelled" ? s.cancelledTitle : s.endedTitle}
        body={status === "cancelled" ? s.cancelledBody : s.endedBody}
        backHome={s.backHome}
      />
    );
  }

  if (status === "left") {
    // Presence ended explicitly or by joining another venue. Re-entry stays an
    // intentional action, but the threshold welcomes the participant back.
    return (
      <EntryThreshold ember>
        <BrandLogo />
        <p className="night-kicker mt-14 inline-flex items-center gap-2.5">
          <LiveDot dormant />
          {venue?.city ? `${venue.name} · ${venue.city}` : venue?.name ?? ""}
        </p>
        <h1 className="font-display mt-4 text-3xl font-medium leading-tight text-cream">
          {justLeftVenue ? s.departedTitle : s.leftTitle}
        </h1>
        <hr className="hairline mt-6 w-28" />
        <p className="night-muted mt-6 max-w-[17rem] leading-relaxed">
          {justLeftVenue ? s.departedBody : s.leftBody}
        </p>
        {justLeftVenue ? (
          <>
            <Link
              href="/"
              className="night-button night-button-primary mt-8 w-full max-w-xs px-5 py-4"
            >
              {s.backHome}
            </Link>
            {venue && (
              <button
                onClick={rejoin}
                className="night-button night-button-secondary mt-3 w-full max-w-xs px-5 py-4"
              >
                {s.rejoin}
              </button>
            )}
          </>
        ) : venue ? (
          <>
          <button
            onClick={rejoin}
            className="night-button night-button-primary mt-8 w-full max-w-xs px-5 py-4"
          >
            {s.rejoin}
          </button>
            <Link
              href="/"
              className="night-button night-button-secondary mt-3 w-full max-w-xs px-5 py-4"
            >
              {s.backHome}
            </Link>
          </>
        ) : null}
      </EntryThreshold>
    );
  }

  if (status === "invisible") {
    // Not a real threshold (you're still checked into the venue), but it
    // shares the same visual language as the other paused/away states:
    // dormant live-dot, hairline, centered header block. The matches list
    // below is the one thing those screens never carry, so it breaks out to
    // the wider room-card column instead of staying pinned to the narrow
    // threshold width.
    return (
      <>
      <main className="night-shell flex min-h-[100dvh] flex-col items-center gap-12 px-6 py-12 text-cream sm:px-8">
        <div className="night-content animate-curtain flex w-full max-w-sm flex-col items-center text-center">
          <BrandLogo />
          <p className="night-kicker mt-14 inline-flex items-center gap-2.5">
            <LiveDot dormant />
            {venue?.city ? `${venue.name} · ${venue.city}` : venue?.name ?? ""}
          </p>
          <h1 className="font-display mt-4 text-3xl font-medium leading-tight text-cream">
            {s.invisibleTitle}
          </h1>
          <PhotoStatus state={photoState.state} locale={locale} href={`/profile?edit=1&venue=${encodeURIComponent(venueSlug)}`} />
          <hr className="hairline mt-6 w-28" />
          <p className="night-muted mt-6 max-w-[18rem] leading-relaxed">
            {s.invisibleBody}
          </p>
          <button
            type="button"
            onClick={becomeVisible}
            className="night-button night-button-primary mt-8 w-full max-w-xs px-5 py-4"
          >
            {s.becomeVisible}
          </button>
          <button
            type="button"
            onClick={requestLeave}
            className="mt-3 text-xs text-taupe/70 transition-colors hover:text-taupe"
          >
            {s.leave}
          </button>
          {errorMsg && (
            <p className="mt-4 text-sm text-blush" role="alert">
              {errorMsg}
            </p>
          )}
        </div>
        {matches.length > 0 && (
          <section className="w-full max-w-md text-left">
            <h2 className="night-kicker">{s.activeMatches}</h2>
            <p className="night-muted mt-2 text-sm">{s.conversationHint}</p>
            <div className="mt-4 grid gap-3">
              {matches.map((match) => (
                <div
                  key={match.id}
                  className="night-card-hot relative rounded-2xl p-3"
                >
                  {(unreadByMatchId[match.id] ?? 0) > 0 && (
                    <span className="absolute right-3 top-3 flex h-6 min-w-6 items-center justify-center rounded-full bg-blush px-2 text-xs font-semibold text-ink">
                      {unreadByMatchId[match.id]}
                    </span>
                  )}
                  <Link
                    href={`/chat/${match.id}`}
                    className="flex items-center gap-3"
                    aria-label={s.openConversation(match.other.first_name)}
                  >
                    <ProfilePhoto profileId={match.other.id} src={match.other.photo_url}
                      name={match.other.first_name}
                      className="night-photo-ring h-12 w-12 rounded-full object-cover"
                    />
                    <span>
                      <span className="wordmark block text-lg font-semibold text-cream">
                        {match.other.first_name}
                      </span>
                      <span className="block text-sm text-taupe">
                        {s.chat}
                      </span>
                    </span>
                  </Link>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
      {leaveConfirmation}
      </>
    );
  }

  const visible = candidates.filter((c) => !matchedIds.has(c.id));
  const emptyVariant = emptyRoomVariant({ roomCount, roomHadCrowd });
  // An answer being typed holds the feed back; the arrival is announced instead
  // and entering it is one tap. The hold is deliberately narrow: an open but
  // untouched form lets the feed through, because a room that stays empty while
  // people are arriving is indistinguishable from a broken one.
  const showEmptyRoom = visible.length === 0 || emptyRoomHeld;
  const pendingArrivals = visible.length > 0 && emptyRoomHeld;
  // The profile in view (falls back to the top card before the first scroll).
  // Its safety actions live in the single chrome ⋯.
  const currentCandidate =
    photoState.state?.correction_required || showEmptyRoom ? null :
      visible.find((c) => c.id === currentVisibleId) ?? visible[0] ?? null;
  const totalUnread = matches.reduce(
    (sum, m) => sum + (unreadByMatchId[m.id] ?? 0),
    0
  );
  const orderedMatches = orderMatchesByAttention(matches, unreadByMatchId);
  // The "polish your profile" / "edit my profile" doors are for an already-
  // onboarded user, so they must open the editor (edit=1); without it, /profile
  // sees a complete profile and bounces straight back to the room.
  const polishPath = `/profile?edit=1&venue=${encodeURIComponent(venueSlug)}`;

  return (
    <main className="night-shell flex h-dvh min-h-0 flex-col text-cream">
      {/* Phone-width column, centered on desktop (the room is a phone in a bar,
          never a grid). The chrome (brand, venue, live count, the single context
          menu, matches) floats over the full-bleed feed as overlays, so the
          photo is always full-screen and the matches pill never shrinks it. */}
      <div className="night-content relative mx-auto min-h-0 w-full max-w-md flex-1 sm:border-x sm:border-champagne/10">
        {/* Floating header: brand + venue + live count (left), one context menu
            (right). pointer-events-none so a swipe over the text still scrolls
            the feed; only the menu re-enables pointer events. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-5">
          <div className="min-w-0">
            <BrandLogo align="start" />
            {/* Venue on its own line so a long name truncates without ever eating
                the live count on the line below. */}
            {venue?.name && (
              <p
                className="mt-1 truncate font-label text-[10px] uppercase tracking-[0.24em] text-cream"
                style={{ textShadow: "0 1px 18px rgba(18,10,15,.95)" }}
              >
                {venue.name}
              </p>
            )}
            {roomCount !== null && roomCount > 0 && (
              <div
                className="mt-1 flex items-center gap-2"
                style={{ textShadow: "0 1px 18px rgba(18,10,15,.95)" }}
              >
                <span className="h-[5px] w-[5px] rounded-full bg-red shadow-[0_0_10px_rgba(204,20,54,.85)]" />
                <span className="font-label text-[10px] uppercase tracking-[0.24em] text-taupe">
                  {s.liveStatus(roomCount)}
                </span>
              </div>
            )}
          </div>
          {/* The single, context-aware menu: the visible person's safety actions
              on top, then the room/self actions. Closes on ANY outside tap (the
              old bug was a backdrop stuck behind the sticky bar). */}
          <div className="pointer-events-auto relative shrink-0">
            <button
              type="button"
              aria-label={s.roomActions}
              aria-controls="room-overflow-menu"
              aria-expanded={roomMenuOpen}
              onClick={() => setRoomMenuOpen((open) => !open)}
              className={`relative z-50 flex h-10 w-10 items-center justify-center rounded-full border text-cream backdrop-blur transition-[background-color,border-color,transform] duration-200 ease-out active:scale-[0.96] motion-reduce:transition-none ${
                roomMenuOpen
                  ? "border-champagne/45 bg-velvet/90"
                  : "border-champagne/25 bg-velvet/60"
              }`}
            >
              <MoreHorizontal
                aria-hidden
                strokeWidth={1.75}
                className={`h-5 w-5 transition-transform duration-200 ease-out motion-reduce:transition-none ${
                  roomMenuOpen ? "rotate-90" : "rotate-0"
                }`}
              />
            </button>
            <div
              aria-hidden={!roomMenuOpen}
              className={`fixed inset-0 z-40 ${
                roomMenuOpen ? "pointer-events-auto" : "pointer-events-none"
              }`}
              onClick={() => setRoomMenuOpen(false)}
            />
            <div
              id="room-overflow-menu"
              inert={!roomMenuOpen}
              aria-hidden={!roomMenuOpen}
              className={`night-panel absolute right-0 z-50 mt-2 grid w-56 origin-top-right gap-2 p-2 transition-[opacity,transform,visibility] duration-200 ease-out motion-reduce:transition-none ${
                roomMenuOpen
                  ? "visible translate-y-0 scale-100 opacity-100"
                  : "invisible pointer-events-none -translate-y-1 scale-[0.96] opacity-0"
              }`}
            >
              {/* This person, safety (blush, never red). */}
              {currentCandidate && (
                <>
                  <p
                    data-testid="room-menu-profile-name"
                    className="min-w-0 break-all whitespace-normal px-2 pt-1 font-label text-[10px] leading-snug uppercase tracking-[0.2em] text-taupe"
                  >
                    {currentCandidate.first_name}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setRoomMenuOpen(false);
                      openReport(currentCandidate);
                    }}
                    className="night-button night-button-danger px-4 py-3 text-xs"
                  >
                    {s.report}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRoomMenuOpen(false);
                      openBlock(currentCandidate);
                    }}
                    className="night-button night-button-danger px-4 py-3 text-xs"
                  >
                    {s.block}
                  </button>
                  <hr className="hairline my-1" />
                </>
              )}
              {/* You and the room. */}
              {me && (
                <Link
                  href={polishPath}
                  onClick={() => setRoomMenuOpen(false)}
                  className="night-button night-button-secondary px-4 py-3 text-center text-xs"
                >
                  {s.editProfile}
                </Link>
              )}
              <LanguageSelector className="justify-center" />
              <button
                type="button"
                onClick={() => {
                  setRoomMenuOpen(false);
                  goInvisible();
                }}
                className="night-button night-button-secondary px-4 py-3 text-xs"
              >
                {s.goInvisible}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRoomMenuOpen(false);
                  requestLeave();
                }}
                className="mt-1 border-t border-champagne/20 px-4 py-3 text-left text-xs text-taupe transition-colors hover:text-cream"
              >
                {s.leave}
              </button>
            </div>
          </div>
        </div>

        {/* Matches: a single match shows the person directly (photo + name),
            tap opens the conversation — no expand step for one person (#173).
            Two or more collapse into a pill (overlapping avatars + count +
            unread) that expands to the full strip on tap; both float over the
            photo and never push it. Tap outside the strip to collapse. */}
        {matches.length > 0 && (
          <div
            ref={matchStackRef}
            data-testid="match-stack"
            className="absolute inset-x-0 top-[96px] z-20 px-5"
          >
            {orderedMatches.length === 1 ? (
              <Link
                href={`/chat/${orderedMatches[0].id}`}
                aria-label={s.openConversation(orderedMatches[0].other.first_name)}
                className="night-card-hot inline-flex max-w-full items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 backdrop-blur"
              >
                <span className="relative shrink-0">
                  <ProfilePhoto profileId={orderedMatches[0].other.id} src={orderedMatches[0].other.photo_url}
                    name={orderedMatches[0].other.first_name}
                    className="night-photo-ring h-8 w-8 rounded-full object-cover"
                  />
                  {(unreadByMatchId[orderedMatches[0].id] ?? 0) > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blush px-1 text-[10px] font-semibold text-ink">
                      {unreadByMatchId[orderedMatches[0].id]}
                    </span>
                  )}
                </span>
                <span className="max-w-[9rem] truncate text-sm font-medium text-cream">
                  {orderedMatches[0].other.first_name}
                </span>
              </Link>
            ) : matchesExpanded ? (
              <>
                <div data-testid="match-strip" className="flex items-center gap-2 overflow-x-auto pb-1">
                  {orderedMatches.map((match) => (
                    <div
                      key={match.id}
                      className="night-card-hot flex max-w-full shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 backdrop-blur"
                    >
                      <Link
                        href={`/chat/${match.id}`}
                        className="flex min-w-0 items-center gap-2 transition hover:opacity-80"
                        aria-label={s.openConversation(match.other.first_name)}
                      >
                        <span className="relative shrink-0">
                          <ProfilePhoto profileId={match.other.id} src={match.other.photo_url}
                            name={match.other.first_name}
                            className="night-photo-ring h-9 w-9 rounded-full object-cover"
                          />
                          {(unreadByMatchId[match.id] ?? 0) > 0 && (
                            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blush px-1 text-[10px] font-semibold text-ink">
                              {unreadByMatchId[match.id]}
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 truncate text-sm font-medium text-cream">
                          {match.other.first_name}
                        </span>
                      </Link>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setMatchesExpanded(true)}
                aria-label={s.matchesCount(matches.length)}
                className="night-card-hot inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 backdrop-blur"
              >
                <span className="flex items-center">
                  {orderedMatches.slice(0, 3).map((match, i) => (
                    <ProfilePhoto
                      key={match.id}
                      profileId={match.other.id}
                      src={match.other.photo_url}
                      name={match.other.first_name}
                      className={`night-photo-ring h-8 w-8 rounded-full object-cover ${i > 0 ? "-ml-3" : ""}`}
                    />
                  ))}
                </span>
                <span className="text-sm font-medium text-cream">
                  {s.matchesCount(matches.length)}
                </span>
                {totalUnread > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blush px-1.5 text-[11px] font-semibold text-ink">
                    {totalUnread}
                  </span>
                )}
              </button>
            )}
          </div>
        )}

        {/* Transient error, floated below the chrome so nothing shifts layout. */}
        {!photoState.state?.correction_required && photoState.state?.last_action !== "submitted" && <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 mx-auto max-w-sm -translate-y-1/2 px-4"><div className="pointer-events-auto"><PhotoStatus state={photoState.state} locale={locale} href={polishPath} /></div></div>}

        {errorMsg && !reportTarget && (
          <div className="pointer-events-none absolute inset-x-0 top-[150px] z-20 flex justify-center px-5">
            <p className="night-pill pointer-events-auto rounded-full bg-velvet/80 px-3 py-1.5 text-blush backdrop-blur">
              {errorMsg}
            </p>
          </div>
        )}

        {photoState.state?.correction_required ? (
          <div className="flex h-full items-center justify-center px-5"><PhotoStatus state={photoState.state} locale={locale} href={polishPath} /></div>
        ) : showEmptyRoom ? (
          /* An empty feed is a moment in the night, not a dead end (#118): an
             honest reframe of what is happening, the bio lever, and the
             next-nights email. The feed takes over on its own as soon as
             someone eligible shows up. */
          <EmptyLiveRoom
            variant={emptyVariant}
            hasBio={Boolean(me?.bio)}
            polishPath={polishPath}
            /* A match reveal is acknowledgement enough on its own. */
            notice={feedDrained && !newMatch ? s.empty.feedDrained : null}
            locale={locale}
            initialEmail={email}
            emailSubscribed={emailSubscribed}
            onEmailOffered={markEmailOffered}
            onEmailDismissed={dismissEmailAction}
            onEmailSubscribed={finishEmailAction}
            onHoldChange={setEmptyRoomHeld}
            pendingArrivals={pendingArrivals}
            onEnterFeed={() => setEmptyRoomHeld(false)}
            onLeave={requestLeave}
            s={s}
          />
        ) : (
          /* One profile per viewport: recognition, not evaluation. Scrolling
             past someone stores and shows nothing — you can always come back. */
          <div
            ref={feedRef}
            data-testid="profile-feed"
            onScroll={handleFeedScroll}
            className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain"
          >
            {visible.map((c) => {
              const liked = likedIds.has(c.id);
              const likePending = pendingLikeIds.has(c.id);
              const expanded = expandedId === c.id;
              return (
                <RoomFeedCard
                  key={c.id}
                  candidate={c}
                  liked={liked}
                  likePending={likePending}
                  expanded={expanded}
                  s={s}
                  onToggleBio={() =>
                    c.bio &&
                    setExpandedId((current) => (current === c.id ? null : c.id))
                  }
                  onLike={() => !liked && toggleLike(c)}
                  onToggleLike={() => toggleLike(c)}
                />
              );
            })}
          </div>
        )}

        {/* Someone new appended below: a cue, never a shift under the thumb.
            Leave room for the floating match row when one is present. */}
        {arrivalCue && !showRoomHint && visible.length > 0 && (
          <div
            className={`pointer-events-none absolute inset-x-0 z-10 flex justify-center ${
              matches.length > 0
                ? "top-[calc(env(safe-area-inset-top)+9.5rem)]"
                : "top-[calc(env(safe-area-inset-top)+6rem)]"
            }`}
          >
            <button
              type="button"
              onClick={jumpToNewestArrival}
              className="night-pill pointer-events-auto rounded-full bg-velvet/70 px-3 py-1.5 backdrop-blur"
            >
              {s.newArrivalCue}
            </button>
          </div>
        )}

      </div>

      {/* First-entry primer: a one-time modal (localStorage-gated) that lands
          right after the arrival ceremony to spell out the discreet double
          opt-in before anyone taps. Shown only once there is a room to explain. */}
      {showRoomHint && visible.length > 0 && (
        <Modal
          onClose={dismissRoomHint}
          showClose={false}
          labelledById="room-hint-title"
          overlayClassName="room-hint-overlay"
          panelClassName="room-hint-panel"
        >
          <h2
            id="room-hint-title"
            className="font-display text-2xl font-medium text-cream"
          >
            {s.firstTimeHintTitle}
          </h2>
          <p className="mt-2.5 text-sm leading-relaxed text-taupe">
            {s.firstTimeHintBody}
          </p>
          <button
            type="button"
            onClick={dismissRoomHint}
            className="night-button mt-4 w-full bg-cream px-5 py-2.5 text-ink"
          >
            {s.firstTimeHintDismiss}
          </button>
        </Modal>
      )}

      {newMatch && (
        // Hero #2 — the match reveal. One of the only two full-red screens
        // (docs/design.md): full red-deep radial ground, two overlapping
        // portraits (the match in front behind a fine champagne ring, you
        // receding behind), a low champagne spark where the faces meet. It
        // rises like a curtain, never a jackpot.
        <div className="animate-curtain fixed inset-0 z-50 flex flex-col overflow-hidden bg-red-deep text-cream">
          <div className="reveal-ground pointer-events-none absolute inset-0" />
          <div className="room-grain pointer-events-none absolute inset-0" />

          <div className="relative z-10 flex flex-1 flex-col px-6 pt-10 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
            <BrandLogo className="mx-auto" />

            <div className="flex flex-1 flex-col items-center justify-center text-center">
              {/* Two overlapping portraits: back = you, front = the match. */}
              <div className="relative mb-9 h-32 w-[13.5rem]">
                <div
                  aria-hidden
                  className="reveal-spark reveal-spark-bloom pointer-events-none absolute -bottom-1.5 left-1/2 h-[9.5rem] w-[13.75rem] -translate-x-1/2 rounded-full"
                />
                {/* Back — you: recedes behind. */}
                <div className="reveal-face-back reveal-portrait-enter absolute left-0 top-0 h-32 w-32 overflow-hidden rounded-full bg-bordeaux">
                  {me?.photo_url && (
                    <ProfilePhoto profileId={me.id} src={me.photo_url}
                      name={me.first_name}
                      className="h-full w-full rounded-full object-cover"
                      initialClassName="text-4xl"
                    />
                  )}
                  <div
                    aria-hidden
                    className="reveal-face-key pointer-events-none absolute inset-0 rounded-full"
                  />
                  <div
                    aria-hidden
                    className="reveal-face-recede pointer-events-none absolute inset-0 rounded-full"
                  />
                </div>
                {/* Front — the match: fine champagne ring, lifted forward. */}
                <div className="reveal-face-front reveal-portrait-enter absolute right-0 top-0 z-10 h-32 w-32 overflow-hidden rounded-full bg-bordeaux [animation-delay:80ms]">
                  <ProfilePhoto profileId={newMatch.other.id} src={newMatch.other.photo_url}
                    name={newMatch.other.first_name}
                    className="h-full w-full rounded-full object-cover"
                    initialClassName="text-4xl"
                  />
                  <div
                    aria-hidden
                    className="reveal-face-key pointer-events-none absolute inset-0 rounded-full"
                  />
                </div>
              </div>

              <p className="night-kicker text-blush">{s.matchKicker}</p>
              <h2 className="wordmark mt-4 text-[2.75rem] font-medium italic leading-none text-cream">
                {s.matchTitle}
              </h2>
              <hr className="hairline my-6 w-[60px]" />
              <p className="max-w-xs text-sm leading-relaxed text-blush">
                {s.matchBody}
              </p>
            </div>

            <div className="grid w-full max-w-xs gap-3 self-center">
              <Link
                href={`/chat/${newMatch.id}`}
                className="night-button w-full bg-cream px-5 py-4 text-center text-red-deep transition-transform active:scale-[0.97]"
              >
                {s.openChat}
              </Link>
              <button
                onClick={() => setNewMatch(null)}
                className="night-button w-full border border-cream/40 px-5 py-4 text-cream transition-transform active:scale-[0.97]"
              >
                {s.matchDismiss}
              </button>
            </div>
          </div>
        </div>
      )}

      {emailPromptOpen &&
        emailPromptVenueSlug === venueSlug &&
        !newMatch &&
        !reportTarget &&
        !blockTarget && (
        <Modal
          onClose={dismissEmailPrompt}
          dismissable={emailPromptState !== "saving"}
          closeLabel={s.emailPromptClose}
          labelledById="email-prompt-title"
        >
          <form onSubmit={submitEmailPrompt}>
            <BrandLogo align="start" />
            <h2
              id="email-prompt-title"
              className="font-display mt-4 pr-10 text-3xl font-medium"
            >
              {s.emailPromptTitle}
            </h2>

            {emailPromptState === "success" ? (
              <p className="mt-5 leading-relaxed text-taupe" aria-live="polite">
                {s.emailPromptSuccess}
              </p>
            ) : (
              <>
                <p className="mt-3 leading-relaxed text-taupe">
                  {s.emailPromptBody}
                </p>
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  autoFocus
                  required

                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={s.emailPromptPlaceholder}
                  className="night-input mt-5 px-4 py-3"
                />
                <label className="mt-4 flex items-start gap-3 text-sm leading-relaxed text-taupe">
                  <input
                    type="checkbox"
                    required
                    checked={emailConsent}
                    onChange={(event) => setEmailConsent(event.target.checked)}
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--wine)]"
                  />
                  <span>{s.emailPromptConsent}</span>
                </label>
                {emailPromptError && (
                  <p className="mt-3 text-sm text-blush" aria-live="polite">
                    {emailPromptError}
                  </p>
                )}
                <div className="mt-6 grid gap-3">
                  <button
                    type="submit"
                    disabled={emailPromptState === "saving"}
                    className="night-button bg-cream px-5 py-3 text-ink disabled:opacity-60"
                  >
                    {emailPromptState === "saving"
                      ? s.emailPromptSaving
                      : s.emailPromptSubmit}
                  </button>
                  <button
                    type="button"
                    disabled={emailPromptState === "saving"}
                    onClick={dismissEmailPrompt}
                    className="night-button night-button-secondary px-5 py-3 disabled:opacity-60"
                  >
                    {s.emailPromptNotNow}
                  </button>
                </div>
              </>
            )}
          </form>
        </Modal>
      )}

      {reportTarget && (
        <Modal
          onClose={() => setReportTarget(null)}
          showClose={false}
          overlayClassName="z-50"
          labelledById="report-title"
        >
          <form onSubmit={submitReport} noValidate>
            <p className="night-kicker text-[10px]">{s.report}</p>
            <h2
              id="report-title"
              className="font-display mt-3 text-2xl font-medium text-cream"
            >
              {s.reportTitle(reportTarget.first_name)}
            </h2>
            {reportSubmitted ? (
              <>
                <p className="mt-4 text-taupe" aria-live="polite">
                  {s.reportSuccess}
                </p>
                <p className="mt-2 text-sm text-taupe">
                  {s.reportBlockPrompt}
                </p>
                <div className="mt-6 grid gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      blockProfile(reportTarget, reportReason, reportNote)
                    }
                    className="night-button night-button-danger px-5 py-3"
                  >
                    {s.block}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportTarget(null)}
                    className="night-button night-button-secondary px-5 py-3"
                  >
                    {s.reportClose}
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="mt-5 block text-sm font-medium text-taupe">
                  {s.reportReason}
                  <select
                    value={reportReason}
                    onChange={(event) => {
                      const reason = event.target.value as ReportReason;
                      setReportReason(reason);
                      if (reason !== "other") setReportNoteError("");
                    }}
                    className="night-input mt-2 px-4 py-3"
                  >
                    {REPORT_REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {s.reportReasons[reason]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-4 block text-sm font-medium text-taupe">
                  {reportReason === "other"
                    ? s.reportNoteRequired
                    : s.reportNote}
                  <textarea
                    ref={reportNoteRef}
                    value={reportNote}
                    onChange={(event) => {
                      const note = event.target.value;
                      setReportNote(note);
                      if (note.trim()) setReportNoteError("");
                    }}
                    required={reportReason === "other"}
                    aria-invalid={Boolean(reportNoteError) || !isValidText(reportNote, SAFETY_NOTE_MAX_LENGTH, false)}
                    aria-describedby={
                      reportNoteError ? "report-note-error" : undefined
                    }

                    className="night-input mt-2 h-28 resize-none px-4 py-3"
                  />
                </label>
                {reportNoteError && (
                  <p
                    id="report-note-error"
                    className="mt-3 text-sm text-blush"
                    role="alert"
                  >
                    {reportNoteError}
                  </p>
                )}
                {errorMsg && (
                  <p className="mt-3 text-sm text-blush">{errorMsg}</p>
                )}
                <div className="mt-6 grid gap-3">
                  {/* Safety action — never red. A cream-filled affirmative on bordeaux. */}
                  <button
                    type="submit"
                    className="night-button bg-cream px-5 py-3 text-ink"
                  >
                    {s.reportSubmit}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportTarget(null)}
                    className="night-button night-button-secondary px-5 py-3"
                  >
                    {s.reportCancel}
                  </button>
                </div>
              </>
            )}
          </form>
        </Modal>
      )}

      {blockTarget && (
        <Modal
          onClose={() => setBlockTarget(null)}
          showClose={false}
          overlayClassName="z-50"
          labelledById="block-title"
        >
          <form onSubmit={submitBlock}>
            <p className="night-kicker text-[10px]">{s.block}</p>
            <h2
              id="block-title"
              className="font-display mt-3 text-2xl font-medium text-cream"
            >
              {s.blockTitle(blockTarget.first_name)}
            </h2>
            <p className="mt-3 leading-relaxed text-taupe">{s.blockBody}</p>

            {/* The reason is a moderation signal, not a gate: folded away by
                default (a valid default already sits in blockReason) and only
                revealed if the user wants to say why. */}
            {blockReasonOpen ? (
              <>
                <label className="mt-5 block text-sm font-medium text-taupe">
                  {s.blockReason}
                  <select
                    value={blockReason}
                    onChange={(event) =>
                      setBlockReason(event.target.value as ReportReason)
                    }
                    className="night-input mt-2 px-4 py-3"
                  >
                    {REPORT_REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {s.reportReasons[reason]}
                      </option>
                    ))}
                  </select>
                </label>
                <textarea
                  value={blockNote}
                  onChange={(event) => setBlockNote(event.target.value)}
                  aria-invalid={!isValidText(blockNote, SAFETY_NOTE_MAX_LENGTH, false)}
                  placeholder={s.reportNote}
                  className="night-input mt-4 h-28 resize-none px-4 py-3"
                />
              </>
            ) : (
              <button
                type="button"
                onClick={() => setBlockReasonOpen(true)}
                className="mt-4 text-sm text-taupe underline underline-offset-4 transition-colors hover:text-cream"
              >
                {s.blockReasonOptional}
              </button>
            )}

            {errorMsg && <p className="mt-3 text-sm text-blush">{errorMsg}</p>}
            <div className="mt-6 grid gap-3">
              <button
                type="submit"
                className="night-button night-button-danger px-5 py-3"
              >
                {s.blockSubmit}
              </button>
              <button
                type="button"
                onClick={() => setBlockTarget(null)}
                className="night-button night-button-secondary px-5 py-3"
              >
                {s.reportCancel}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {leaveConfirmation}
    </main>
  );
}

type RoomStrings = (typeof t)["en"]["room"];

// Room feed card — hero #1, "Sous les projecteurs" (docs/design.md). One
// full-viewport card per person: the photo IS the card, the person emerges
// from a warm key light on near-black, and a layered night treatment (grade →
// key → vignette → grain, in .room-* classes) keeps any photo legible and
// pulls every face into the same venue darkness. The room count lives once, in
// the on-photo header; the ♥ stays discreet until a button tap or double tap on
// the photo. Presentational: all data + state come through props.
function RoomFeedCard({
  candidate,
  liked,
  likePending,
  expanded,
  s,
  onToggleBio,
  onLike,
  onToggleLike,
}: {
  candidate: Candidate;
  liked: boolean;
  likePending: boolean;
  expanded: boolean;
  s: RoomStrings;
  onToggleBio: () => void;
  onLike: () => void;
  onToggleLike: () => void;
}) {
  const c = candidate;
  const lastTapAtRef = useRef(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureHeartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [gestureHeart, setGestureHeart] = useState<GestureHeart | null>(null);

  useEffect(() => {
    return () => {
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      if (gestureHeartTimerRef.current) clearTimeout(gestureHeartTimerRef.current);
    };
  }, []);

  function handleCardTap(event: ReactMouseEvent<HTMLElement>) {
    const now = Date.now();
    const isDoubleTap = now - lastTapAtRef.current <= DOUBLE_TAP_MS;

    if (isDoubleTap) {
      lastTapAtRef.current = 0;
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      // Double-tap is additive only. A profile that is already liked stays
      // quiet: repeated feedback would imply that another action occurred.
      if (liked || likePending) return;
      onLike();

      // Keep the acknowledgement discreet and consistent with the explicit
      // heart control: one small heart at the touch point for the state change.
      const bounds = event.currentTarget.getBoundingClientRect();
      setGestureHeart({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
      if (gestureHeartTimerRef.current) clearTimeout(gestureHeartTimerRef.current);
      gestureHeartTimerRef.current = setTimeout(() => {
        setGestureHeart(null);
        gestureHeartTimerRef.current = null;
      }, 700);
      return;
    }

    lastTapAtRef.current = now;
    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = setTimeout(() => {
      lastTapAtRef.current = 0;
      singleTapTimerRef.current = null;
      onToggleBio();
    }, DOUBLE_TAP_MS);
  }

  return (
    <section
      onClick={handleCardTap}
      className="relative h-full touch-manipulation snap-start snap-always overflow-hidden bg-bordeaux"
    >
      {/* Full-bleed cinematic photo: the photo IS the card. bg-bordeaux under
          it is the loading/empty ground — never a white flash. */}
      <ProfilePhoto profileId={c.id} src={c.photo_url}
        name={c.first_name}
        className="absolute inset-0 h-full w-full object-cover"
        initialClassName="text-7xl"
      />
      {/* Layered night treatment: grade crushes highlights so even a bright
          selfie stays legible, key lifts the face out of shadow, then vignette
          + grain. All inert so taps fall through to the card. */}
      <div className="room-grade pointer-events-none absolute inset-0" />
      <div className="room-key pointer-events-none absolute inset-0" />
      <div className="room-vignette pointer-events-none absolute inset-0" />
      <div className="room-grain pointer-events-none absolute inset-0" />
      {/* Scrims guarantee text never sits on the raw photo. */}
      <div className="room-top-scrim pointer-events-none absolute inset-x-0 top-0 h-40" />
      <div className="room-identity-scrim pointer-events-none absolute inset-0" />
      {/* Reading the full bio deserves a calmer photo behind it. */}
      {expanded && (
        <div className="pointer-events-none absolute inset-0 bg-velvet/55 transition-opacity" />
      )}
      {gestureHeart && (
        <div
          aria-hidden
          className="pointer-events-none absolute z-10"
          style={{
            left: gestureHeart.x,
            top: gestureHeart.y,
            transform: "translate(-50%, -50%)",
          }}
        >
          <Heart
            aria-hidden
            strokeWidth={0}
            className="gesture-heart h-[52px] w-[52px] fill-red text-red"
          />
        </div>
      )}
      {/* No on-photo header: brand, venue, live count and the single context
          menu (with this person's safety actions) all live in the persistent
          room chrome now, so the card is pure identity. */}
      {/* Centered identity block: arrival kicker, name, bio, one short champagne
          hairline, then the discreet heart pill. Rises softly on mount. */}
      <div className="room-card-enter absolute inset-x-6 bottom-11 text-center">
        {c.justArrived && (
          <p className="night-kicker mb-3 text-[10px]">{s.justArrived}</p>
        )}
        <h2
          data-testid="room-profile-name"
          className={`wordmark mx-auto line-clamp-2 max-w-full overflow-hidden break-all pb-[0.1em] leading-[1.02] text-cream ${
            Array.from(c.first_name).length <= 18
              ? "text-[3.25rem]"
              : Array.from(c.first_name).length <= 24
                ? "text-[2.625rem]"
                : "text-[2rem]"
          }`}
          style={{ textShadow: "0 1px 22px rgba(18,10,15,.7)" }}
        >
          {c.first_name}
        </h2>
        {c.bio && (
          // Clamped to 2 lines by default so a long bio can never push the
          // heart off-screen; tap anywhere on the card to unfold.
          <p
            className={`mx-auto mt-3 max-w-[250px] wrap-anywhere font-body text-sm font-light leading-relaxed ${
              expanded
                ? "max-h-[45dvh] overflow-y-auto whitespace-pre-line text-cream"
                : "line-clamp-2 text-taupe"
            }`}
            style={{ textShadow: "0 1px 16px rgba(18,10,15,.6)" }}
          >
            {c.bio}
          </p>
        )}
        <hr className="hairline mx-auto my-5 w-16" />
        <button
          onClick={(event) => {
            event.stopPropagation();
            onToggleLike();
          }}
          disabled={likePending}
          aria-busy={likePending}
          aria-label={liked ? s.removeLike(c.first_name) : s.like}
          className={`heart-button px-8 py-[15px] text-xs ${
            liked ? "heart-liked" : "heart-idle"
          } ${
            likePending ? "cursor-wait" : "cursor-pointer"
          }`}
        >
          <span aria-hidden className="text-base leading-none">
            {liked ? "♥" : "♡"}
          </span>
          {liked ? s.liked : s.like}
        </button>
      </div>
    </section>
  );
}

// A profile photo that can never be a broken full-screen image: on load error
// it falls back to the person's initial on bordeaux. Lazy by default — the
// whole feed is in the DOM and off-screen full-res photos must not all load
// at once on bar wifi.
function ProfilePhoto({ src, name, className, profileId }: {
  src: string | null; name: string; className: string; initialClassName?: string; profileId?: string;
}) {
  return <AuthorizedPhoto src={src} profileId={profileId} alt={name} className={className} loading="lazy" decoding="async" />;
}

// The entry threshold (#103): the full-bleed night as a doorway, shared by
// every pre-feed state (loading, closed, left, error, not-found). The venue is
// the hero on a warm ember; the calm centred column fades in (curtain), then
// hands off to the live feed. Each state composes its own inner content.
function EntryThreshold({
  ember = false,
  children,
}: {
  ember?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main className="night-shell flex min-h-[100dvh] flex-col items-center justify-center px-8 py-12 text-cream">
      {ember && <div className="entry-ember" aria-hidden />}
      <div className="night-content animate-curtain flex w-full max-w-sm flex-col items-center text-center">
        {children}
      </div>
    </main>
  );
}

function VenueNightNotice({
  venue,
  title,
  body,
  backHome,
}: {
  venue: Venue | null;
  title: string;
  body: string;
  backHome?: string;
}) {
  return (
    <EntryThreshold ember>
      <BrandLogo />
      <p className="night-kicker mt-14 inline-flex items-center gap-2.5">
        <LiveDot dormant />
        {venue?.city ? `${venue.name} · ${venue.city}` : venue?.name ?? ""}
      </p>
      <h1 className="font-display mt-4 text-3xl font-medium leading-tight text-cream">
        {title}
      </h1>
      <hr className="hairline mt-6 w-28" />
      <p
        className="night-muted mt-6 max-w-[18rem] leading-relaxed"
        aria-live="polite"
      >
        {body}
      </p>
      {backHome && (
        <Link
          href="/"
          className="night-button night-button-secondary mt-8 w-full max-w-xs px-5 py-4 text-center"
        >
          {backHome}
        </Link>
      )}
    </EntryThreshold>
  );
}

// The live signal at the threshold: a red seed with a slow single ping when the
// room is live; a dormant taupe breath when nothing is (closed / after leaving).
function LiveDot({ dormant = false }: { dormant?: boolean }) {
  return (
    <span className={`entry-live${dormant ? " is-dormant" : ""}`} aria-hidden>
      <span className="entry-live-ring" />
      <span className="entry-live-seed" />
    </span>
  );
}
