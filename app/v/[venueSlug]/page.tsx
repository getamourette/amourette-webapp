"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ensureAnonSession } from "@/lib/auth";
import { APP_STORE_URL, GOOGLE_PLAY_URL } from "@/lib/config";
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

// A room candidate is a public profile plus a "just arrived" cue, computed at
// fetch time (render must stay pure). The feed is ordered by arrival (newest
// first) so it never reshuffles under the thumb.
type Candidate = PublicProfile & { justArrived: boolean };

type Venue = Pick<
  Database["public"]["Tables"]["venues"]["Row"],
  "id" | "name" | "city"
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
const PROMO_DISMISS_KEY = "paramour-promo-dismissed";
const ROOM_HINT_DISMISS_KEY = "paramour-room-hint-dismissed";

type Status = "loading" | "ready" | "error" | "left" | "invisible";

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
  const [showPromo, setShowPromo] = useState(false);
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

  // Keep the latest "me" available to realtime callbacks without resubscribing.
  const meRef = useRef<PublicProfile | null>(null);
  const matchIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    meRef.current = me;
  }, [me]);
  useEffect(() => {
    matchIdsRef.current = new Set(matches.map((match) => match.id));
  }, [matches]);

  function dismissPromo() {
    window.localStorage.setItem(PROMO_DISMISS_KEY, "1");
    setShowPromo(false);
  }

  function maybeShowPromoAfterLike() {
    if (window.localStorage.getItem(PROMO_DISMISS_KEY) === "1") return;
    setShowPromo(true);
  }

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
  // Ordered by check-in time (newest first) so the feed is stable across
  // refetches: arrivals land on top, nobody reshuffles mid-scroll.
  const loadCandidates = useCallback(
    async (venueId: string, myId: string, myProfile: PublicProfile) => {
      const { data } = await supabase
        .from("presence")
        .select(`checked_in_at, profiles!inner(${PUBLIC_COLUMNS})`)
        .eq("venue_id", venueId)
        .is("left_at", null)
        .neq("profile_id", myId)
        .order("checked_in_at", { ascending: false });
      const now = Date.now();
      const profiles = (data ?? []).map((row) => ({
        ...(row.profiles as unknown as PublicProfile),
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

  // Bootstrap: session, profile, venue, check-in, then the live room state.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const user = await ensureAnonSession();

        const { data: venueRow, error: venueError } = await supabase
          .from("venues")
          .select("id, name, city")
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
        setVenue(venueRow);

        // Scanning the QR = checking in. This must land before we read other
        // profiles: the tightened RLS only lets you see who shares your room.
        const { data: presenceRow, error: checkInError } = await supabase.rpc("check_in", {
          p_venue_id: venueRow.id,
        });
        if (checkInError) throw checkInError;
        if (!active) return;
        const isVisible = presenceRow?.is_visible ?? true;

        const [candidatesData, roomCountData, { data: myLikes }, { data: myMatches }] =
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
            supabase
              .from("matches")
              .select("id, profile_a, profile_b, expires_at")
              .eq("venue_id", venueRow.id)
              .gt("expires_at", new Date().toISOString()),
          ]);
        if (!active) return;

        const activeMatches = (
          await Promise.all(
            ((myMatches ?? []) as MatchRow[]).map(async (m) => {
              const otherId = m.profile_a === user.id ? m.profile_b : m.profile_a;
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

        setCandidates(candidatesData);
        setRoomCount(roomCountData);
        setLikedIds(new Set((myLikes ?? []).map((l) => l.liked_id)));
        setMatches(activeMatches);
        setUnreadByMatchId(
          countUnreadMessages((messageRows ?? []) as RoomMessage[], user.id)
        );
        setMatchedIds(new Set(activeMatches.map((m) => m.other.id)));
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
  }, [venueSlug, router, loadProfileById, loadCandidates, loadRoomCount]);

  // Heartbeat: keep our presence fresh while the room is open and the tab is
  // visible. check_in is idempotent — it just bumps last_seen_at.
  useEffect(() => {
    if (!venue || (status !== "ready" && status !== "invisible")) return;
    const beat = () => supabase.rpc("check_in", { p_venue_id: venue.id });
    const id = setInterval(beat, HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [venue, status]);

  // Realtime: the room fills and empties as people check in / leave.
  useEffect(() => {
    if (!venue || !me || status !== "ready") return;
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
        async () => {
          const [next, count] = await Promise.all([
            loadCandidates(venue.id, me.id, me),
            loadRoomCount(venue.id),
          ]);
          setCandidates(next);
          setRoomCount(count);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [venue, me, status, loadCandidates, loadRoomCount]);

  // Realtime: a match unlocks the moment a reciprocal like lands (for either side).
  useEffect(() => {
    if (!venue) return;
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [venue, loadProfileById, registerMatch]);

  // Realtime: show a small unread badge when a new message lands in one of my
  // active conversations. This reduces uncertainty without adding read receipts.
  useEffect(() => {
    if (!me || matches.length === 0 || (status !== "ready" && status !== "invisible")) {
      return;
    }

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matches.length, me, status]);

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

    maybeShowPromoAfterLike();
  }

  async function blockProfile(profile: PublicProfile) {
    if (!me) return;
    const { error } = await supabase.from("blocks").insert({
      blocker_id: me.id,
      blocked_id: profile.id,
      venue_id: venue?.id ?? null,
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
    setReportSubmitted(false);
    setErrorMsg("");
  }

  async function confirmBlock(profile: PublicProfile) {
    if (!window.confirm(s.blockConfirm(profile.first_name))) return;
    await blockProfile(profile);
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
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={match.other.photo_url}
                        alt={match.other.first_name}
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
            <LanguageSelector />
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
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={match.other.photo_url}
                      alt={match.other.first_name}
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
                    confirmBlock(match.other);
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
          <div className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain">
            {visible.map((c) => {
              const liked = likedIds.has(c.id);
              return (
                <section
                  key={c.id}
                  className="relative h-full snap-start snap-always overflow-hidden"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.photo_url}
                    alt={c.first_name}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="feed-scrim absolute inset-0" />
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
                        confirmBlock(c);
                      }}
                      s={s}
                    />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 p-5 pb-7">
                    <h2 className="wordmark text-4xl font-semibold text-cream">
                      {c.first_name}
                    </h2>
                    {c.bio && (
                      <p className="mt-2 text-sm leading-relaxed text-taupe">
                        {c.bio}
                      </p>
                    )}
                    <button
                      onClick={() => like(c)}
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
                    <p className="mt-2 text-center text-xs font-medium text-taupe">
                      {s.likeHint}
                    </p>
                  </div>
                </section>
              );
            })}
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={newMatch.other.photo_url}
            alt={newMatch.other.first_name}
            className="mx-auto mt-6 h-32 w-32 rounded-full object-cover shadow-[0_0_0_1px_rgba(244,235,225,0.5)]"
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
                    onClick={() => blockProfile(reportTarget)}
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

      {showPromo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-velvet/85 px-6">
          <div className="night-panel w-full max-w-md rounded-[2rem] p-7">
            <p className="wordmark text-xl text-cream">Amourette</p>
            <h2 className="font-display mt-3 text-3xl font-medium">{s.promoTitle}</h2>
            <p className="mt-3 text-taupe">{s.promoBody}</p>
            <div className="mt-7 grid gap-3">
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noreferrer"
                className="night-button night-button-primary px-5 py-3 text-center"
              >
                {s.promoPrimary}
              </a>
              <a
                href={GOOGLE_PLAY_URL}
                target="_blank"
                rel="noreferrer"
                className="night-button night-button-secondary px-5 py-3 text-center"
              >
                {s.promoSecondary}
              </a>
              <button
                type="button"
                onClick={dismissPromo}
                className="night-button px-5 py-3 text-center text-sm text-taupe transition hover:text-cream"
              >
                {s.promoDismiss}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

type RoomStrings = (typeof t)["en"]["room"];

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
        onClick={onToggle}
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
          onClick={onToggle}
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
