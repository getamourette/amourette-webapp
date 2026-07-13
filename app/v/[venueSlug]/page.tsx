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
import { ensureVenueSession } from "@/lib/auth";
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
  "id" | "name" | "city" | "is_live"
>;

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

// "closed" = the venue exists but is_live is false: the night has not started,
// or the founder ended it. The screen reopens itself when the switch flips.
type Status = "loading" | "ready" | "error" | "left" | "invisible" | "closed";

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

export default function VenueRoom() {
  const router = useRouter();
  const params = useParams<{ venueSlug: string }>();
  const venueSlug = params.venueSlug;

  const [me, setMe] = useState<PublicProfile | null>(null);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());
  const [matches, setMatches] = useState<ActiveMatch[]>([]);
  const [unreadByMatchId, setUnreadByMatchId] = useState<Record<string, number>>(
    {}
  );
  const [newMatch, setNewMatch] = useState<ActiveMatch | null>(null);
  const [roomCount, setRoomCount] = useState<number | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [roomMenuOpen, setRoomMenuOpen] = useState(false);
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
    async (venueId: string, myId: string, myProfile: PublicProfile) => {
      const { data } = await supabase
        .from("presence")
        .select(`checked_in_at, profiles!inner(${PUBLIC_COLUMNS})`)
        .eq("venue_id", venueId)
        .is("left_at", null)
        .neq("profile_id", myId)
        .order("checked_in_at", { ascending: true });
      const now = Date.now();
      const profiles = (data ?? []).map((row) => ({
        ...(row.profiles as unknown as PublicProfile),
        checkedInAt: row.checked_in_at,
        justArrived: now - Date.parse(row.checked_in_at) < JUST_ARRIVED_MS,
      }));
      return profiles.filter((p) => isMutuallyCompatible(myProfile, p));
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
        ? loadCandidates(venue.id, myProfile.id, myProfile)
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
        const user = await ensureVenueSession(venueSlug);

        const { data: venueRow, error: venueError } = await supabase
          .from("venues")
          .select("id, name, city, is_live")
          .eq("slug", venueSlug)
          .maybeSingle();
        if (venueError) throw venueError;
        if (!active) return;
        if (!venueRow) {
          setStatus("error");
          setErrorMsg(
            t[preferredLocale(browserLocale())].room.venueNotFound
          );
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
          .select("adult_confirmed_at")
          .eq("id", user.id)
          .maybeSingle();
        if (privateError) throw privateError;
        if (!active) return;
        if (!privateProfile?.adult_confirmed_at) {
          router.replace(profilePath);
          return;
        }

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
              ? loadCandidates(venueRow.id, user.id, myProfile)
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
          const live = (payload.new as { is_live?: boolean }).is_live;
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
        loadCandidates(venue.id, me.id, me),
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
  }

  function jumpToNewestArrival() {
    const el = feedRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setArrivalCue(false);
  }

  async function like(candidate: PublicProfile) {
    if (!me || !venue) return;
    // Optimistic: the like is secret, so the only feedback is "you liked them".
    setLikedIds((prev) => new Set(prev).add(candidate.id));

    const { error } = await supabase.from("likes").insert({
      liker_id: me.id,
      liked_id: candidate.id,
      venue_id: venue.id,
    });
    if (error) {
      console.error(error);
      setLikedIds((prev) => {
        const next = new Set(prev);
        next.delete(candidate.id);
        return next;
      });
      setErrorMsg(s.likeError);
      return;
    }

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
      loadCandidates(venue.id, me.id, me),
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
      loadCandidates(venue.id, me.id, me),
      loadRoomCount(venue.id),
    ]);
    setCandidates(nextCandidates);
    setRoomCount(count);
    setStatus("ready");
  }

  if (status === "loading") {
    return (
      <Shell>
        <div className="mx-auto h-12 w-12 rounded-full border border-champagne/25 bg-bordeaux p-2">
          <span className="block h-full w-full animate-pulse rounded-full bg-blush" />
        </div>
        <p className="mt-5 text-base font-medium text-taupe">
          {s.entering}
        </p>
      </Shell>
    );
  }

  if (status === "error") {
    return (
      <Shell>
        <p className="text-sm text-blush">{errorMsg}</p>
      </Shell>
    );
  }

  if (status === "closed") {
    // The venue is real but the night is not on. This screen reopens itself:
    // the venues watcher re-runs the bootstrap when is_live flips.
    return (
      <Shell>
        <p className="night-kicker">{venue?.name ?? ""}</p>
        <h2 className="font-display mt-4 text-2xl font-medium">
          {s.closedTitle}
        </h2>
        <p className="night-muted mt-3 leading-relaxed">{s.closedBody}</p>
      </Shell>
    );
  }

  if (status === "left") {
    return (
      <Shell>
        <h2 className="font-display text-2xl font-medium">{s.leftTitle}</h2>
        <p className="night-muted mt-3">{s.leftBody}</p>
        <button
          onClick={rejoin}
          className="night-button night-button-primary mt-8 w-full px-5 py-4"
        >
          {s.rejoin}
        </button>
      </Shell>
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
  const profilePath = `/profile?venue=${encodeURIComponent(venueSlug)}`;

  return (
    <main className="night-shell flex h-dvh min-h-0 flex-col text-cream">
      {/* Compact sticky top bar: brand + venue, room controls, pinned matches. */}
      <header className="night-content z-20 shrink-0 border-b border-champagne/15 bg-velvet/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="wordmark text-lg text-cream">Amourette</p>
            <p className="night-kicker mt-1 truncate">
              {s.whosHere(venue?.name ?? "")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Your own door back to your profile — always one tap away. */}
            {me && (
              <Link
                href={profilePath}
                aria-label={s.editProfile}
                className="shrink-0 transition hover:opacity-80"
              >
                <ProfilePhoto
                  src={me.photo_url}
                  name={me.first_name}
                  className="night-photo-ring h-9 w-9 rounded-full object-cover"
                />
              </Link>
            )}
            <div className="relative">
              <button
                type="button"
                aria-label={s.roomActions}
                onClick={() => setRoomMenuOpen((open) => !open)}
                className="night-button night-button-secondary px-3.5 py-2 text-base leading-none"
              >
                ⋯
              </button>
              {roomMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setRoomMenuOpen(false)}
                  />
                  <div className="night-panel absolute right-0 z-20 mt-2 grid w-52 gap-2 p-2">
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
        </div>

        {/* Matches stay pinned above the feed: avatar + name + unread badge. */}
        {matches.length > 0 && (
          <div className="mx-auto mt-3 flex w-full max-w-md items-center gap-2 overflow-x-auto pb-1">
            {matches.map((match) => (
              <div
                key={match.id}
                className="night-card-hot flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-1"
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
        )}

        {errorMsg && !reportTarget && (
          <p className="mx-auto mt-2 w-full max-w-md text-sm text-blush">
            {errorMsg}
          </p>
        )}
      </header>

      {/* Phone-width column, centered on desktop — the room is a phone in a
          bar, never a grid. */}
      <div className="night-content relative mx-auto min-h-0 w-full max-w-md flex-1 sm:border-x sm:border-champagne/10">
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
                  href={profilePath}
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
              const expanded = expandedId === c.id;
              return (
                <section
                  key={c.id}
                  onClick={() =>
                    c.bio &&
                    setExpandedId((current) => (current === c.id ? null : c.id))
                  }
                  className="relative h-full snap-start snap-always overflow-hidden"
                >
                  <ProfilePhoto
                    src={c.photo_url}
                    name={c.first_name}
                    className="absolute inset-0 h-full w-full object-cover"
                    initialClassName="text-7xl"
                  />
                  <div className="feed-scrim absolute inset-0" />
                  {/* Reading the full bio deserves a calmer photo behind it. */}
                  {expanded && (
                    <div className="absolute inset-0 bg-velvet/55 transition-opacity" />
                  )}
                  <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4">
                    {c.justArrived ? (
                      <span className="night-pill rounded-full bg-velvet/60 px-3 py-1.5">
                        {s.justArrived}
                      </span>
                    ) : (
                      <span />
                    )}
                    <ProfileActions
                      name={c.first_name}
                      open={actionMenuId === c.id}
                      onToggle={() =>
                        setActionMenuId((current) =>
                          current === c.id ? null : c.id
                        )
                      }
                      onReport={() => {
                        setActionMenuId(null);
                        openReport(c);
                      }}
                      onBlock={() => {
                        setActionMenuId(null);
                        openBlock(c);
                      }}
                      s={s}
                    />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 p-5 pb-7">
                    <h2 className="wordmark text-4xl font-semibold text-cream">
                      {c.first_name}
                    </h2>
                    {c.bio && (
                      // Clamped by default so a long bio can never push the
                      // heart off-screen; tap anywhere on the card to unfold.
                      <p
                        className={`mt-2 text-sm leading-relaxed ${
                          expanded
                            ? "max-h-[45dvh] overflow-y-auto whitespace-pre-line text-cream"
                            : "line-clamp-2 text-taupe"
                        }`}
                      >
                        {c.bio}
                      </p>
                    )}
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        like(c);
                      }}
                      disabled={liked}
                      aria-label={liked ? s.liked : s.like}
                      className={`heart-button mt-5 w-full px-5 py-4 text-sm ${
                        liked ? "heart-liked cursor-default" : "heart-idle"
                      }`}
                    >
                      <span aria-hidden className="text-lg leading-none">
                        {liked ? "♥" : "♡"}
                      </span>
                      {liked ? s.liked : s.like}
                    </button>
                  </div>
                </section>
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

        {/* One-time hint, now a slim dismissible banner over the feed. */}
        {showRoomHint && visible.length > 0 && (
          <div className="night-panel absolute inset-x-4 top-4 z-10 flex items-center justify-between gap-3 p-4">
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
        // One of the only two full-red screens (docs/design.md): the match reveal.
        // A curtain rising, not a jackpot — no confetti, a slow fade.
        <div className="animate-curtain fixed inset-0 z-50 flex flex-col items-center justify-center bg-red-deep px-6 text-center text-cream">
          <p className="wordmark text-2xl text-cream">Amourette</p>
          <p className="night-kicker mt-8 text-blush">{s.matchKicker}</p>
          <ProfilePhoto
            src={newMatch.other.photo_url}
            name={newMatch.other.first_name}
            className="mx-auto mt-6 h-32 w-32 rounded-full object-cover shadow-[0_0_0_1px_rgba(244,235,225,0.5)]"
            initialClassName="text-4xl"
          />
          <h2 className="wordmark mt-6 text-5xl font-medium italic text-cream">
            {newMatch.other.first_name}
          </h2>
          <p className="mt-4 max-w-xs text-blush">{s.matchBody}</p>
          <div className="mt-10 grid w-full max-w-xs gap-3">
            <Link
              href={`/chat/${newMatch.id}`}
              className="night-button w-full bg-cream px-5 py-4 text-center text-red-deep"
            >
              {s.openChat}
            </Link>
            <button
              onClick={() => setNewMatch(null)}
              className="night-button w-full border border-cream/40 px-5 py-4 text-cream"
            >
              {s.matchDismiss}
            </button>
          </div>
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="night-shell flex min-h-screen items-center justify-center px-6 text-cream">
      <div className="fixed right-5 top-5 z-20">
        <LanguageSelector />
      </div>
      <div className="night-content night-panel w-full max-w-md rounded-[2rem] p-8 text-center">
        <p className="wordmark text-xl text-cream">Amourette</p>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
