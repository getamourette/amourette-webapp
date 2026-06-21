"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ensureAnonSession } from "@/lib/auth";
import { isMutuallyCompatible } from "@/lib/profile";
import { browserLocale, localeForCity, t } from "@/lib/strings";
import { useBrowserLocale } from "@/lib/useLocale";
import type { Database } from "@/lib/database.types";

// Public-facing profile: only the columns other users are ever allowed to see.
type PublicProfile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "first_name" | "photo_url" | "bio" | "gender" | "interested_in"
>;
const PUBLIC_COLUMNS = "id, first_name, photo_url, bio, gender, interested_in";

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
const ROOM_HINT_DISMISS_KEY = "bartap-room-hint-dismissed";

type Status = "loading" | "ready" | "error" | "left" | "invisible";

function readMarkerKey(matchId: string) {
  return `bartap-chat-read:${matchId}`;
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
  const [candidates, setCandidates] = useState<PublicProfile[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());
  const [matches, setMatches] = useState<ActiveMatch[]>([]);
  const [unreadByMatchId, setUnreadByMatchId] = useState<Record<string, number>>(
    {}
  );
  const [newMatch, setNewMatch] = useState<ActiveMatch | null>(null);
  const [reportTarget, setReportTarget] = useState<PublicProfile | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>("harassment");
  const [reportNote, setReportNote] = useState("");
  const [reportSubmitted, setReportSubmitted] = useState(false);
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
  const s = t[venue ? localeForCity(venue.city) : browserLoc].room;

  // Keep the latest "me" available to realtime callbacks without resubscribing.
  const meRef = useRef<PublicProfile | null>(null);
  const matchIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    meRef.current = me;
  }, [me]);
  useEffect(() => {
    matchIdsRef.current = new Set(matches.map((match) => match.id));
  }, [matches]);

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
  const loadCandidates = useCallback(
    async (venueId: string, myId: string, myProfile: PublicProfile) => {
      const { data } = await supabase
        .from("presence")
        .select(`profiles!inner(${PUBLIC_COLUMNS})`)
        .eq("venue_id", venueId)
        .is("left_at", null)
        .neq("profile_id", myId);
      const profiles = (data ?? []).map(
        (row) => row.profiles as unknown as PublicProfile
      );
      return profiles.filter((p) => isMutuallyCompatible(myProfile, p));
    },
    []
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

  // Bootstrap: session, profile, venue, check-in, then the live room state.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const user = await ensureAnonSession();

        const myProfile = await loadProfileById(user.id);
        if (!active) return;
        if (!myProfile) {
          router.replace("/profile");
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
          router.replace("/profile");
          return;
        }

        setMe(myProfile);

        const { data: venueRow, error: venueError } = await supabase
          .from("venues")
          .select("id, name, city")
          .eq("slug", venueSlug)
          .maybeSingle();
        if (venueError) throw venueError;
        if (!active) return;
        if (!venueRow) {
          setStatus("error");
          setErrorMsg(t[browserLocale()].room.venueNotFound);
          return;
        }
        setVenue(venueRow);

        // Scanning the QR = checking in. This must land before we read other
        // profiles: the tightened RLS only lets you see who shares your room.
        const { data: presenceRow, error: checkInError } = await supabase.rpc("check_in", {
          p_venue_id: venueRow.id,
        });
        if (checkInError) throw checkInError;
        if (!active) return;
        const isVisible = presenceRow?.is_visible ?? true;

        const [candidatesData, { data: myLikes }, { data: myMatches }] =
          await Promise.all([
            isVisible
              ? loadCandidates(venueRow.id, user.id, myProfile)
              : Promise.resolve([]),
            supabase.from("likes").select("liked_id").eq("venue_id", venueRow.id),
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
          setErrorMsg(t[browserLocale()].room.loadError);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [venueSlug, router, loadProfileById, loadCandidates]);

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
          const next = await loadCandidates(venue.id, me.id, me);
          setCandidates(next);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [venue, me, status, loadCandidates]);

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
    setCandidates(await loadCandidates(venue.id, me.id, me));
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
    setCandidates(await loadCandidates(venue.id, me.id, me));
    setStatus("ready");
  }

  if (status === "loading") {
    return (
      <Shell>
        <p className="text-sm text-zinc-500">{s.entering}</p>
      </Shell>
    );
  }

  if (status === "error") {
    return (
      <Shell>
        <p className="text-sm text-red-400">{errorMsg}</p>
      </Shell>
    );
  }

  if (status === "left") {
    return (
      <Shell>
        <h2 className="text-2xl font-black">{s.leftTitle}</h2>
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
      <main className="night-shell px-5 py-8 text-white sm:px-6 sm:py-10">
        <div className="night-content mx-auto max-w-3xl">
          <p className="night-kicker">BarTap</p>
          <h1 className="mt-4 text-5xl font-black leading-tight tracking-normal">
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
                      <span className="absolute right-3 top-3 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#ff6b9d] px-2 text-xs font-black text-white shadow-[0_0_22px_rgba(255,107,157,0.65)]">
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
                        <span className="block font-bold text-white">
                          {match.other.first_name}
                        </span>
                        <span className="block text-sm text-[#fde7bd]">
                          {s.chat}
                        </span>
                      </span>
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}
          {errorMsg && <p className="mt-6 text-sm text-red-300">{errorMsg}</p>}
        </div>
      </main>
    );
  }

  const visible = candidates.filter((c) => !matchedIds.has(c.id));

  return (
    <main className="night-shell px-5 py-8 text-white sm:px-6 sm:py-10">
      <div className="night-content mx-auto max-w-6xl">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="night-kicker">BarTap</p>
            <h1 className="mt-4 text-5xl font-black leading-[0.95] tracking-normal sm:text-6xl">
              {s.whosHere(venue?.name ?? "")}
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[#e7c7b4]">
              {s.pitch}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={goInvisible}
              className="night-button night-button-secondary px-4 py-3 text-sm"
            >
              {s.goInvisible}
            </button>
            <button
              onClick={leave}
              className="night-button night-button-secondary px-4 py-3 text-sm"
            >
              {s.leave}
            </button>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3 text-sm font-semibold">
          <span className="night-pill rounded-full px-4 py-2">
            {s.hereForYou(visible.length)}
          </span>
          <span className="night-pill rounded-full px-4 py-2">
            {s.mutualCount(matches.length)}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[#d9bbb1]">
            {s.discreetByDesign}
          </span>
        </div>

        {showRoomHint && (
          <section className="night-card-hot mt-8 rounded-[1.5rem] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-black">{s.firstTimeHintTitle}</h2>
                <p className="night-muted mt-2 max-w-2xl text-sm leading-relaxed">
                  {s.firstTimeHintBody}
                </p>
              </div>
              <button
                type="button"
                onClick={dismissRoomHint}
                className="night-button night-button-secondary shrink-0 px-4 py-3 text-sm"
              >
                {s.firstTimeHintDismiss}
              </button>
            </div>
          </section>
        )}

        {matches.length > 0 && (
          <section className="mt-8">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="night-kicker">{s.activeMatches}</h2>
                <p className="night-muted mt-2 text-sm">
                  {s.conversationHint}
                </p>
              </div>
            </div>
            <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
              {matches.map((match) => (
                <div
                  key={match.id}
                  className="night-card-hot relative min-w-60 rounded-2xl p-3"
                >
                  {(unreadByMatchId[match.id] ?? 0) > 0 && (
                    <span className="absolute right-3 top-3 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#ff6b9d] px-2 text-xs font-black text-white shadow-[0_0_22px_rgba(255,107,157,0.65)]">
                      {unreadByMatchId[match.id]}
                    </span>
                  )}
                  <Link
                    href={`/chat/${match.id}`}
                    className="flex items-center gap-3 transition hover:opacity-80"
                    aria-label={s.openConversation(match.other.first_name)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={match.other.photo_url}
                      alt={match.other.first_name}
                      className="night-photo-ring h-12 w-12 rounded-full object-cover"
                    />
                    <span>
                      <span className="block font-bold text-white">
                        {match.other.first_name}
                      </span>
                      <span className="block text-sm text-[#fde7bd]">
                        {s.chat}
                      </span>
                    </span>
                  </Link>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => openReport(match.other)}
                      className="night-button night-button-secondary px-3 py-2 text-xs"
                    >
                      {s.report}
                    </button>
                    <button
                      onClick={() => confirmBlock(match.other)}
                      className="night-button night-button-danger px-3 py-2 text-xs"
                    >
                      {s.block}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {visible.length === 0 ? (
          <div className="night-panel mt-12 rounded-[2rem] p-8 text-center">
            <p className="night-kicker">BarTap</p>
            <h2 className="mt-3 text-3xl font-black">{s.emptyTitle}</h2>
            <p className="night-muted mx-auto mt-3 max-w-md leading-relaxed">
              {s.empty}
            </p>
            <p className="mt-5 text-sm font-semibold text-[#fde7bd]">
              {s.emptyActionHint}
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <button
                onClick={goInvisible}
                className="night-button night-button-secondary px-5 py-3"
              >
                {s.goInvisible}
              </button>
              <button
                onClick={leave}
                className="night-button night-button-secondary px-5 py-3"
              >
                {s.leave}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {visible.map((c) => {
              const liked = likedIds.has(c.id);
              return (
                <div
                  key={c.id}
                  className="night-card group overflow-hidden rounded-[1.75rem] p-4"
                >
                  <div className="relative overflow-hidden rounded-[1.25rem]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.photo_url}
                      alt={c.first_name}
                      className="h-72 w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent p-4">
                      <h2 className="text-3xl font-black">{c.first_name}</h2>
                      <p className="mt-1 min-h-[1.25rem] text-sm text-[#e7c7b4]">
                        {c.bio ?? ""}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => like(c)}
                    disabled={liked}
                    className={`night-button mt-4 w-full px-5 py-3 ${
                      liked
                        ? "cursor-default border border-white/10 bg-white/10 text-[#bda7a5]"
                        : "night-button-primary"
                    }`}
                  >
                    {liked ? s.liked : s.like}
                  </button>
                  <p className="mt-2 text-center text-xs font-semibold text-[#bda7a5]">
                    {s.likeHint}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => openReport(c)}
                      className="night-button night-button-secondary px-3 py-2 text-xs"
                    >
                      {s.report}
                    </button>
                    <button
                      onClick={() => confirmBlock(c)}
                      className="night-button night-button-danger px-3 py-2 text-xs"
                    >
                      {s.block}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {newMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6 backdrop-blur-xl">
          <div className="night-card-hot w-full max-w-sm rounded-[2rem] p-8 text-center">
            <p className="night-kicker">
              {s.matchKicker}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={newMatch.other.photo_url}
              alt={newMatch.other.first_name}
              className="night-photo-ring mx-auto mt-6 h-32 w-32 rounded-full object-cover"
            />
            <h2 className="mt-4 text-3xl font-black">
              {newMatch.other.first_name}
            </h2>
            <p className="mt-3 text-zinc-300">{s.matchBody}</p>
            <div className="mt-8 grid gap-3">
              <Link
                href={`/chat/${newMatch.id}`}
                className="night-button night-button-primary w-full px-5 py-4 text-center"
              >
                {s.openChat}
              </Link>
              <button
                onClick={() => setNewMatch(null)}
                className="night-button night-button-secondary w-full px-5 py-4"
              >
                {s.matchDismiss}
              </button>
            </div>
          </div>
        </div>
      )}

      {reportTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6 backdrop-blur-xl">
          <form
            onSubmit={submitReport}
            className="night-panel w-full max-w-sm rounded-[2rem] p-6"
          >
            <h2 className="text-2xl font-black">
              {s.reportTitle(reportTarget.first_name)}
            </h2>
            {reportSubmitted ? (
              <>
                <p className="mt-4 text-zinc-300">{s.reportSuccess}</p>
                <p className="mt-2 text-sm text-zinc-500">
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
                <label className="mt-5 block text-sm font-semibold text-zinc-300">
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
                  <p className="mt-3 text-sm text-red-400">{errorMsg}</p>
                )}
                <div className="mt-6 grid gap-3">
                  <button
                    type="submit"
                    className="night-button night-button-primary px-5 py-3"
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
    </main>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="night-shell flex min-h-screen items-center justify-center px-6 text-white">
      <div className="night-content night-panel w-full max-w-md rounded-[2rem] p-8 text-center">
        <p className="night-kicker">BarTap</p>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
