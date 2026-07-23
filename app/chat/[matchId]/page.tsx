"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { ensureAnonSession } from "@/lib/auth";
import type { Database } from "@/lib/database.types";
import { browserLocale, localeForCity, t } from "@/lib/strings";
import { supabase } from "@/lib/supabase";
import {
  preferredLocale,
  useBrowserLocale,
  usePreferredLocale,
} from "@/lib/useLocale";
import { LanguageSelector } from "@/app/LanguageSelector";

type PublicProfile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "first_name" | "photo_url"
>;

type Message = Pick<
  Database["public"]["Tables"]["messages"]["Row"],
  "id" | "match_id" | "sender_id" | "body" | "created_at"
>;

type MatchDetails = Pick<
  Database["public"]["Tables"]["matches"]["Row"],
  "id" | "profile_a" | "profile_b" | "venue_id" | "expires_at"
> & {
  venue: Pick<
    Database["public"]["Tables"]["venues"]["Row"],
    "name" | "city" | "slug"
  >;
};

const PROFILE_COLUMNS = "id, first_name, photo_url";
const MESSAGE_COLUMNS = "id, match_id, sender_id, body, created_at";
const REPORT_REASONS = [
  "harassment",
  "fake_profile",
  "underage",
  "unsafe_behavior",
  "other",
] as const;
type ReportReason = (typeof REPORT_REASONS)[number];

type Status = "loading" | "ready" | "closed" | "error";
type TypingPayload = {
  profile_id?: string;
  typing?: boolean;
};

const TYPING_IDLE_MS = 1_600;

// Film grain over the velvet ground so the surface reads as a bar at night, not
// a flat digital fill (docs/design.md — "the night is the set", never flat).
const GRAIN_URL =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

function readMarkerKey(matchId: string) {
  return `paramour-chat-read:${matchId}`;
}

function markConversationRead(matchId: string, messages: Message[]) {
  if (typeof window === "undefined") return;

  const latestMessageAt = messages.reduce<string | null>((latest, message) => {
    if (!latest || Date.parse(message.created_at) > Date.parse(latest)) {
      return message.created_at;
    }
    return latest;
  }, null);

  window.localStorage.setItem(
    readMarkerKey(matchId),
    latestMessageAt ?? new Date().toISOString()
  );
}

export default function MatchChatPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;
  const browserLoc = useBrowserLocale();

  const [me, setMe] = useState<PublicProfile | null>(null);
  const [other, setOther] = useState<PublicProfile | null>(null);
  const [match, setMatch] = useState<MatchDetails | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>("harassment");
  const [reportNote, setReportNote] = useState("");
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockReason, setBlockReason] = useState<ReportReason>("unsafe_behavior");
  const [blockNote, setBlockNote] = useState("");
  const [otherTyping, setOtherTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null
  );
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const otherTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const locale = usePreferredLocale(
    match ? localeForCity(match.venue.city) : browserLoc
  );
  const s = t[locale].chat;
  const roomS = t[locale].room;
  const timeFormatter = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  });

  const appendMessage = useCallback((message: Message) => {
    setMessages((prev) =>
      prev.some((existing) => existing.id === message.id)
        ? prev
        : [...prev, message].sort(
            (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
          )
    );
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const user = await ensureAnonSession();

        const { data: myProfile } = await supabase
          .from("profiles")
          .select(PROFILE_COLUMNS)
          .eq("id", user.id)
          .maybeSingle();
        if (!active) return;
        if (!myProfile) {
          setStatus("error");
          setErrorMsg(t[preferredLocale(browserLocale())].chat.unavailable);
          return;
        }
        setMe(myProfile as PublicProfile);

        const { data: matchRow, error: matchError } = await supabase
          .from("matches")
          .select(
            "id, profile_a, profile_b, venue_id, expires_at, venues!inner(name, city, slug)"
          )
          .eq("id", matchId)
          .maybeSingle();
        if (matchError) throw matchError;
        if (!active) return;
        if (!matchRow) {
          setStatus("error");
          setErrorMsg(t[preferredLocale(browserLocale())].chat.unavailable);
          return;
        }

        const normalizedMatch = {
          id: matchRow.id,
          profile_a: matchRow.profile_a,
          profile_b: matchRow.profile_b,
          venue_id: matchRow.venue_id,
          expires_at: matchRow.expires_at,
          venue: Array.isArray(matchRow.venues)
            ? matchRow.venues[0]
            : matchRow.venues,
        } as MatchDetails;

        if (Date.parse(normalizedMatch.expires_at) <= Date.now()) {
          setMatch(normalizedMatch);
          setStatus("closed");
          return;
        }

        const otherId =
          normalizedMatch.profile_a === user.id
            ? normalizedMatch.profile_b
            : normalizedMatch.profile_a;

        const [{ data: otherProfile }, { data: messageRows, error: messagesError }] =
          await Promise.all([
            supabase
              .from("profiles")
              .select(PROFILE_COLUMNS)
              .eq("id", otherId)
              .maybeSingle(),
            supabase
              .from("messages")
              .select(MESSAGE_COLUMNS)
              .eq("match_id", matchId)
              .order("created_at", { ascending: true }),
          ]);
        if (messagesError) throw messagesError;
        if (!active) return;
        if (!otherProfile) {
          setStatus("error");
          setErrorMsg(t[preferredLocale(browserLocale())].chat.unavailable);
          return;
        }

        setMatch(normalizedMatch);
        setOther(otherProfile as PublicProfile);
        setMessages((messageRows ?? []) as Message[]);
        setStatus("ready");
      } catch (e) {
        console.error(e);
        if (active) {
          setStatus("error");
          setErrorMsg(t[preferredLocale(browserLocale())].chat.unavailable);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [matchId]);

  useEffect(() => {
    if (status !== "ready") return;
    bottomRef.current?.scrollIntoView({ block: "end" });
    markConversationRead(matchId, messages);
  }, [matchId, messages, status]);

  useEffect(() => {
    if (status !== "ready" || !me) return;

    const channel = supabase
      .channel(`messages-${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => appendMessage(payload.new as Message)
      )
      .on("broadcast", { event: "typing" }, (payload) => {
        const typingPayload = payload.payload as TypingPayload;
        if (typingPayload.profile_id !== me.id && typingPayload.typing) {
          setOtherTyping(true);
          if (otherTypingTimerRef.current) {
            clearTimeout(otherTypingTimerRef.current);
          }
          otherTypingTimerRef.current = setTimeout(() => {
            setOtherTyping(false);
          }, TYPING_IDLE_MS + 700);
        }
        if (typingPayload.profile_id !== me.id && typingPayload.typing === false) {
          setOtherTyping(false);
        }
      })
      .subscribe();
    typingChannelRef.current = channel;

    return () => {
      typingChannelRef.current = null;
      if (otherTypingTimerRef.current) {
        clearTimeout(otherTypingTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [appendMessage, matchId, me, status]);

  useEffect(() => {
    return () => {
      if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
      if (otherTypingTimerRef.current) clearTimeout(otherTypingTimerRef.current);
    };
  }, []);

  // Size the shell to the actually-visible viewport. iOS Safari's floating
  // bottom bar overlays CSS-viewport content without shrinking vh/svh/dvh, so
  // height units tuck the composer under it; window.visualViewport.height is the
  // real visible height (excludes the bar and the keyboard). Body scroll is
  // locked while mounted so only the thread scrolls (never the whole page).
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    const setVh = () =>
      root.style.setProperty("--app-vh", `${vv ? vv.height : window.innerHeight}px`);
    setVh();
    vv?.addEventListener("resize", setVh);
    vv?.addEventListener("scroll", setVh);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      vv?.removeEventListener("resize", setVh);
      vv?.removeEventListener("scroll", setVh);
      document.body.style.overflow = prevOverflow;
      root.style.removeProperty("--app-vh");
    };
  }, []);

  // Close the ⋯ menu on any tap outside it. A backdrop div can't be trusted
  // here: the header's backdrop-blur makes `position: fixed` resolve against the
  // header box, not the viewport, so a fixed overlay would miss taps in the
  // thread. A pointerdown listener is stacking-context-proof (covers touch).
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  function broadcastTyping(typing: boolean) {
    if (!me || !typingChannelRef.current) return;
    typingChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: { profile_id: me.id, typing },
    });
  }

  function handleDraftChange(value: string) {
    setDraft(value);
    if (!value.trim()) {
      broadcastTyping(false);
      return;
    }

    broadcastTyping(true);
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(() => {
      broadcastTyping(false);
    }, TYPING_IDLE_MS);
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!me || !match || sending) return;

    const body = draft.trim();
    if (!body) return;

    setSending(true);
    setDraft("");
    broadcastTyping(false);

    const { data, error } = await supabase
      .from("messages")
      .insert({ match_id: match.id, sender_id: me.id, body })
      .select(MESSAGE_COLUMNS)
      .single();

    setSending(false);

    if (error) {
      console.error(error);
      setDraft(body);
      setErrorMsg(s.sendError);
      return;
    }

    const { error: chatStartError } = await supabase.rpc("record_chat_started", {
      p_match_id: match.id,
    });
    if (chatStartError) {
      console.warn("Could not record chat start", chatStartError);
    }

    appendMessage(data as Message);
    setErrorMsg("");
  }

  async function blockOther(reason: ReportReason, note: string) {
    if (!me || !other || !match) return;

    const { error } = await supabase.from("blocks").insert({
      blocker_id: me.id,
      blocked_id: other.id,
      venue_id: match.venue_id,
      reason,
      note: note.trim() || null,
    });
    if (error && error.code !== "23505") {
      console.error(error);
      setErrorMsg(roomS.blockError);
      return;
    }

    setReportOpen(false);
    setBlockOpen(false);
    setMessages([]);
    setStatus("closed");
    setErrorMsg("");
  }

  function openBlock() {
    setMenuOpen(false);
    setBlockOpen(true);
    setBlockReason("unsafe_behavior");
    setBlockNote("");
    setErrorMsg("");
  }

  async function submitBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!other) return;
    if (blockReason === "other" && !blockNote.trim()) {
      setErrorMsg(roomS.reportNote);
      return;
    }
    if (!window.confirm(roomS.blockConfirm(other.first_name))) return;
    await blockOther(blockReason, blockNote);
  }

  function openReport() {
    setMenuOpen(false);
    setReportOpen(true);
    setReportReason("harassment");
    setReportNote("");
    setReportSubmitted(false);
    setErrorMsg("");
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!me || !other || !match) return;

    const { error } = await supabase.from("reports").insert({
      reporter_id: me.id,
      reported_id: other.id,
      venue_id: match.venue_id,
      reason: reportReason,
      note: reportNote.trim() || null,
    });
    if (error) {
      console.error(error);
      setErrorMsg(roomS.reportError);
      return;
    }

    setReportSubmitted(true);
    setErrorMsg("");
  }

  if (status === "loading") {
    return <Shell>{s.loading}</Shell>;
  }

  if (status === "error") {
    return <Shell tone="error">{errorMsg}</Shell>;
  }

  if (status === "closed" && match) {
    return (
      <Shell tone="error">
        <p>{s.closed}</p>
        <Link
          href={`/v/${match.venue.slug}`}
          className="night-button night-button-primary mt-6 inline-flex px-5 py-3"
        >
          {s.backToRoom}
        </Link>
      </Shell>
    );
  }

  if (!me || !other || !match) {
    return <Shell tone="error">{s.unavailable}</Shell>;
  }

  return (
    // Height is the JS-measured visible viewport (see effect), falling back to
    // 100dvh before hydration. Normal flow, not fixed: the thread scrolls, the
    // composer is the last flex child so it always sits at the visible bottom.
    <main
      className="night-shell flex flex-col overflow-hidden text-cream"
      style={{ height: "var(--app-vh, 100dvh)" }}
    >
      {/* Ambient depth so the ground reads as a bar at night, never a flat
          fill: a warm ember rising from the composer, a wine glow up top, a
          vignette deepening the edges, and a whisper of grain. No pattern, no
          second hue — discretion stays (docs/design.md). */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(95% 55% at 50% 112%, rgba(216,180,170,0.10), rgba(var(--wine-rgb),0.22) 38%, transparent 74%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(80% 45% at 50% -8%, rgba(var(--wine-rgb),0.20), transparent 60%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(120% 88% at 50% 42%, transparent 52%, rgba(var(--velvet-rgb),0.55))",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{ opacity: 0.06, backgroundImage: GRAIN_URL }}
      />

      <header
        className="night-content z-20 shrink-0 border-b border-champagne/15 bg-velvet/85 px-4 pb-3 backdrop-blur"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link
            href={`/v/${match.venue.slug}`}
            aria-label={s.backToRoom}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-cream/10 bg-cream/[0.04] text-cream transition-colors hover:border-cream/20"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={other.photo_url}
            alt={other.first_name}
            className="night-photo-ring h-11 w-11 shrink-0 rounded-full object-cover"
          />
          <div className="min-w-0">
            <h1 className="wordmark truncate text-[22px] leading-none">{other.first_name}</h1>
            {/* One presence signal, calm: the red live-dot already says "now". */}
            <p className="mt-[6px] flex items-center gap-[7px] font-label text-[10px] uppercase tracking-[0.2em] text-taupe">
              <span className="h-[6px] w-[6px] rounded-full bg-red shadow-[0_0_8px_rgba(204,20,54,.9)]" />
              {s.presence}
            </p>
          </div>

          {/* Single overflow menu: safety (blush, never red) then language.
              Keeps the header calm; closes on any outside tap (see effect). */}
          <div ref={menuRef} className="relative ml-auto shrink-0">
            <button
              type="button"
              aria-label={roomS.roomActions}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-champagne/25 bg-velvet/60 text-lg leading-none text-cream backdrop-blur"
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="night-panel absolute right-0 z-50 mt-2 grid w-56 gap-2 p-2">
                <p className="px-2 pt-1 font-label text-[10px] uppercase tracking-[0.2em] text-taupe">
                  {other.first_name}
                </p>
                <button
                  type="button"
                  onClick={openReport}
                  className="night-button night-button-danger px-4 py-3 text-xs"
                >
                  {roomS.report}
                </button>
                <button
                  type="button"
                  onClick={openBlock}
                  className="night-button night-button-danger px-4 py-3 text-xs"
                >
                  {roomS.block}
                </button>
                <hr className="hairline my-1" />
                <LanguageSelector className="justify-center" />
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="night-content mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto px-4 pb-6 pt-5 sm:px-5">
        {/* The opener, once at the top: the reveal echo + the ephemeral, said
            softly and only here (no banner, no popup). */}
        <div className="animate-curtain mx-auto mb-2 max-w-[88%] text-center">
          <p className="wordmark text-[18px] text-cream">{s.openerTitle}</p>
          <p className="mt-[7px] font-label text-[9px] uppercase tracking-[0.24em] text-taupe">
            {s.openerNote}
          </p>
        </div>

        {messages.length === 0 ? (
          <p className="mx-auto mt-6 max-w-[80%] text-center text-sm font-light leading-relaxed text-taupe">
            {s.empty}
          </p>
        ) : (
          messages.map((message) => {
            const mine = message.sender_id === me.id;
            return (
              <div
                key={message.id}
                className={`animate-curtain flex max-w-[80%] flex-col ${
                  mine ? "items-end self-end" : "items-start self-start"
                }`}
              >
                <p
                  className={`px-[15px] py-[11px] text-[14.5px] font-light leading-[1.5] text-cream ${
                    mine
                      ? "rounded-[20px] rounded-br-[7px]"
                      : "rounded-[20px] rounded-bl-[7px] border border-cream/[0.06]"
                  }`}
                  style={
                    mine
                      ? { background: "var(--bordeaux-warm)" }
                      : { background: "var(--bordeaux-deep)" }
                  }
                >
                  {message.body}
                </p>
                <time
                  dateTime={message.created_at}
                  className="mt-[5px] px-1 font-label text-[9.5px] uppercase tracking-[0.12em] text-taupe"
                >
                  {timeFormatter.format(new Date(message.created_at))}
                </time>
              </div>
            );
          })
        )}

        {otherTyping && other && (
          <div className="flex items-center gap-2 self-start">
            <span
              className="flex gap-1 rounded-[20px] rounded-bl-[7px] border border-cream/[0.06] px-[14px] py-[11px]"
              style={{ background: "var(--bordeaux-deep)" }}
            >
              <span className="h-[5px] w-[5px] animate-pulse rounded-full bg-taupe/70" />
              <span className="h-[5px] w-[5px] animate-pulse rounded-full bg-taupe/70 [animation-delay:120ms]" />
              <span className="h-[5px] w-[5px] animate-pulse rounded-full bg-taupe/70 [animation-delay:240ms]" />
            </span>
            <span className="font-light text-taupe">{s.typing(other.first_name)}</span>
          </div>
        )}
        <div ref={bottomRef} />
      </section>

      <form
        onSubmit={sendMessage}
        className="night-content z-20 shrink-0 border-t border-cream/[0.06] bg-velvet/80 px-4 pt-4 backdrop-blur sm:px-5"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-[10px]">
          <input
            value={draft}
            onChange={(event) => handleDraftChange(event.target.value)}
            maxLength={2000}
            placeholder={s.placeholder}
            className="min-w-0 flex-1 rounded-full border border-cream/10 bg-bordeaux px-4 py-3 text-[14px] font-light text-cream outline-none transition-colors placeholder:text-taupe/70 focus:border-blush/60"
          />
          <button
            type="submit"
            disabled={sending || draft.trim().length === 0}
            aria-label={s.send}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-cream/[0.14] bg-cream/10 text-cream transition-[transform,opacity] active:scale-[0.97] disabled:opacity-40 motion-reduce:active:scale-100"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-[18px] w-[18px]">
              <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        {errorMsg && (
          <p className="mx-auto mt-3 max-w-3xl text-sm text-blush">{errorMsg}</p>
        )}
      </form>

      {reportOpen && other && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-velvet/85 px-6">
          <form
            onSubmit={submitReport}
            className="night-panel w-full max-w-sm rounded-[2rem] p-6"
          >
            <h2 className="wordmark text-2xl">
              {roomS.reportTitle(other.first_name)}
            </h2>
            {reportSubmitted ? (
              <>
                <p className="mt-4 text-taupe">{roomS.reportSuccess}</p>
                <p className="mt-2 text-sm text-taupe">
                  {roomS.reportBlockPrompt}
                </p>
                <div className="mt-6 grid gap-3">
                  <button
                    type="button"
                    onClick={() => blockOther(reportReason, reportNote)}
                    className="night-button night-button-danger px-5 py-3"
                  >
                    {roomS.block}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportOpen(false)}
                    className="night-button night-button-secondary px-5 py-3"
                  >
                    {roomS.reportCancel}
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="mt-5 block text-sm font-medium text-taupe">
                  {roomS.reportReason}
                  <select
                    value={reportReason}
                    onChange={(event) =>
                      setReportReason(event.target.value as ReportReason)
                    }
                    className="night-input mt-2 px-4 py-3"
                  >
                    {REPORT_REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {roomS.reportReasons[reason]}
                      </option>
                    ))}
                  </select>
                </label>
                <textarea
                  value={reportNote}
                  onChange={(event) => setReportNote(event.target.value)}
                  maxLength={500}
                  placeholder={roomS.reportNote}
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
                    {roomS.reportSubmit}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportOpen(false)}
                    className="night-button night-button-secondary px-5 py-3"
                  >
                    {roomS.reportCancel}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}

      {blockOpen && other && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-velvet/85 px-6">
          <form
            onSubmit={submitBlock}
            className="night-panel w-full max-w-sm rounded-[2rem] p-6"
          >
            <h2 className="wordmark text-2xl">
              {roomS.blockTitle(other.first_name)}
            </h2>
            <label className="mt-5 block text-sm font-medium text-taupe">
              {roomS.reportReason}
              <select
                value={blockReason}
                onChange={(event) =>
                  setBlockReason(event.target.value as ReportReason)
                }
                className="night-input mt-2 px-4 py-3"
              >
                {REPORT_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {roomS.reportReasons[reason]}
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
                blockReason === "other"
                  ? `${roomS.reportNote} · required`
                  : roomS.reportNote
              }
              className="night-input mt-4 h-28 resize-none px-4 py-3"
            />
            {errorMsg && <p className="mt-3 text-sm text-blush">{errorMsg}</p>}
            <div className="mt-6 grid gap-3">
              <button
                type="submit"
                className="night-button night-button-danger px-5 py-3"
              >
                {roomS.blockSubmit}
              </button>
              <button
                type="button"
                onClick={() => setBlockOpen(false)}
                className="night-button night-button-secondary px-5 py-3"
              >
                {roomS.reportCancel}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

function Shell({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <main className="night-shell flex min-h-screen items-center justify-center px-6 text-cream">
      <div className="fixed right-5 top-5 z-20">
        <LanguageSelector />
      </div>
      <div
        className={`night-content night-panel w-full max-w-md rounded-[2rem] p-8 text-center text-sm ${
          tone === "error" ? "text-blush" : "night-muted"
        }`}
      >
        {children}
      </div>
    </main>
  );
}
