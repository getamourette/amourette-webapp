"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { ensureAnonSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type EvidenceEvent = {
  at: string;
  source: "auth" | "realtime" | "lab";
  event: string;
  detail?: string;
};

type Snapshot = {
  capturedAt: string;
  context: "pwa" | "safari";
  uid: string | null;
  sessionId: string | null;
  expiresAt: string | null;
  userCreatedAt: string | null;
  profile: unknown;
  presence: unknown[];
  rooms: unknown[];
  likes: unknown[];
  matches: unknown[];
  messages: unknown[];
  errors: string[];
};

function context(): "pwa" | "safari" {
  return window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
    ? "pwa"
    : "safari";
}

function jwtSessionId(accessToken: string): string | null {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(normalized)) as { session_id?: unknown };
    return typeof claims.session_id === "string" ? claims.session_id : null;
  } catch {
    return null;
  }
}

function sessionIdentity(session: Session | null) {
  return {
    uid: session?.user.id ?? null,
    sessionId: session ? jwtSessionId(session.access_token) : null,
    expiresAt: session?.expires_at
      ? new Date(session.expires_at * 1000).toISOString()
      : null,
    userCreatedAt: session?.user.created_at ?? null,
  };
}

function stringifyError(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

export function SessionContinuityLab() {
  const [session, setSession] = useState<Session | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [events, setEvents] = useState<EvidenceEvent[]>([]);
  const [realtime, setRealtime] = useState("connecting");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const runtimeContext = useMemo(() => (typeof window === "undefined" ? "safari" : context()), []);

  const record = useCallback((entry: Omit<EvidenceEvent, "at">) => {
    setEvents((current) => [
      ...current,
      { at: new Date().toISOString(), ...entry },
    ]);
  }, []);

  const capture = useCallback(async (activeSession?: Session | null) => {
    setBusy(true);
    setError(null);
    try {
      const resolvedSession = activeSession === undefined
        ? (await supabase.auth.getSession()).data.session
        : activeSession;
      setSession(resolvedSession);
      const identity = sessionIdentity(resolvedSession);
      const errors: string[] = [];

      if (!identity.uid) {
        const empty: Snapshot = {
          capturedAt: new Date().toISOString(),
          context: context(),
          ...identity,
          profile: null,
          presence: [],
          rooms: [],
          likes: [],
          matches: [],
          messages: [],
          errors: ["No active session"],
        };
        setSnapshot(empty);
        return empty;
      }

      const [profileResult, presenceResult, likesResult, matchesResult, venuesResult] = await Promise.all([
        supabase.from("profiles").select("id, first_name, created_at, updated_at").eq("id", identity.uid).maybeSingle(),
        supabase.from("presence").select("id, profile_id, venue_id, checked_in_at, last_seen_at, left_at, is_visible").eq("profile_id", identity.uid).order("checked_in_at", { ascending: false }).limit(20),
        supabase.from("likes").select("id, liker_id, liked_id, venue_id, created_at, expires_at").or(`liker_id.eq.${identity.uid},liked_id.eq.${identity.uid}`).order("created_at", { ascending: false }).limit(20),
        supabase.from("matches").select("id, profile_a, profile_b, venue_id, created_at, expires_at").or(`profile_a.eq.${identity.uid},profile_b.eq.${identity.uid}`).order("created_at", { ascending: false }).limit(20),
        supabase.from("venues").select("id, slug, name, is_live").in("slug", ["test-empty", "test-crowded"]),
      ]);

      for (const result of [profileResult, presenceResult, likesResult, matchesResult, venuesResult]) {
        if (result.error) errors.push(result.error.message);
      }
      const rooms = await Promise.all((venuesResult.data ?? []).map(async (venue) => {
        const [countResult, candidatesResult] = await Promise.all([
          supabase.from("presence").select("id", { count: "exact", head: true }).eq("venue_id", venue.id).is("left_at", null).eq("is_visible", true),
          supabase.rpc("preview_room_profiles", { p_venue_id: venue.id }),
        ]);
        if (countResult.error) errors.push(countResult.error.message);
        if (candidatesResult.error) errors.push(candidatesResult.error.message);
        const myPresence = (presenceResult.data ?? []).find((row) => row.venue_id === venue.id && row.left_at === null);
        return {
          slug: venue.slug,
          venueId: venue.id,
          isLive: venue.is_live,
          checkedIn: Boolean(myPresence),
          visiblePresenceCount: countResult.count,
          previewCandidateCount: candidatesResult.data?.length ?? null,
          expectedSurface: myPresence && (candidatesResult.data?.length ?? 0) === 0 ? "waiting-room" : "room-or-not-checked-in",
        };
      }));
      const matchIds = matchesResult.data?.map((match) => match.id) ?? [];
      const messagesResult = matchIds.length
        ? await supabase.from("messages").select("id, match_id, sender_id, body, created_at").in("match_id", matchIds).order("created_at", { ascending: false }).limit(50)
        : { data: [], error: null };
      if (messagesResult.error) errors.push(messagesResult.error.message);

      const next: Snapshot = {
        capturedAt: new Date().toISOString(),
        context: context(),
        ...identity,
        profile: profileResult.data,
        presence: presenceResult.data ?? [],
        rooms,
        likes: likesResult.data ?? [],
        matches: matchesResult.data ?? [],
        messages: messagesResult.data ?? [],
        errors,
      };
      setSnapshot(next);
      record({ source: "lab", event: "SNAPSHOT", detail: `${next.context} ${next.uid}` });
      return next;
    } catch (caught) {
      const message = stringifyError(caught);
      setError(message);
      record({ source: "lab", event: "ERROR", detail: message });
      return null;
    } finally {
      setBusy(false);
    }
  }, [record]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await ensureAnonSession();
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!cancelled) await capture(data.session);
      } catch (caught) {
        if (!cancelled) {
          setError(stringifyError(caught));
          setBusy(false);
        }
      }
    })();

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, nextSession: Session | null) => {
        if (cancelled) return;
        setSession(nextSession);
        record({
          source: "auth",
          event,
          detail: `${nextSession?.user.id ?? "no uid"} / ${nextSession ? jwtSessionId(nextSession.access_token) ?? "no session_id" : "no session"}`,
        });
      }
    );

    const channel = supabase
      .channel("session-continuity-lab")
      .on("postgres_changes", { event: "*", schema: "public", table: "presence" }, (payload) => { record({ source: "realtime", event: `presence:${payload.eventType}` }); void capture(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "likes" }, (payload) => { record({ source: "realtime", event: `likes:${payload.eventType}` }); void capture(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, (payload) => { record({ source: "realtime", event: `matches:${payload.eventType}` }); void capture(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => { record({ source: "realtime", event: `messages:${payload.eventType}` }); void capture(); })
      .subscribe((status) => {
        setRealtime(status);
        record({ source: "realtime", event: status });
        if (status === "SUBSCRIBED") void capture();
      });

    const onVisibility = () => {
      record({ source: "lab", event: `VISIBILITY_${document.visibilityState.toUpperCase()}` });
      if (document.visibilityState === "visible") void capture();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
      void supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [capture, record]);

  async function refresh() {
    setBusy(true);
    const before = sessionIdentity(session);
    record({ source: "lab", event: "REFRESH_START", detail: `${before.uid} / ${before.sessionId}` });
    const { data, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      setError(refreshError.message);
      record({ source: "lab", event: "REFRESH_FAILED", detail: refreshError.message });
      setBusy(false);
      return;
    }
    const after = sessionIdentity(data.session);
    record({ source: "lab", event: "REFRESH_OK", detail: `${after.uid} / ${after.sessionId}` });
    await capture(data.session);
  }

  function exportEvidence() {
    const evidence = {
      exportedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      displayMode: context(),
      online: navigator.onLine,
      realtime,
      snapshot,
      events,
    };
    const blob = new Blob([JSON.stringify(evidence, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `session-continuity-${context()}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-dvh bg-[#190b10] px-4 pb-12 pt-[calc(env(safe-area-inset-top)+1rem)] text-[#f7efe4]">
      <div className="mx-auto max-w-3xl">
        <p className="font-label text-xs uppercase tracking-[0.18em] text-[#cfb9ad]">Temporary · issue #119</p>
        <h1 className="mt-2 font-display text-4xl italic">Session continuity lab</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#cfb9ad]">
          Cookie-backed preview B. No secrets or token values are displayed or exported.
        </p>

        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Context" value={runtimeContext} />
          <Metric label="Realtime" value={realtime} />
          <Metric label="UID" value={snapshot?.uid ?? "—"} wide />
          <Metric label="session_id" value={snapshot?.sessionId ?? "—"} wide />
          <Metric label="Expires" value={snapshot?.expiresAt ?? "—"} wide />
          <Metric label="User created" value={snapshot?.userCreatedAt ?? "—"} wide />
        </section>

        {error && <p className="mt-4 rounded-xl border border-[#e7b7b7]/30 bg-[#51212a] p-3 text-sm text-[#f2caca]">{error}</p>}

        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void capture()} className="rounded-full bg-[#f7efe4] px-4 py-2 text-sm text-[#190b10] disabled:opacity-50">Capture state</button>
          <button type="button" disabled={busy || !session} onClick={() => void refresh()} className="rounded-full border border-[#f7efe4]/40 px-4 py-2 text-sm disabled:opacity-50">Force refresh</button>
          <button type="button" onClick={exportEvidence} className="rounded-full border border-[#f7efe4]/40 px-4 py-2 text-sm">Export evidence</button>
        </div>

        <nav className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-[#e7b7b7]">
          <Link href="/v/test-empty">Open test-empty</Link>
          <Link href="/v/test-crowded">Open test-crowded</Link>
          <Link href="/profile?returnTo=/session-continuity-lab">Open profile</Link>
          <Link href="/">Open landing</Link>
        </nav>

        <Details title="Business state" value={snapshot ? {
          capturedAt: snapshot.capturedAt,
          profile: snapshot.profile,
          presence: snapshot.presence,
          rooms: snapshot.rooms,
          likes: snapshot.likes,
          matches: snapshot.matches,
          messages: snapshot.messages,
          errors: snapshot.errors,
        } : null} />
        <Details title={`Event log (${events.length})`} value={events} />
      </div>
    </main>
  );
}

function Metric({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 p-3 ${wide ? "col-span-2" : ""}`}>
      <p className="font-label text-[10px] uppercase tracking-[0.14em] text-[#cfb9ad]">{label}</p>
      <p className="mt-1 break-all font-mono text-xs">{value}</p>
    </div>
  );
}

function Details({ title, value }: { title: string; value: unknown }) {
  return (
    <details className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4" open>
      <summary className="cursor-pointer font-label text-xs uppercase tracking-[0.14em] text-[#cfb9ad]">{title}</summary>
      <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed">{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}
