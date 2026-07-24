"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ensureAnonSession } from "@/lib/auth";
import { isMutuallyCompatible } from "@/lib/profile";
import { browserLocale, localeForCity, t } from "@/lib/strings";
import {
  preferredLocale,
  useBrowserLocale,
  usePreferredLocale,
} from "@/lib/useLocale";
import { LanguageSelector } from "@/app/LanguageSelector";
import type { Database } from "@/lib/database.types";

// Public-facing profile: only the columns other users are ever allowed to see.
type PublicProfile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "first_name" | "photo_url" | "bio" | "gender" | "interested_in"
>;
const PUBLIC_COLUMNS = "id, first_name, photo_url, bio, gender, interested_in";

// A room candidate is a public profile plus its check-in time. "Just arrived"
// is computed at fetch time (render must stay pure) and re-derived on a slow
// interval so the tag expires even in a quiet room. The feed is ordered by
// arrival (oldest first): new people append at the bottom, so the list never
// reshuffles under the thumb.
type Candidate = PublicProfile & { checkedInAt: string; justArrived: boolean };

type Venue = Pick<
  Database["public"]["Tables"]["venues"]["Row"],
  "id" | "name" | "city" | "is_live" | "profile_preview_enabled" | "timezone"
>;

type PreviewProfileRow =
  Database["public"]["Functions"]["preview_room_profiles"]["Returns"][number];

type PresenceChange = Pick<
  Database["public"]["Tables"]["presence"]["Row"],
  "left_at" | "is_visible"
>;

type MatchRow = Pick<
  Database["public"]["Tables"]["matches"]["Row"],
  "id" | "profile_a" | "profile_b" | "expires_at"
>;

type RoomMessage = Pick<
  Database["public"]["Tables"]["messages"]["Row"],
  "match_id" | "sender_id" | "created_at"
>;

type ActiveMatch = {
  id: string;
  other: PublicProfile;
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
// While the venue is closed, poll is_live slowly as the realtime fallback.
const CLOSED_POLL_MS = 30_000;
const ROOM_HINT_DISMISS_KEY = "paramour-room-hint-dismissed";
const EMAIL_PROMPT_ACTIVE_MS = 2 * 60_000;
const EMAIL_CONSENT_VERSION = "global-live-night-email-v1";
const EMAIL_PROMPT_DISMISS_PREFIX = "amourette-email-prompt-dismissed";
const EMAIL_SUBSCRIBED_KEY = "amourette-email-subscribed";

// "closed" = the venue exists but is_live is false: the night has not started,
// or the founder ended it. The screen reopens itself when the switch flips.
type Status =
  | "loading"
  | "ready"
  | "error"
  | "notfound"
  | "left"
  | "invisible"
  | "closed";

function readMarkerKey(matchId: string) {
  return `paramour-chat-read:${matchId}`;
}

function getReadMarker(matchId: string) {
  if (typeof window === "undefined") return "1970-01-01T00:00:00.000Z";
  return (
    window.localStorage.getItem(readMarkerKey(matchId)) ??
    "1970-01-01T00:00:00.000Z"
  );
}

function countUnreadMessages(messages: RoomMessage[], myId: string) {
  return messages.reduce<Record<string, number>>((counts, message) => {
    if (message.sender_id === myId) return counts;
    if (Date.parse(message.created_at) <= Date.parse(getReadMarker(message.match_id))) {
      return counts;
    }

    counts[message.match_id] = (counts[message.match_id] ?? 0) + 1;
    return counts;
  }, {});
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

export default function VenueRoom() {
  const router = useRouter();
  const params = useParams<{ venueSlug: string }>();
  const venueSlug = params.venueSlug;

  const [me, setMe] = useState<PublicProfile | null>(null);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [pendingLikeIds, setPendingLikeIds] = useState<Set<string>>(new Set());
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());
  const [matches, setMatches] = useState<ActiveMatch[]>([]);
  const [unreadByMatchId, setUnreadByMatchId] = useState<Record<string, number>>(
    {}
  );
  const [newMatch, setNewMatch] = useState<ActiveMatch | null>(null);
  const [roomCount, setRoomCount] = useState<number | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [roomMenuOpen, setRoomMenuOpen] = useState(false);
  // The profile currently filling the viewport, so the single chrome ⋯ can
  // carry that person's safety actions (report/block). Tracked on feed scroll.
  const [currentVisibleId, setCurrentVisibleId] = useState<string | null>(null);
  // Matches float as a collapsed pill; tapping expands to the full strip.
  const [matchesExpanded, setMatchesExpanded] = useState(false);
  const [reportTarget, setReportTarget] = useState<PublicProfile | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>("harassment");
  const [reportNote, setReportNote] = useState("");
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [arrivalCue, setArrivalCue] = useState(false);
  // Bumped to re-run the bootstrap (the closed screen reopening the room).
  const [bootNonce, setBootNonce] = useState(0);
  const [blockTarget, setBlockTarget] = useState<PublicProfile | null>(null);
  const [blockReason, setBlockReason] = useState<ReportReason>("unsafe_behavior");
  const [blockNote, setBlockNote] = useState("");
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [showRoomHint, setShowRoomHint] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem(ROOM_HINT_DISMISS_KEY) !== "1"
  );
  const [emailPromptEligible, setEmailPromptEligible] = useState(false);
  const [emailPromptOpen, setEmailPromptOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [emailConsent, setEmailConsent] = useState(false);
  const [emailPromptState, setEmailPromptState] = useState<
    "idle" | "saving" | "success"
  >("idle");
  const [emailPromptError, setEmailPromptError] = useState("");
  const emailPromptElapsedRef = useRef(0);
  const emailPromptVenueSlugRef = useRef(venueSlug);

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
  const matchIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    meRef.current = me;
  }, [me]);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    matchIdsRef.current = new Set(matches.map((match) => match.id));
  }, [matches]);

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

    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      emailPromptElapsedRef.current += 1_000;
      if (emailPromptElapsedRef.current >= EMAIL_PROMPT_ACTIVE_MS) {
        setEmailPromptOpen(true);
      }
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [
    emailPromptEligible,
    emailPromptOpen,
    status,
    newMatch,
    reportTarget,
    blockTarget,
    roomMenuOpen,
  ]);

  useEffect(() => {
    if (!emailPromptOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && emailPromptState !== "saving") {
        dismissEmailPrompt();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    if (emailPromptState !== "success") return;
    const timeout = window.setTimeout(() => setEmailPromptOpen(false), 1_800);
    return () => window.clearTimeout(timeout);
  }, [emailPromptState]);

  // The feed's scroll container plus what it takes to keep the profile under
  // the thumb in place across list changes (see the anchoring layout effect).
  const feedRef = useRef<HTMLDivElement | null>(null);
  const feedIdsRef = useRef<string[]>([]);
  const anchorIdRef = useRef<string | null>(null);
  const arrivalCueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (arrivalCueTimerRef.current) clearTimeout(arrivalCueTimerRef.current);
    },
    []
  );

  function dismissRoomHint() {
    window.localStorage.setItem(ROOM_HINT_DISMISS_KEY, "1");
    setShowRoomHint(false);
  }

  const loadProfileById = useCallback(async (id: string) => {
    const { data } = await supabase
      .from("profiles")
      .select(PUBLIC_COLUMNS)
      .eq("id", id)
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
      myProfile: PublicProfile,
      profilePreviewEnabled: boolean
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
        .order("profile_id", { ascending: true });
      const now = Date.now();
      const profiles = (data ?? []).map((row) => ({
        ...(row.profiles as unknown as PublicProfile),
        checkedInAt: row.checked_in_at,
        justArrived: now - Date.parse(row.checked_in_at) < JUST_ARRIVED_MS,
      }));
      const compatibleProfiles = profiles.filter((p) =>
        isMutuallyCompatible(myProfile, p)
      );
      if (compatibleProfiles.length > 0 || !profilePreviewEnabled) {
        return compatibleProfiles;
      }

      const { data: previewRows } = await supabase.rpc("preview_room_profiles", {
        p_venue_id: venueId,
      });
      return ((previewRows ?? []) as PreviewProfileRow[]).map((profile) => ({
        id: profile.id,
        first_name: profile.first_name,
        photo_url: profile.photo_url,
        bio: profile.bio,
        gender: profile.gender,
        interested_in: profile.interested_in,
        checkedInAt: profile.profile_created_at,
        justArrived: false,
      }));
    },
    []
  );

  // How many people are visibly checked in to the whole room — not just
  // mutually compatible profiles. This is the waiting state's proof that the
  // night is real. Presence SELECT is RLS-scoped to venues you are currently
  // in (decisions 2026-06-19), so a plain count passes; only a number leaves
  // this function.
  const loadRoomCount = useCallback(async (venueId: string) => {
    const { count } = await supabase
      .from("presence")
      .select("id", { count: "exact", head: true })
      .eq("venue_id", venueId)
      .is("left_at", null)
      .eq("is_visible", true);
    return count;
  }, []);

  // Active matches for this venue night plus their unread counts. Shared by
  // the bootstrap and every resync (foreground return, realtime re-subscribe).
  const loadMatches = useCallback(
    async (venueId: string, myId: string) => {
      const { data: matchRows } = await supabase
        .from("matches")
        .select("id, profile_a, profile_b, expires_at")
        .eq("venue_id", venueId)
        .gt("expires_at", new Date().toISOString());
      const activeMatches = (
        await Promise.all(
          ((matchRows ?? []) as MatchRow[]).map(async (m) => {
            const otherId = m.profile_a === myId ? m.profile_b : m.profile_a;
            const other = await loadProfileById(otherId);
            return other ? { id: m.id, other } : null;
          })
        )
      ).filter((m): m is ActiveMatch => m !== null);
      const matchIds = activeMatches.map((match) => match.id);
      const { data: messageRows } =
        matchIds.length > 0
          ? await supabase
              .from("messages")
              .select("match_id, sender_id, created_at")
              .in("match_id", matchIds)
          : { data: [] };
      return {
        matches: activeMatches,
        unread: countUnreadMessages(
          (messageRows ?? []) as RoomMessage[],
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
    const myProfile = meRef.current;
    if (!venue || !myProfile) return;
    if (statusRef.current !== "ready" && statusRef.current !== "invisible") {
      return;
    }
    const [nextCandidates, count, matchState] = await Promise.all([
      statusRef.current === "ready"
        ? loadCandidates(
            venue.id,
            myProfile.id,
            myProfile,
            venue.profile_preview_enabled
          )
        : Promise.resolve<Candidate[]>([]),
      loadRoomCount(venue.id),
      loadMatches(venue.id, myProfile.id),
    ]);
    if (statusRef.current === "ready") setCandidates(nextCandidates);
    setRoomCount(count);
    const newlyMatched = matchState.matches.filter(
      (match) => !matchIdsRef.current.has(match.id)
    );
    setMatches(matchState.matches);
    setMatchedIds(new Set(matchState.matches.map((m) => m.other.id)));
    setUnreadByMatchId(matchState.unread);
    if (newlyMatched.length > 0) {
      setNewMatch((current) => current ?? newlyMatched[0]);
    }
  }, [venue, loadCandidates, loadRoomCount, loadMatches]);

  // Bootstrap: session, profile, venue, check-in, then the live room state.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const user = await ensureAnonSession();
        if (!active) return;

        // Next may retain this client component while only the dynamic slug
        // changes. Never show room-scoped data from the previous venue while
        // the new venue, presence, likes, and matches are loading.
        setStatus("loading");
        setErrorMsg("");
        setVenue(null);
        setMe(null);
        setCandidates([]);
        setLikedIds(new Set());
        setPendingLikeIds(new Set());
        setMatchedIds(new Set());
        setMatches([]);
        setUnreadByMatchId({});
        setNewMatch(null);
        setRoomCount(null);

        // The optional email prompt is global to the profile, but its timer
        // and dismissal state are specific to the current venue night.
        if (emailPromptVenueSlugRef.current !== venueSlug) {
          emailPromptVenueSlugRef.current = venueSlug;
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
          .select("id, name, city, is_live, profile_preview_enabled, timezone")
          .eq("slug", venueSlug)
          .maybeSingle();
        if (venueError) throw venueError;
        if (!active) return;
        if (!venueRow) {
          setStatus("notfound");
          return;
        }
        const { error: scanError } = await supabase.rpc("record_venue_scan", {
          p_venue_id: venueRow.id,
        });
        if (scanError) {
          console.warn("Could not record venue scan", scanError);
        }
        if (!active) return;

        setVenue(venueRow);

        // The venue exists but the night is not on. Show the closed screen —
        // it reopens itself when the founder flips the live switch.
        if (!venueRow.is_live) {
          setStatus("closed");
          return;
        }

        const profilePath = `/profile?venue=${encodeURIComponent(venueSlug)}`;
        const myProfile = await loadProfileById(user.id);
        if (!active) return;
        if (!myProfile) {
          router.replace(profilePath);
          return;
        }

        const { data: privateProfile, error: privateError } = await supabase
          .from("profile_private")
          .select(
            "adult_confirmed_at, email, email_marketing_consent_at"
          )
          .eq("id", user.id)
          .maybeSingle();
        if (privateError) throw privateError;
        if (!active) return;
        if (!privateProfile?.adult_confirmed_at) {
          router.replace(profilePath);
          return;
        }

        setEmail(privateProfile.email ?? "");
        const subscribed =
          Boolean(
            privateProfile.email && privateProfile.email_marketing_consent_at
          ) || window.localStorage.getItem(EMAIL_SUBSCRIBED_KEY) === "1";
        const dismissedTonight =
          window.localStorage.getItem(
            emailPromptDismissKey(venueRow.timezone)
          ) === "1";
        setEmailPromptEligible(!subscribed && !dismissedTonight);

        setMe(myProfile);

        // Scanning the QR = checking in. This must land before we read other
        // profiles: the tightened RLS only lets you see who shares your room.
        const { data: presenceRow, error: checkInError } = await supabase.rpc("check_in", {
          p_venue_id: venueRow.id,
        });
        if (checkInError) {
          // Race: the founder flipped the venue off between our venue read and
          // the check-in. Same closed screen as the is_live gate above.
          if (checkInError.message?.includes("venue not live")) {
            if (active) setStatus("closed");
            return;
          }
          throw checkInError;
        }
        if (!active) return;
        const isVisible = presenceRow?.is_visible ?? true;

        const [candidatesData, roomCountData, { data: myLikes }, matchState] =
          await Promise.all([
            isVisible
              ? loadCandidates(
                  venueRow.id,
                  user.id,
                  myProfile,
                  venueRow.profile_preview_enabled
                )
              : Promise.resolve([]),
            loadRoomCount(venueRow.id),
            supabase
              .from("likes")
              .select("liked_id")
              .eq("venue_id", venueRow.id)
              .gt("expires_at", new Date().toISOString()),
            loadMatches(venueRow.id, user.id),
          ]);
        if (!active) return;

        setCandidates(candidatesData);
        setRoomCount(roomCountData);
        setLikedIds(new Set((myLikes ?? []).map((l) => l.liked_id)));
        setMatches(matchState.matches);
        setUnreadByMatchId(matchState.unread);
        setMatchedIds(new Set(matchState.matches.map((m) => m.other.id)));
        setStatus(isVisible ? "ready" : "invisible");
      } catch (e) {
        console.error(e);
        if (active) {
          setStatus("error");
          setErrorMsg(t[preferredLocale(browserLocale())].room.loadError);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [venueSlug, router, loadProfileById, loadCandidates, loadRoomCount, loadMatches, bootNonce]);

  // Heartbeat: keep our presence fresh while the room is open and the tab is
  // visible. check_in is idempotent — it just bumps last_seen_at. Coming back
  // to the foreground also resyncs the whole room: a phone in a bar spends
  // most of the night locked, and the realtime socket dies in the pocket.
  useEffect(() => {
    if (!venue || (status !== "ready" && status !== "invisible")) return;
    const beat = () => supabase.rpc("check_in", { p_venue_id: venue.id });
    const id = setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      beat();
      resyncRoom();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [venue, status, resyncRoom]);

  // The room opens and closes itself with the venue's live switch: on the
  // closed screen we watch venues.is_live and re-run the bootstrap the moment
  // a founder starts the night (plus a slow poll as the realtime fallback);
  // in the room, the switch turning off drops everyone to the closed screen.
  useEffect(() => {
    if (!venue) return;
    const reopen = () => {
      setStatus("loading");
      setBootNonce((nonce) => nonce + 1);
    };
    const channel = supabase
      .channel(`venue-live-${venue.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "venues",
          filter: `id=eq.${venue.id}`,
        },
        (payload) => {
          const nextVenue = payload.new as {
            is_live?: boolean;
            profile_preview_enabled?: boolean;
          };
          const live = nextVenue.is_live;
          if (typeof nextVenue.profile_preview_enabled === "boolean") {
            setVenue((current) =>
              current
                ? {
                    ...current,
                    profile_preview_enabled: nextVenue.profile_preview_enabled!,
                  }
                : current
            );
            if (statusRef.current === "ready") reopen();
          }
          if (live && statusRef.current === "closed") reopen();
          if (
            live === false &&
            (statusRef.current === "ready" || statusRef.current === "invisible")
          ) {
            setStatus("closed");
          }
        }
      )
      .subscribe();
    const poll = setInterval(async () => {
      if (statusRef.current !== "closed") return;
      const { data } = await supabase
        .from("venues")
        .select("is_live")
        .eq("id", venue.id)
        .maybeSingle();
      if (data?.is_live && statusRef.current === "closed") reopen();
    }, CLOSED_POLL_MS);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [venue]);

  // Realtime: the room fills and empties as people check in / leave. Pure
  // heartbeats (only last_seen_at moved) are skipped — presence has REPLICA
  // IDENTITY FULL so the old row tells us whether anything visible changed;
  // otherwise 30 phones beating every 2 minutes means a full room reload every
  // few seconds on every client. A short trailing throttle coalesces arrival
  // bursts, and a re-subscribe after a socket drop triggers a full resync.
  useEffect(() => {
    if (!venue || !me || status !== "ready") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastRefetch = 0;
    const refetch = async () => {
      lastRefetch = Date.now();
      const [next, count] = await Promise.all([
        loadCandidates(venue.id, me.id, me, venue.profile_preview_enabled),
        loadRoomCount(venue.id),
      ]);
      setCandidates(next);
      setRoomCount(count);
    };
    const scheduleRefetch = () => {
      if (timer) return;
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
      .channel(`presence-${venue.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "presence",
          filter: `venue_id=eq.${venue.id}`,
        },
        (payload) => {
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
        if (subscribeState !== "SUBSCRIBED") return;
        if (wasSubscribed) resyncRoom();
        wasSubscribed = true;
      });
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [venue, me, status, loadCandidates, loadRoomCount, resyncRoom]);

  // Realtime: a match unlocks the moment a reciprocal like lands (for either side).
  useEffect(() => {
    if (!venue) return;
    let wasSubscribed = false;
    const channel = supabase
      .channel(`matches-${venue.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "matches",
          filter: `venue_id=eq.${venue.id}`,
        },
        async (payload) => {
          const m = payload.new as MatchRow;
          const myId = meRef.current?.id;
          if (!myId || (m.profile_a !== myId && m.profile_b !== myId)) return;
          if (Date.parse(m.expires_at) <= Date.now()) return;
          const otherId = m.profile_a === myId ? m.profile_b : m.profile_a;
          const other = await loadProfileById(otherId);
          if (other) registerMatch({ id: m.id, other }, true);
        }
      )
      .subscribe((subscribeState) => {
        if (subscribeState !== "SUBSCRIBED") return;
        if (wasSubscribed) resyncRoom();
        wasSubscribed = true;
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [venue, loadProfileById, registerMatch, resyncRoom]);

  // Realtime: show a small unread badge when a new message lands in one of my
  // active conversations. This reduces uncertainty without adding read receipts.
  useEffect(() => {
    if (!me || matches.length === 0 || (status !== "ready" && status !== "invisible")) {
      return;
    }

    let wasSubscribed = false;
    const channel = supabase
      .channel(`room-messages-${me.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const message = payload.new as RoomMessage;
          if (!matchIdsRef.current.has(message.match_id)) return;
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
        if (subscribeState !== "SUBSCRIBED") return;
        if (wasSubscribed) resyncRoom();
        wasSubscribed = true;
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matches.length, me, status, resyncRoom]);

  // Re-derive "just arrived" once a minute so tags expire even in a quiet room
  // (the clock is only read in callbacks — render stays pure).
  useEffect(() => {
    if (status !== "ready") return;
    const id = setInterval(() => {
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
    return () => clearInterval(id);
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
    if (prevIds.length > 0 && ids.some((id) => !prevIds.includes(id))) {
      setArrivalCue(true);
      if (arrivalCueTimerRef.current) clearTimeout(arrivalCueTimerRef.current);
      arrivalCueTimerRef.current = setTimeout(() => setArrivalCue(false), 5_000);
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
          .gt("expires_at", new Date().toISOString())
      : await supabase.from("likes").insert({
          liker_id: me.id,
          liked_id: candidate.id,
          venue_id: venue.id,
        });

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
      setErrorMsg(wasLiked ? s.unlikeError : s.likeError);
      return;
    }

    setErrorMsg("");
    if (wasLiked) return;

    // If they had already liked me, the trigger just created the match. Realtime
    // will deliver it, but check directly too so the reveal feels instant.
    const { data: match } = await supabase
      .from("matches")
      .select("id, profile_a, profile_b, expires_at")
      .eq("venue_id", venue.id)
      .or(`profile_a.eq.${candidate.id},profile_b.eq.${candidate.id}`)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (match) registerMatch({ id: match.id, other: candidate }, true);
  }

  async function blockProfile(
    profile: PublicProfile,
    reason: ReportReason,
    note: string
  ) {
    if (!me) return;
    const { error } = await supabase.from("blocks").insert({
      blocker_id: me.id,
      blocked_id: profile.id,
      venue_id: venue?.id ?? null,
      reason,
      note: note.trim() || null,
    });
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
    setErrorMsg("");
  }

  async function submitBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!blockTarget) return;
    if (blockReason === "other" && !blockNote.trim()) {
      setErrorMsg(s.reportNote);
      return;
    }
    if (!window.confirm(s.blockConfirm(blockTarget.first_name))) return;
    await blockProfile(blockTarget, blockReason, blockNote);
  }

  function openReport(profile: PublicProfile) {
    setReportTarget(profile);
    setReportReason("harassment");
    setReportNote("");
    setReportSubmitted(false);
    setErrorMsg("");
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!me || !reportTarget) return;

    const { error } = await supabase.from("reports").insert({
      reporter_id: me.id,
      reported_id: reportTarget.id,
      venue_id: venue?.id ?? null,
      reason: reportReason,
      note: reportNote.trim() || null,
    });
    if (error) {
      console.error(error);
      setErrorMsg(s.reportError);
      return;
    }

    setReportSubmitted(true);
    setErrorMsg("");
  }

  async function goInvisible() {
    if (!me) return;
    const { error } = await supabase
      .from("presence")
      .update({ is_visible: false })
      .eq("profile_id", me.id)
      .is("left_at", null);
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
    if (!me || !venue) return;
    const { error } = await supabase
      .from("presence")
      .update({ is_visible: true })
      .eq("profile_id", me.id)
      .eq("venue_id", venue.id)
      .is("left_at", null);
    if (error) {
      console.error(error);
      setErrorMsg(s.visibilityError);
      return;
    }
    const [nextCandidates, count] = await Promise.all([
      loadCandidates(venue.id, me.id, me, venue.profile_preview_enabled),
      loadRoomCount(venue.id),
    ]);
    setCandidates(nextCandidates);
    setRoomCount(count);
    setStatus("ready");
    setErrorMsg("");
  }

  // Explicit control over your own presence (women-first): leave the room and
  // disappear from it immediately, without waiting for the nightly rollover.
  async function leave() {
    if (!me) return;
    await supabase
      .from("presence")
      .update({ left_at: new Date().toISOString() })
      .eq("profile_id", me.id)
      .is("left_at", null);
    setStatus("left");
  }

  async function rejoin() {
    if (!venue || !me) return;
    setStatus("loading");
    const { error } = await supabase.rpc("check_in", { p_venue_id: venue.id });
    if (error) {
      console.error(error);
      setStatus("error");
      setErrorMsg(s.loadError);
      return;
    }
    const [nextCandidates, count] = await Promise.all([
      loadCandidates(venue.id, me.id, me, venue.profile_preview_enabled),
      loadRoomCount(venue.id),
    ]);
    setCandidates(nextCandidates);
    setRoomCount(count);
    setStatus("ready");
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

  async function submitEmailPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!me || !emailConsent || emailPromptState === "saving") return;

    const normalizedEmail = email.trim().toLowerCase();
    setEmailPromptState("saving");
    setEmailPromptError("");
    const { error } = await supabase
      .from("profile_private")
      .update({
        email: normalizedEmail,
        email_marketing_consent_at: new Date().toISOString(),
        email_marketing_consent_version: EMAIL_CONSENT_VERSION,
      })
      .eq("id", me.id);

    if (error) {
      console.error(error);
      setEmailPromptState("idle");
      setEmailPromptError(s.emailPromptError);
      return;
    }

    setEmail(normalizedEmail);
    window.localStorage.setItem(EMAIL_SUBSCRIBED_KEY, "1");
    setEmailPromptEligible(false);
    setEmailPromptState("success");
  }

  if (status === "loading") {
    // Entering = a designed doorway (#103), not a spinner: the check-in RPC
    // runs while this shows, and the venue name lands mid-bootstrap so the
    // threshold names the place before it hands off to the feed. The live-dot
    // beats red because the room really is live.
    return (
      <EntryThreshold ember>
        <p className="wordmark text-lg text-cream">Amourette</p>
        {venue ? (
          <>
            <p className="night-kicker mt-14">{s.enterKicker}</p>
            <h1 className="font-display mt-3 text-[2.5rem] font-medium leading-[1.03] text-cream">
              {venue.name}
            </h1>
            <hr className="hairline mt-6 w-28" />
            <p className="night-kicker mt-5 inline-flex items-center gap-2.5">
              <LiveDot />
              {venue.city ? `${venue.city} · ${s.enterLiveTag}` : s.enterLiveTag}
            </p>
          </>
        ) : (
          <span className="mt-14">
            <LiveDot />
          </span>
        )}
        <p className="night-muted mt-7 max-w-[17rem] leading-relaxed">
          {venue ? s.enterReassure : s.entering}
        </p>
      </EntryThreshold>
    );
  }

  if (status === "error") {
    // A real technical failure (anonymous sign-in off, etc.) — neutral tone,
    // no live-dot, no ember: nothing here is live.
    return (
      <EntryThreshold>
        <p className="wordmark text-lg text-cream">Amourette</p>
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
        <p className="wordmark text-lg text-cream">Amourette</p>
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

  if (status === "closed") {
    // The venue is real but the night is not on. This screen reopens itself:
    // the venues watcher re-runs the bootstrap when is_live flips. Dormant
    // (taupe) dot — nothing is live yet.
    return (
      <EntryThreshold ember>
        <p className="wordmark text-lg text-cream">Amourette</p>
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

  if (status === "left") {
    // You stepped out yourself: no longer visible. The one entry state with a
    // red CTA — coming back is the action.
    return (
      <EntryThreshold ember>
        <p className="wordmark text-lg text-cream">Amourette</p>
        <p className="night-kicker mt-14 inline-flex items-center gap-2.5">
          <LiveDot dormant />
          {venue?.city ? `${venue.name} · ${venue.city}` : venue?.name ?? ""}
        </p>
        <h1 className="font-display mt-4 text-3xl font-medium leading-tight text-cream">
          {s.leftTitle}
        </h1>
        <hr className="hairline mt-6 w-28" />
        <p className="night-muted mt-6 max-w-[17rem] leading-relaxed">
          {s.leftBody}
        </p>
        <button
          onClick={rejoin}
          className="night-button night-button-primary mt-8 w-full max-w-xs px-5 py-4"
        >
          {s.rejoin}
        </button>
      </EntryThreshold>
    );
  }

  if (status === "invisible") {
    return (
      <main className="night-shell px-5 py-8 text-cream sm:px-6 sm:py-10">
        <div className="fixed right-5 top-5 z-20">
          <LanguageSelector />
        </div>
        <div className="night-content mx-auto max-w-3xl">
          <p className="wordmark text-xl text-cream">Amourette</p>
          <h1 className="font-display mt-4 text-5xl font-medium leading-tight">
            {s.invisibleTitle}
          </h1>
          <p className="night-muted mt-4 max-w-xl leading-relaxed">
            {s.invisibleBody}
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <button
              onClick={becomeVisible}
              className="night-button night-button-primary px-5 py-4"
            >
              {s.becomeVisible}
            </button>
            <button
              onClick={leave}
              className="night-button night-button-secondary px-5 py-4"
            >
              {s.leave}
            </button>
          </div>
          {matches.length > 0 && (
            <section className="mt-10">
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
                      <ProfilePhoto
                        src={match.other.photo_url}
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
          {errorMsg && <p className="mt-6 text-sm text-blush">{errorMsg}</p>}
        </div>
      </main>
    );
  }

  const visible = candidates.filter((c) => !matchedIds.has(c.id));
  // The profile in view (falls back to the top card before the first scroll).
  // Its safety actions live in the single chrome ⋯.
  const currentCandidate =
    visible.find((c) => c.id === currentVisibleId) ?? visible[0] ?? null;
  const totalUnread = matches.reduce(
    (sum, m) => sum + (unreadByMatchId[m.id] ?? 0),
    0
  );
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
            <p
              className="wordmark text-lg text-cream"
              style={{ textShadow: "0 1px 18px rgba(18,10,15,.9)" }}
            >
              Amourette
            </p>
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
              onClick={() => setRoomMenuOpen((open) => !open)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-champagne/25 bg-velvet/60 text-lg leading-none text-cream backdrop-blur"
            >
              ⋯
            </button>
            {roomMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setRoomMenuOpen(false)}
                />
                <div className="night-panel absolute right-0 z-50 mt-2 grid w-56 gap-2 p-2">
                  {/* This person, safety (blush, never red). */}
                  {currentCandidate && (
                    <>
                      <p className="px-2 pt-1 font-label text-[10px] uppercase tracking-[0.2em] text-taupe">
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
                      leave();
                    }}
                    className="night-button night-button-secondary px-4 py-3 text-xs"
                  >
                    {s.leave}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Matches: a collapsed pill (overlapping avatars + count + unread) that
            expands to the full strip on tap; both float over the photo and never
            push it. Tap outside the strip to collapse. */}
        {matches.length > 0 && (
          <div className="absolute inset-x-0 top-[96px] z-20 px-5">
            {matchesExpanded ? (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMatchesExpanded(false)}
                />
                <div className="relative z-20 flex items-center gap-2 overflow-x-auto pb-1">
                  {matches.map((match) => (
                    <div
                      key={match.id}
                      className="night-card-hot flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-1 backdrop-blur"
                    >
                      <Link
                        href={`/chat/${match.id}`}
                        className="flex items-center gap-2 transition hover:opacity-80"
                        aria-label={s.openConversation(match.other.first_name)}
                      >
                        <span className="relative">
                          <ProfilePhoto
                            src={match.other.photo_url}
                            name={match.other.first_name}
                            className="night-photo-ring h-9 w-9 rounded-full object-cover"
                          />
                          {(unreadByMatchId[match.id] ?? 0) > 0 && (
                            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-blush px-1 text-[10px] font-semibold text-ink">
                              {unreadByMatchId[match.id]}
                            </span>
                          )}
                        </span>
                        <span className="text-sm font-medium text-cream">
                          {match.other.first_name}
                        </span>
                      </Link>
                      <ProfileActions
                        name={match.other.first_name}
                        open={actionMenuId === match.other.id}
                        onToggle={() =>
                          setActionMenuId((current) =>
                            current === match.other.id ? null : match.other.id
                          )
                        }
                        onReport={() => {
                          setActionMenuId(null);
                          openReport(match.other);
                        }}
                        onBlock={() => {
                          setActionMenuId(null);
                          openBlock(match.other);
                        }}
                        s={s}
                        compact
                      />
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
                  {matches.slice(0, 3).map((match, i) => (
                    <ProfilePhoto
                      key={match.id}
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
        {errorMsg && !reportTarget && (
          <div className="pointer-events-none absolute inset-x-0 top-[150px] z-20 flex justify-center px-5">
            <p className="night-pill pointer-events-auto rounded-full bg-velvet/80 px-3 py-1.5 text-blush backdrop-blur">
              {errorMsg}
            </p>
          </div>
        )}

        {visible.length === 0 ? (
          /* The wait is a room filling up, not a dead end: live counter,
             honest "go enjoy your night" copy, and a profile-polish CTA. The
             feed takes over automatically when the first profile arrives. */
          <div className="flex h-full flex-col items-center justify-center overflow-y-auto px-6 py-8">
            <div className="night-panel w-full max-w-sm p-8 text-center">
              <p className="night-kicker">{venue?.name ?? ""}</p>
              {/* You are visibly checked in on this screen, so an honest count
                  is >= 1. 0 or null means the query failed or RLS filtered it
                  out — hide the counter rather than show a false empty room. */}
              {roomCount !== null && roomCount > 0 && (
                <>
                  <p className="font-display mt-6 text-6xl font-medium leading-none text-cream">
                    {roomCount}
                  </p>
                  <p className="mt-2 text-sm text-taupe">
                    {s.roomCount(roomCount)}
                  </p>
                </>
              )}
              <hr className="hairline mt-6" />
              <h2 className="font-display mt-6 text-3xl font-medium">
                {s.waitingTitle}
              </h2>
              <p className="night-muted mt-3 leading-relaxed">{s.waitingBody}</p>
              <div className="mt-7 grid gap-3">
                <Link
                  href={polishPath}
                  className="night-button night-button-secondary px-5 py-3 text-center text-xs"
                >
                  {s.polishProfile}
                </Link>
                <button
                  onClick={leave}
                  className="night-button night-button-secondary px-5 py-3 text-xs"
                >
                  {s.leave}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* One profile per viewport: recognition, not evaluation. Scrolling
             past someone stores and shows nothing — you can always come back. */
          <div
            ref={feedRef}
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
                  onToggleLike={() => toggleLike(c)}
                />
              );
            })}
          </div>
        )}

        {/* Someone new appended below: a cue, never a shift under the thumb. */}
        {arrivalCue && !showRoomHint && visible.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center">
            <button
              type="button"
              onClick={jumpToNewestArrival}
              className="night-pill pointer-events-auto rounded-full bg-velvet/70 px-3 py-1.5 backdrop-blur"
            >
              {s.newArrivalCue}
            </button>
          </div>
        )}

        {/* One-time hint: a slim dismissible banner, placed below the floating
            chrome header so it never overlaps the brand/venue/live line. */}
        {showRoomHint && visible.length > 0 && (
          <div className="night-panel absolute inset-x-4 top-[120px] z-10 flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-medium text-cream">
                {s.firstTimeHintTitle}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-taupe">
                {s.firstTimeHintBody}
              </p>
            </div>
            <button
              type="button"
              onClick={dismissRoomHint}
              className="night-button night-button-secondary shrink-0 px-3 py-2 text-xs"
            >
              {s.firstTimeHintDismiss}
            </button>
          </div>
        )}
      </div>

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
            <p className="wordmark text-center text-xl text-cream">Amourette</p>

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
                    <ProfilePhoto
                      src={me.photo_url}
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
                  <ProfilePhoto
                    src={newMatch.other.photo_url}
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
        emailPromptVenueSlugRef.current === venueSlug &&
        !newMatch &&
        !reportTarget &&
        !blockTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="email-prompt-title"
          className="fixed inset-0 z-40 flex items-center justify-center bg-velvet/85 px-6"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              emailPromptState !== "saving"
            ) {
              dismissEmailPrompt();
            }
          }}
        >
          <form
            onSubmit={submitEmailPrompt}
            className="night-panel relative w-full max-w-sm rounded-[2rem] p-6"
          >
            {emailPromptState !== "saving" && (
              <button
                type="button"
                aria-label={s.emailPromptClose}
                onClick={dismissEmailPrompt}
                className="night-button night-button-secondary absolute right-4 top-4 h-9 w-9 p-0 text-lg"
              >
                ×
              </button>
            )}
            <p className="wordmark text-lg text-cream">Amourette</p>
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
                  maxLength={254}
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
        </div>
      )}

      {reportTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-velvet/85 px-6">
          <form
            onSubmit={submitReport}
            className="night-panel w-full max-w-sm rounded-[2rem] p-6"
          >
            <h2 className="font-display text-2xl font-medium">
              {s.reportTitle(reportTarget.first_name)}
            </h2>
            {reportSubmitted ? (
              <>
                <p className="mt-4 text-taupe">{s.reportSuccess}</p>
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
                    {s.reportCancel}
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="mt-5 block text-sm font-medium text-taupe">
                  {s.reportReason}
                  <select
                    value={reportReason}
                    onChange={(event) =>
                      setReportReason(event.target.value as ReportReason)
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
                  value={reportNote}
                  onChange={(event) => setReportNote(event.target.value)}
                  maxLength={500}
                  placeholder={s.reportNote}
                  className="night-input mt-4 h-28 resize-none px-4 py-3"
                />
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
        </div>
      )}

      {blockTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-velvet/85 px-6">
          <form
            onSubmit={submitBlock}
            className="night-panel w-full max-w-sm rounded-[2rem] p-6"
          >
            <h2 className="font-display text-2xl font-medium">
              {s.blockTitle(blockTarget.first_name)}
            </h2>
            <label className="mt-5 block text-sm font-medium text-taupe">
              {s.reportReason}
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
              maxLength={500}
              required={blockReason === "other"}
              placeholder={
                blockReason === "other" ? `${s.reportNote} · required` : s.reportNote
              }
              className="night-input mt-4 h-28 resize-none px-4 py-3"
            />
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
        </div>
      )}
    </main>
  );
}

type RoomStrings = (typeof t)["en"]["room"];

// Room feed card — hero #1, "Sous les projecteurs" (docs/design.md). One
// full-viewport card per person: the photo IS the card, the person emerges
// from a warm key light on near-black, and a layered night treatment (grade →
// key → vignette → grain, in .room-* classes) keeps any photo legible and
// pulls every face into the same venue darkness. The room count lives once, in
// the on-photo header; the ♥ is "red present" (filled red at rest, blooms on
// tap). Presentational: all data + state come through props, so the real feed
// and the styleguide/preview share one source of truth.
function RoomFeedCard({
  candidate,
  liked,
  likePending,
  expanded,
  s,
  onToggleBio,
  onToggleLike,
}: {
  candidate: Candidate;
  liked: boolean;
  likePending: boolean;
  expanded: boolean;
  s: RoomStrings;
  onToggleBio: () => void;
  onToggleLike: () => void;
}) {
  const c = candidate;
  return (
    <section
      onClick={onToggleBio}
      className="relative h-full snap-start snap-always overflow-hidden bg-bordeaux"
    >
      {/* Full-bleed cinematic photo: the photo IS the card. bg-bordeaux under
          it is the loading/empty ground — never a white flash. */}
      <ProfilePhoto
        src={c.photo_url}
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
      {/* No on-photo header: brand, venue, live count and the single context
          menu (with this person's safety actions) all live in the persistent
          room chrome now, so the card is pure identity. */}
      {/* Centered identity block: arrival kicker, name, bio, one short champagne
          hairline, the "red present" heart pill. Rises softly on mount. */}
      <div className="room-card-enter absolute inset-x-6 bottom-11 text-center">
        {c.justArrived && (
          <p className="night-kicker mb-3 text-[10px]">{s.justArrived}</p>
        )}
        <h2
          className="wordmark text-[3.25rem] leading-[0.96] text-cream"
          style={{ textShadow: "0 1px 22px rgba(18,10,15,.7)" }}
        >
          {c.first_name}
        </h2>
        {c.bio && (
          // Clamped to 2 lines by default so a long bio can never push the
          // heart off-screen; tap anywhere on the card to unfold.
          <p
            className={`mx-auto mt-3 max-w-[250px] font-body text-sm font-light leading-relaxed ${
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
function ProfilePhoto({
  src,
  name,
  className,
  initialClassName = "text-xl",
}: {
  src: string;
  name: string;
  className: string;
  initialClassName?: string;
}) {
  // Failure is remembered per URL: a new src (profile edit, different person)
  // automatically retries, with no effect or reset needed.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = failedSrc === src;

  if (failed) {
    return (
      <div
        aria-label={name}
        className={`${className} flex items-center justify-center bg-bordeaux`}
      >
        <span className={`font-display text-taupe ${initialClassName}`}>
          {name.charAt(0).toUpperCase()}
        </span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(src)}
      className={className}
    />
  );
}

// Report/block live behind this ⋯ trigger: one tap opens a small action sheet,
// so safety stays immediately reachable (women-first) without every profile
// reading as a threat. An action sheet, not an anchored dropdown — the matches
// strip scrolls horizontally and would clip a dropdown.
function ProfileActions({
  name,
  open,
  onToggle,
  onReport,
  onBlock,
  s,
  compact = false,
}: {
  name: string;
  open: boolean;
  onToggle: () => void;
  onReport: () => void;
  onBlock: () => void;
  s: RoomStrings;
  compact?: boolean;
}) {
  return (
    <>
      <button
        type="button"
        aria-label={s.profileActions}
        // stopPropagation: on a feed card the surrounding section's tap
        // toggles the bio — safety actions must never double as that.
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        className={
          compact
            ? "flex h-7 w-7 items-center justify-center rounded-full text-base leading-none text-taupe transition hover:text-cream"
            : "flex h-10 w-10 items-center justify-center rounded-full border border-champagne/25 bg-velvet/60 text-lg leading-none text-cream"
        }
      >
        ⋯
      </button>
      {open && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-velvet/70 px-5 pb-8"
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
        >
          <div
            className="night-panel w-full max-w-sm p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="night-kicker">{name}</p>
            <div className="mt-3 grid gap-2">
              <button
                type="button"
                onClick={onReport}
                className="night-button night-button-secondary px-4 py-3 text-xs"
              >
                {s.report}
              </button>
              <button
                type="button"
                onClick={onBlock}
                className="night-button night-button-danger px-4 py-3 text-xs"
              >
                {s.block}
              </button>
              <button
                type="button"
                onClick={onToggle}
                className="night-button px-4 py-3 text-xs text-taupe transition hover:text-cream"
              >
                {s.reportCancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
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
      <div className="fixed right-5 top-5 z-20">
        <LanguageSelector />
      </div>
      {ember && <div className="entry-ember" aria-hidden />}
      <div className="night-content animate-curtain flex w-full max-w-sm flex-col items-center text-center">
        {children}
      </div>
    </main>
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
