"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Dialog } from "radix-ui";
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
import {
  confirmedMessage,
  failUnconfirmedMessage,
  mergeMessages,
  optimisticMessage,
  restoreStoredMessages,
  setDeliveryState,
  unconfirmedMessages,
  type ChatMessage,
  type ServerMessage,
  type StoredMessage,
} from "@/lib/chat-delivery";
import {
  chatReadMarkerKey,
  latestMessageTimestamp,
  legacyChatReadMarkerKey,
} from "@/lib/chat-read-state";

type PublicProfile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "first_name" | "photo_url" | "bio"
>;

type MatchDetails = Pick<
  Database["public"]["Tables"]["matches"]["Row"],
  "id" | "profile_a" | "profile_b" | "venue_id" | "venue_night_id" | "expires_at"
> & {
  venue: Pick<
    Database["public"]["Tables"]["venues"]["Row"],
    "name" | "city" | "slug"
  >;
};

const PROFILE_COLUMNS = "id, first_name, photo_url, bio";
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
type MatchPresenceState = {
  me_is_present: boolean;
  other_is_present: boolean;
};

// How long the sender keeps claiming "typing" after its last keystroke. Long
// enough that pausing to think a word does not blink the bubble off mid-sentence.
const TYPING_IDLE_MS = 3_000;
// Extra grace the receiver holds the bubble past the last broadcast. Only a
// safety net for a lost "stopped": the normal path is the sender's own stop.
const TYPING_LINGER_MS = 1_500;
// Under this distance from the bottom the thread is considered "at the latest":
// new messages pin, and the jump-to-latest control stays hidden.
const AT_BOTTOM_SLACK_PX = 80;
const DELIVERY_TIMEOUT_MS = 12_000;

function distanceFromBottom(thread: HTMLElement) {
  return thread.scrollHeight - thread.scrollTop - thread.clientHeight;
}

// Film grain over the velvet ground so the surface reads as a bar at night, not
// a flat digital fill (docs/design.md — "the night is the set", never flat).
const GRAIN_URL =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

// window.innerHeight is not a usable reference on iOS. A trace taken from a
// real iPhone shows it collapsing from 714 to 377 the moment the keyboard
// opens — sometimes in the same frame as the visualViewport resize, sometimes
// not — which made every `innerHeight - visualViewport.height` keyboard test in
// this file read 0. The layout viewport stays at its full height throughout, so
// that is the reference everything here measures against.
function layoutViewportHeight() {
  return document.documentElement.clientHeight || window.innerHeight;
}

function deliveryStorageKey(userId: string, matchId: string) {
  return `amourette-chat-delivery:${userId}:${matchId}`;
}

function legacyDeliveryStorageKey(userId: string, matchId: string) {
  return `paramour-chat-delivery:${userId}:${matchId}`;
}

function markConversationRead(matchId: string, messages: ChatMessage[]) {
  if (typeof window === "undefined") return;

  const latestMessageAt = latestMessageTimestamp(messages);

  window.localStorage.setItem(
    chatReadMarkerKey(matchId),
    latestMessageAt ?? new Date().toISOString()
  );
  window.localStorage.removeItem(legacyChatReadMarkerKey(matchId));
}

async function loadMatchPresence(matchId: string): Promise<MatchPresenceState> {
  const { data, error } = await supabase.rpc("match_presence_state", {
    p_match_id: matchId,
  });
  if (error) {
    // The branch preview can deploy before its founder-gated migration reaches
    // the shared DB. Preserve the existing chat instead of making it entirely
    // unavailable during that short code/schema rollout window.
    if (error.code === "PGRST202") {
      console.warn("match_presence_state migration is not applied yet");
      return { me_is_present: true, other_is_present: true };
    }
    throw error;
  }
  return (
    data?.[0] ?? { me_is_present: false, other_is_present: false }
  );
}

export default function MatchChatPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId;
  const browserLoc = useBrowserLocale();

  const [me, setMe] = useState<PublicProfile | null>(null);
  const [other, setOther] = useState<PublicProfile | null>(null);
  const [match, setMatch] = useState<MatchDetails | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [composerFocused, setComposerFocused] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>("harassment");
  const [reportNote, setReportNote] = useState("");
  const [reportNoteError, setReportNoteError] = useState("");
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockReason, setBlockReason] = useState<ReportReason>("unsafe_behavior");
  const [blockNote, setBlockNote] = useState("");
  const [otherTyping, setOtherTyping] = useState(false);
  const [mePresent, setMePresent] = useState(false);
  const [otherPresent, setOtherPresent] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [unseenCount, setUnseenCount] = useState(0);
  const threadRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const reportNoteRef = useRef<HTMLTextAreaElement>(null);
  // Live scroll geometry, read by handlers that must not wait for a re-render:
  // the last known distance from the bottom survives a viewport resize (which
  // never fires a scroll event) so the thread can be restored where it was.
  const atBottomRef = useRef(true);
  const distanceRef = useRef(0);
  const messageCountRef = useRef(0);
  // Lets the focus handler tell the viewport effect to start following the
  // geometry frame by frame (see handleFieldFocus).
  const followViewportRef = useRef<(ms: number) => void>(() => {});
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null
  );
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const otherTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deliveryTimersRef = useRef(new Map<string, number>());
  const chatStartRecordedRef = useRef(false);
  const recoveredOnLoadRef = useRef(false);
  const confirmedMessageIdsRef = useRef(new Set<string>());

  const locale = usePreferredLocale(
    match ? localeForCity(match.venue.city) : browserLoc
  );
  const s = t[locale].chat;
  const roomS = t[locale].room;
  const timeFormatter = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  });

  const confirmMessage = useCallback((message: ServerMessage) => {
    // Record confirmation synchronously, before React applies the state update.
    // A timeout query that already returned "absent" must not subsequently
    // overwrite this newer insert response or Realtime event as failed.
    confirmedMessageIdsRef.current.add(message.id);
    const timer = deliveryTimersRef.current.get(message.id);
    if (timer) window.clearTimeout(timer);
    deliveryTimersRef.current.delete(message.id);
    setMessages((prev) => mergeMessages(prev, [message]));
  }, []);

  const resyncMessages = useCallback(async () => {
    const { data, error } = await supabase
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("match_id", matchId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw error;
    const serverMessages = (data ?? []) as ServerMessage[];
    for (const message of serverMessages) {
      confirmedMessageIdsRef.current.add(message.id);
    }
    setMessages((prev) => mergeMessages(prev, serverMessages));
  }, [matchId]);

  const refreshPresence = useCallback(async (id: string) => {
    const state = await loadMatchPresence(id);
    setMePresent(state.me_is_present);
    setOtherPresent(state.other_is_present);
    return state;
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
            "id, profile_a, profile_b, venue_id, venue_night_id, expires_at, venues!inner(name, city, slug)"
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
          venue_night_id: matchRow.venue_night_id,
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

        const [
          { data: otherProfile },
          { data: messageRows, error: messagesError },
          presenceState,
        ] =
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
              .order("created_at", { ascending: true })
              .order("id", { ascending: true }),
            loadMatchPresence(matchId),
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
        let initialMessages = (messageRows ?? []).map((row) =>
          confirmedMessage(row as ServerMessage)
        );
        for (const message of messageRows as ServerMessage[]) {
          confirmedMessageIdsRef.current.add(message.id);
        }
        const storageKey = deliveryStorageKey(user.id, matchId);
        const legacyStorageKey = legacyDeliveryStorageKey(user.id, matchId);
        try {
          for (
            let index = window.sessionStorage.length - 1;
            index >= 0;
            index -= 1
          ) {
            const key = window.sessionStorage.key(index);
            if (
              (key?.startsWith("amourette-chat-delivery:") ||
                key?.startsWith("paramour-chat-delivery:")) &&
              key.endsWith(`:${matchId}`) &&
              key !== storageKey &&
              key !== legacyStorageKey
            ) {
              window.sessionStorage.removeItem(key);
            }
          }
          const raw =
            window.sessionStorage.getItem(storageKey) ??
            window.sessionStorage.getItem(legacyStorageKey);
          if (raw) {
            const stored = JSON.parse(raw) as StoredMessage[];
            initialMessages = restoreStoredMessages(
              stored,
              messageRows as ServerMessage[]
            );
            const serverIds = new Set(
              (messageRows as ServerMessage[]).map((message) => message.id)
            );
            recoveredOnLoadRef.current = stored.some((message) =>
              serverIds.has(message.id)
            );
            window.sessionStorage.removeItem(legacyStorageKey);
          }
        } catch {
          window.sessionStorage.removeItem(storageKey);
          window.sessionStorage.removeItem(legacyStorageKey);
        }
        setMessages(initialMessages);
        setMePresent(presenceState.me_is_present);
        setOtherPresent(presenceState.other_is_present);
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
    if (status !== "ready" || !recoveredOnLoadRef.current) return;
    recoveredOnLoadRef.current = false;
    setAnnouncement(s.deliveryRecovered);
  }, [s.deliveryRecovered, status]);

  useEffect(() => {
    if (!me || status !== "ready") return;
    const unresolved = unconfirmedMessages(messages);
    const key = deliveryStorageKey(me.id, matchId);
    if (unresolved.length === 0) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(unresolved));
  }, [matchId, me, messages, status]);

  useEffect(() => {
    if (status !== "closed" && status !== "error") return;
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (key?.endsWith(`:${matchId}`)) window.sessionStorage.removeItem(key);
    }
  }, [matchId, status]);

  // Participant presence is intentionally separate from discovery visibility:
  // pausing discovery keeps chat available, while leaving pauses new messages.
  // The counts-only venue projection is the reliable departure/re-entry signal
  // because the departed presence row itself becomes hidden by RLS.
  useEffect(() => {
    if (status !== "ready" || !match) return;
    const load = () => {
      void refreshPresence(match.id).catch((error) => console.error(error));
    };
    const channel = supabase
      .channel(`chat-presence-${match.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "venue_night_public_state",
          filter: `venue_id=eq.${match.venue_id}`,
        },
        load
      )
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus === "SUBSCRIBED") load();
      });
    const poll = window.setInterval(load, 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [match, refreshPresence, status]);

  // Always instant, never smoothed: a smooth scroll keeps firing scroll events
  // on the way down, which would flicker the jump control back into view, and a
  // long thread would animate for an absurd distance. It also means the jump
  // behaves identically under prefers-reduced-motion.
  const scrollThreadToBottom = useCallback(() => {
    const thread = threadRef.current;
    if (!thread) return;
    thread.scrollTop = thread.scrollHeight;
    atBottomRef.current = true;
    distanceRef.current = 0;
    setAtBottom(true);
    setUnseenCount(0);
  }, []);

  const handleThreadScroll = useCallback(() => {
    const thread = threadRef.current;
    if (!thread) return;
    const distance = distanceFromBottom(thread);
    const bottom = distance <= AT_BOTTOM_SLACK_PX;
    distanceRef.current = distance;
    atBottomRef.current = bottom;
    setAtBottom(bottom);
    if (bottom) setUnseenCount(0);
  }, []);

  // Reading position is the user's, not ours: pin to the latest only when they
  // are already there (or when the new message is their own). Otherwise hold the
  // thread still and count what arrived, surfaced by the jump-to-latest control.
  useEffect(() => {
    if (status !== "ready") return;
    const previousCount = messageCountRef.current;
    messageCountRef.current = messages.length;
    const added = messages.length - previousCount;
    const lastMessage = messages[messages.length - 1];
    const lastIsMine = added > 0 && lastMessage?.sender_id === me?.id;

    if (previousCount === 0 || atBottomRef.current || lastIsMine) {
      scrollThreadToBottom();
    } else if (added > 0) {
      setUnseenCount((count) => count + added);
      // Content grew without a scroll event, so refresh the geometry the
      // viewport-resize handler relies on.
      const thread = threadRef.current;
      if (thread) distanceRef.current = distanceFromBottom(thread);
    }

    markConversationRead(matchId, messages);
  }, [matchId, me?.id, messages, scrollThreadToBottom, status]);

  // The typing bubble lives inside the scrollable thread, so its arrival grows
  // the content without firing a scroll event, and the thread box itself never
  // resizes — nothing else would move the thread, and the bubble would be born
  // under the composer. Same rule as above: only re-pin a reader already at the
  // latest, never one who has scrolled back into the history.
  useEffect(() => {
    const thread = threadRef.current;
    if (status !== "ready" || !thread) return;
    if (atBottomRef.current) {
      scrollThreadToBottom();
      return;
    }
    // The bubble came or went under a reader who is elsewhere in the thread:
    // hold their view perfectly still, but refresh the geometry the resize
    // handler restores from, or it would be a bubble-height out of date.
    distanceRef.current = distanceFromBottom(thread);
  }, [otherTyping, scrollThreadToBottom, status]);

  // The thread box shrinks and grows with the keyboard, the browser chrome, and
  // rotation. Re-pin if we were at the latest, otherwise keep the same distance
  // from the bottom so the reader never lands on an unrelated message.
  useEffect(() => {
    const thread = threadRef.current;
    if (status !== "ready" || !thread) return;
    const observer = new ResizeObserver(() => {
      // Both branches compute a target and write it only when it actually
      // differs: this runs on every crank of the keyboard animation, and a
      // no-op scrollTop write still costs a scroll event and a paint.
      const maxScroll = thread.scrollHeight - thread.clientHeight;
      const target = atBottomRef.current
        ? maxScroll
        : maxScroll - distanceRef.current;
      if (atBottomRef.current) distanceRef.current = 0;
      if (Math.abs(thread.scrollTop - target) > 0.5) thread.scrollTop = target;
    });
    observer.observe(thread);
    return () => observer.disconnect();
  }, [status]);

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
        (payload) => confirmMessage(payload.new as ServerMessage)
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
          }, TYPING_IDLE_MS + TYPING_LINGER_MS);
        }
        if (typingPayload.profile_id !== me.id && typingPayload.typing === false) {
          setOtherTyping(false);
        }
      })
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus === "SUBSCRIBED") {
          void resyncMessages().catch((error) => console.error(error));
        }
      });
    typingChannelRef.current = channel;

    return () => {
      typingChannelRef.current = null;
      if (otherTypingTimerRef.current) {
        clearTimeout(otherTypingTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [confirmMessage, matchId, me, resyncMessages, status]);

  useEffect(() => {
    if (status !== "ready") return;
    const resync = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void resyncMessages().catch((error) => console.error(error));
      }
    };
    window.addEventListener("online", resync);
    document.addEventListener("visibilitychange", resync);
    return () => {
      window.removeEventListener("online", resync);
      document.removeEventListener("visibilitychange", resync);
    };
  }, [resyncMessages, status]);

  useEffect(() => {
    if (!me || !match || chatStartRecordedRef.current) return;
    const hasConfirmedMine = messages.some(
      (message) =>
        message.sender_id === me.id && message.deliveryState === "confirmed"
    );
    if (!hasConfirmedMine) return;
    chatStartRecordedRef.current = true;
    void supabase
      .rpc("record_chat_started", { p_match_id: match.id })
      .then(({ error }) => {
        if (error) console.warn("Could not record chat start", error);
      });
  }, [match, me, messages]);

  useEffect(() => {
    const timers = deliveryTimersRef.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
      if (otherTypingTimerRef.current) clearTimeout(otherTypingTimerRef.current);
    };
  }, []);

  // Measure the visible viewport height, and nothing else. iOS Safari's floating
  // bottom bar overlays CSS-viewport content without shrinking vh/svh/dvh, so
  // height units tuck the composer under it; visualViewport.height is the real
  // visible height, excluding that bar and the keyboard. Nothing here is
  // transitioned: the shell must track the keyboard frame-for-frame, and a
  // transition is exactly the lag and bounce we must avoid.
  //
  // What this deliberately does *not* use is visualViewport.offsetTop. Opening
  // the keyboard makes iOS pan the visual viewport down inside the layout
  // viewport, and an on-device trace showed offsetTop reporting 0 for a further
  // 400ms after the pan has visibly happened — the same 400ms every single
  // time, and still 0 when read every frame, so it is the property that is
  // stale, not the event that is late. Compensating with a value that lies for
  // 400ms is what left the composer as a 40px sliver at the top of the screen
  // with the header scrolled out above it. The shell is anchored to the bottom
  // of the layout viewport instead (see the <main> style), which lands in the
  // right place in every state without asking iOS where it panned to.
  //
  // The frame-by-frame follow below stays: the height is honest, and reading it
  // per frame is still better than waiting for the next event.
  //
  // html and body are locked while mounted so only the thread ever scrolls.
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const vv = window.visualViewport;
    let polling = false;
    let pollUntil = 0;
    let stopped = false;
    // Which way this browser reacts to a software keyboard. "pan" is the iOS
    // behaviour measured on device and the default, because that is the
    // platform this was verified on; "none" is a browser that shrinks the
    // visual viewport without panning, where a bottom-anchored shell would sit
    // under the keyboard and the chat would simply not be on screen. The
    // regime is settled by observation on the first keyboard opening, after
    // long enough for the stale offsetTop to have told the truth.
    let regime: "unknown" | "pan" | "none" = "unknown";
    let regimeDeadline = 0;

    const apply = () => {
      const layout = layoutViewportHeight();
      const measured = vv ? vv.height : layout;
      const offset = vv ? vv.offsetTop : 0;
      // A software keyboard eats a large slice of the viewport; browser chrome
      // collapsing only shifts it by a fraction, hence the generous threshold.
      const inset = layout - measured;
      const keyboardUp = inset > 120;

      if (keyboardUp && regime === "unknown") {
        // Give the browser 600ms from the first sight of the keyboard: iOS was
        // measured lying about offsetTop for a flat 400ms after every opening.
        if (regimeDeadline === 0) {
          regimeDeadline = performance.now() + 600;
        } else if (performance.now() > regimeDeadline) {
          regime = offset > 0 ? "pan" : "none";
        }
      } else if (!keyboardUp) {
        regimeDeadline = 0;
      }

      // The shell is anchored to the bottom of the layout viewport, which is
      // where the visible window sits once iOS has panned. A browser that does
      // not pan leaves the visible window at the top instead, so the shell is
      // lifted back by the keyboard's own height. The transform doubles as the
      // containing block for the fixed descendants either way.
      const shift = regime === "none" ? -inset : 0;
      root.style.setProperty("--app-shell-shift", `${shift}px`);
      root.style.setProperty("--app-vh", `${measured}px`);
      // A CSS variable and not React state on purpose: it flips in the middle
      // of the keyboard animation, and a state change there re-renders the
      // entire thread on the very frames that must stay cheap. The composer
      // multiplies its safe-area inset by it (see .chat-composer).
      root.style.setProperty("--app-kb-safe", keyboardUp ? "0" : "1");
    };

    // Read every frame for as long as a viewport transition may still be under
    // way, rather than trusting the next event to arrive on time.
    const poll = () => {
      if (stopped) {
        polling = false;
        return;
      }
      apply();
      if (performance.now() < pollUntil) {
        requestAnimationFrame(poll);
        return;
      }
      polling = false;
    };
    const follow = (ms: number) => {
      pollUntil = Math.max(pollUntil, performance.now() + ms);
      if (polling) return;
      polling = true;
      requestAnimationFrame(poll);
    };
    followViewportRef.current = follow;

    // Any viewport event means a transition may be starting: apply what it
    // reports, then keep reading for a while in case the rest of it is late.
    const onViewportEvent = () => follow(700);

    apply();
    vv?.addEventListener("resize", onViewportEvent);
    vv?.addEventListener("scroll", onViewportEvent);
    // Fallback for browsers without visualViewport, and orientation changes.
    window.addEventListener("resize", onViewportEvent);
    window.addEventListener("orientationchange", onViewportEvent);

    const prev = {
      htmlOverflow: root.style.overflow,
      htmlOverscroll: root.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
    };
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";

    return () => {
      stopped = true;
      pollUntil = 0;
      vv?.removeEventListener("resize", onViewportEvent);
      vv?.removeEventListener("scroll", onViewportEvent);
      window.removeEventListener("resize", onViewportEvent);
      window.removeEventListener("orientationchange", onViewportEvent);
      root.style.overflow = prev.htmlOverflow;
      root.style.overscrollBehavior = prev.htmlOverscroll;
      body.style.overflow = prev.bodyOverflow;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      root.style.removeProperty("--app-vh");
      root.style.removeProperty("--app-shell-shift");
      root.style.removeProperty("--app-kb-safe");
    };
  }, []);

  // Close the ⋯ menu on any tap outside it. A backdrop div can't be trusted
  // here: the header's backdrop-blur makes `position: fixed` resolve against the
  // header box, not the viewport, so a fixed overlay would miss taps in the
  // thread. A pointerdown listener is stacking-context-proof (covers touch).
  // The language switcher inside the menu is a Radix dropdown rendered in a
  // portal, i.e. outside menuRef: without the popper guard, tapping a language
  // closes the ⋯ menu mid-gesture and unmounts the dropdown before it commits.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Element | null;
      if (target?.closest?.("[data-radix-popper-content-wrapper]")) return;
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  // Focus is the earliest possible warning that the keyboard is coming, and it
  // arrives well before any visualViewport event does. It buys no geometry on
  // its own — iOS pans regardless of where the field sits, which an on-device
  // trace settled — so all it does is put the viewport effect into frame-by-frame
  // mode for the length of the transition. A second is comfortably longer than
  // the keyboard animation and the late pan report that follows it.
  function handleFieldFocus() {
    setComposerFocused(true);
    followViewportRef.current(1_000);
  }

  function handleFieldBlur() {
    setComposerFocused(false);
    followViewportRef.current(1_000);
  }

  function broadcastTyping(typing: boolean) {
    if (!me || !mePresent || !otherPresent || !typingChannelRef.current) return;
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

  function chooseSuggestion(suggestion: string) {
    handleDraftChange(suggestion);
    inputRef.current?.focus();
  }

  async function findMessage(id: string) {
    const { data, error } = await supabase
      .from("messages")
      .select(MESSAGE_COLUMNS)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data as ServerMessage | null;
  }

  async function settleUncertainMessage(id: string) {
    try {
      const serverMessage = await findMessage(id);
      if (serverMessage) {
        confirmMessage(serverMessage);
        setAnnouncement(s.deliveryRecovered);
        return;
      }
    } catch (error) {
      console.error(error);
    }
    if (confirmedMessageIdsRef.current.has(id)) return;
    setMessages((prev) => failUnconfirmedMessage(prev, id));
    setAnnouncement(s.deliveryFailed);
  }

  async function deliverMessage(message: ChatMessage, isRetry: boolean) {
    const oldTimer = deliveryTimersRef.current.get(message.id);
    if (oldTimer) window.clearTimeout(oldTimer);
    setMessages((prev) => setDeliveryState(prev, message.id, "pending"));
    setAnnouncement(isRetry ? s.deliveryRetrying : s.deliverySending);

    deliveryTimersRef.current.set(
      message.id,
      window.setTimeout(() => {
        deliveryTimersRef.current.delete(message.id);
        void settleUncertainMessage(message.id);
      }, DELIVERY_TIMEOUT_MS)
    );

    const { data, error } = await supabase
      .from("messages")
      .insert({
        id: message.id,
        match_id: message.match_id,
        sender_id: message.sender_id,
        body: message.body,
      })
      .select(MESSAGE_COLUMNS)
      .single();

    if (data) {
      confirmMessage(data as ServerMessage);
      setAnnouncement(isRetry ? s.deliveryRecovered : "");
      return;
    }
    if (error) {
      console.error(error);
      const timer = deliveryTimersRef.current.get(message.id);
      if (timer) window.clearTimeout(timer);
      deliveryTimersRef.current.delete(message.id);
      await settleUncertainMessage(message.id);
      await refreshPresence(message.match_id).catch((presenceError) =>
        console.error(presenceError)
      );
    }
  }

  async function retryMessage(id: string) {
    if (!mePresent || !otherPresent) return;
    const message = messages.find((candidate) => candidate.id === id);
    if (!message || message.deliveryState !== "failed") return;
    await deliverMessage(message, true);
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Sending must never close the keyboard. iOS blurs the field on implicit
    // form submission (the keyboard's own "send" key), and it only reopens the
    // keyboard for a focus() that runs inside the user gesture — so this stays
    // synchronous and ahead of every await below, since after the first one we
    // are out of the gesture and iOS refuses. On the button path the field
    // never lost focus (its pointerdown is cancelled), so this is a no-op.
    // Ahead of the guards too: a send that cannot go through is no reason to
    // drop the keyboard either.
    inputRef.current?.focus();
    if (!me || !match || !mePresent || !otherPresent) return;

    const body = draft.trim();
    if (!body) return;

    setDraft("");
    broadcastTyping(false);
    const message = optimisticMessage(
      crypto.randomUUID(),
      match.id,
      me.id,
      body,
      new Date().toISOString()
    );
    setMessages((prev) => [...prev, message]);
    void deliverMessage(message, false);
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
    setReportNoteError("");
    setReportSubmitted(false);
    setErrorMsg("");
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!me || !other || !match) return;

    const trimmedNote = reportNote.trim();
    if (reportReason === "other" && !trimmedNote) {
      setReportNoteError(roomS.reportNoteRequiredError);
      reportNoteRef.current?.focus();
      return;
    }

    const { error } = await supabase.rpc("submit_report", {
      p_reported_id: other.id,
      p_venue_night_id: match.venue_night_id,
      p_reason: reportReason,
      p_note: trimmedNote || null,
    });
    if (error) {
      console.error(error);
      if (error.message.includes("note is required for other reports")) {
        setReportNoteError(roomS.reportNoteRequiredError);
        reportNoteRef.current?.focus();
        return;
      }
      setErrorMsg(
        error.message.includes("only report users")
          ? roomS.reportEligibilityError
          : roomS.reportError
      );
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

  const showSuggestions =
    messages.length === 0 &&
    draft.trim().length === 0 &&
    !composerFocused &&
    mePresent &&
    otherPresent;

  return (
    // Anchored to the *bottom* of the layout viewport and sized to the measured
    // visible height (see effect), falling back to 100dvh before hydration. The
    // thread scrolls, the composer is the last flex child so it always sits at
    // the visible bottom. Bottom-anchoring is the whole trick: iOS pans so that
    // the bottom of the layout viewport meets the top of the keyboard, so the
    // visible window is always the bottom slice of the layout viewport — which
    // is exactly where a bottom-anchored box of the measured height lands, with
    // no need to know how far iOS panned. It will not say honestly for 400ms.
    <main
      className="night-shell flex flex-col overflow-hidden text-cream"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        width: "100%",
        height: "var(--app-vh, 100dvh)",
        // .night-shell carries min-height: 100vh, which would otherwise win over
        // the measured height and push the composer below the visible area.
        minHeight: 0,
        // Zero on iOS, where bottom-anchoring alone is already right. It only
        // becomes non-zero on a browser that shrinks the visual viewport
        // without panning (see the regime detection in the effect). Having a
        // transform at all is load-bearing regardless: it makes <main> the
        // containing block for its own `position: fixed` descendants, which is
        // what pins the ambient layers below and the report/block panels to the
        // *visible* viewport rather than the layout one.
        transform: "translateY(var(--app-shell-shift, 0px))",
      }}
    >
      {/* Ambient depth so the ground reads as a bar at night, never a flat
          fill: a warm ember rising from the composer, a wine glow up top, a
          vignette deepening the edges, and a whisper of grain. No pattern, no
          second hue — discretion stays (docs/design.md).
          Sized to 100vh (the *large* viewport, which no browser chrome or
          keyboard ever shrinks) rather than to the shell: every one of these
          gradients is defined in percentages, so following the shell's height
          would re-rasterise four full-screen layers plus the grain on every
          frame of the keyboard animation — and would visibly breathe while
          doing it. Off-screen overflow is clipped by the shell. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-screen"
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(95% 55% at 50% 112%, rgba(216,180,170,0.10), rgba(var(--wine-rgb),0.22) 38%, transparent 74%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(80% 45% at 50% -8%, rgba(var(--wine-rgb),0.20), transparent 60%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 88% at 50% 42%, transparent 52%, rgba(var(--velvet-rgb),0.55))",
          }}
        />
        <div
          className="absolute inset-0"
          style={{ opacity: 0.06, backgroundImage: GRAIN_URL }}
        />
      </div>

      <header className="night-content chat-header z-20 shrink-0 border-b border-champagne/15 bg-velvet/85 px-4 pb-3 backdrop-blur">
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
          <Dialog.Root open={profileOpen} onOpenChange={setProfileOpen}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                data-testid="chat-profile-open"
                aria-label={s.viewProfile(other.first_name)}
                className="flex min-w-0 items-center gap-3 text-left"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={other.photo_url} alt="" className="night-photo-ring h-11 w-11 shrink-0 rounded-full object-cover" />
                <span className="min-w-0">
                  <span className="wordmark block truncate text-[22px] leading-none">{other.first_name}</span>
                  <span className="mt-[6px] flex items-center gap-[7px] font-label text-[10px] uppercase tracking-[0.2em] text-taupe">
                    <span className={`h-[6px] w-[6px] rounded-full ${otherPresent ? "bg-red shadow-[0_0_8px_rgba(204,20,54,.9)]" : "bg-taupe/50"}`} />
                    {otherPresent ? s.presence : s.departed}
                  </span>
                </span>
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay data-testid="chat-profile-overlay" className="fixed inset-0 z-50 bg-velvet/80 opacity-0 transition-opacity duration-200 data-[state=open]:opacity-100 motion-reduce:transition-none" />
              <Dialog.Content data-testid="chat-profile-dialog" aria-describedby={other.bio ? "chat-profile-bio" : undefined} className="night-panel fixed inset-x-0 bottom-0 z-50 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-t-[2rem] p-6 opacity-0 translate-y-2 transition-[opacity,transform] duration-200 data-[state=open]:translate-y-0 data-[state=open]:opacity-100 motion-reduce:transform-none motion-reduce:transition-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(28rem,calc(100vw-3rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[2rem] sm:data-[state=open]:-translate-x-1/2 sm:data-[state=open]:-translate-y-1/2">
                <Dialog.Close aria-label={s.closeProfile} className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full border border-cream/10 text-xl text-cream">×</Dialog.Close>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={other.photo_url} alt={other.first_name} className="night-photo-ring mx-auto h-36 w-36 rounded-full object-cover" />
                <Dialog.Title className="wordmark mt-5 text-center text-3xl">{other.first_name}</Dialog.Title>
                {other.bio && <Dialog.Description id="chat-profile-bio" className="mx-auto mt-4 max-w-sm whitespace-pre-wrap text-center font-light leading-relaxed text-taupe">{other.bio}</Dialog.Description>}
                <Dialog.Close className="night-button night-button-primary mt-7 w-full px-5 py-3">{s.backToConversation}</Dialog.Close>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>

          {/* Single overflow menu: safety (blush, never red) then language.
              Keeps the header calm; closes on any outside tap (see effect). */}
          <div ref={menuRef} className="relative ml-auto shrink-0">
            <button
              data-testid="chat-menu"
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
              <div className="night-panel absolute right-0 z-50 mt-2 grid w-56 max-w-[calc(100vw-2rem)] gap-2 p-2">
                <p className="px-2 pt-1 font-label text-[10px] uppercase tracking-[0.2em] text-taupe">
                  {other.first_name}
                </p>
                <button
                  data-testid="chat-report-open"
                  type="button"
                  onClick={openReport}
                  className="night-button night-button-danger px-4 py-3 text-xs"
                >
                  {roomS.report}
                </button>
                <button
                  data-testid="chat-block-open"
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

      <section
        data-testid="chat-thread"
        ref={threadRef}
        onScroll={handleThreadScroll}
        className="night-content chat-thread mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col gap-[14px] overflow-y-auto overscroll-contain px-4 pb-6 pt-5 sm:px-5"
      >
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
                data-testid="chat-message"
                data-message-id={message.id}
                data-delivery-state={message.deliveryState}
                className={`${message.optimistic ? "animate-curtain" : ""} flex max-w-[80%] flex-col ${
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
                <div className="mt-[5px] min-h-[14px] px-1 font-label text-[9.5px] uppercase tracking-[0.12em] text-taupe">
                  <time dateTime={message.created_at}>
                    {timeFormatter.format(new Date(message.created_at))}
                  </time>
                  {mine && message.deliveryState === "pending" && (
                    <span> · {s.deliverySending}</span>
                  )}
                  {mine && message.deliveryState === "failed" && (
                    <>
                      <span> · {s.deliveryFailed} · </span>
                      <button
                        type="button"
                        onClick={() => void retryMessage(message.id)}
                        disabled={!mePresent || !otherPresent}
                        className="underline underline-offset-2 disabled:no-underline disabled:opacity-50"
                      >
                        {s.deliveryRetry}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}

        {otherTyping && other && (
          <div data-testid="typing-indicator" className="flex items-center gap-2 self-start">
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
      </section>

      <form
        onSubmit={sendMessage}
        // The bottom clearance (the safe-area inset, dropped while the keyboard
        // is up) lives in .chat-composer so it follows a CSS variable rather
        // than a React render. Never a hardcoded lift: if the composer ever
        // slips under iOS's floating bar again, the answer is a measured
        // compensation, not a new constant.
        className="night-content chat-composer relative z-20 shrink-0 border-t border-cream/[0.06] bg-velvet/80 px-4 pt-3 backdrop-blur sm:px-5"
      >
        <div
          data-testid="chat-suggestions"
          data-visible={showSuggestions}
          aria-hidden={!showSuggestions}
          className="chat-suggestions absolute inset-x-0 bottom-full mx-auto flex max-w-3xl flex-col items-start gap-2 px-4 pb-3 sm:px-5"
        >
          {s.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              tabIndex={showSuggestions ? 0 : -1}
              onClick={() => chooseSuggestion(suggestion)}
              className="inline-flex min-h-11 w-fit max-w-full items-center rounded-2xl border border-champagne/30 bg-bordeaux/45 px-4 py-2 text-left text-sm font-light text-cream shadow-[0_8px_24px_rgba(18,10,15,0.18)] backdrop-blur-md"
            >
              {suggestion}
            </button>
          ))}
        </div>
        {/* Jump to the latest message, WhatsApp-style: only when the reader has
            scrolled away, with a count of what arrived meanwhile. */}
        {!atBottom && (
          <button
            type="button"
            onClick={() => scrollThreadToBottom()}
            aria-label={
              unseenCount > 0 ? s.newMessages(unseenCount) : s.scrollToLatest
            }
            className="chat-jump absolute bottom-full right-4 mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-champagne/25 bg-velvet/90 text-cream backdrop-blur sm:right-5"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {unseenCount > 0 && (
              <span
                aria-hidden
                className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-blush px-1 text-[10px] font-semibold text-ink"
              >
                {unseenCount}
              </span>
            )}
          </button>
        )}

        {mePresent && otherPresent ? (
          // Row laid out as [leading slot] [field] [send]. The leading slot is
          // deliberately not rendered while there are no attachments (an empty
          // box would read as a bug); the gaps and min-w-0 are already sized so
          // dropping a 44px control in later costs no reflow.
          <div className="mx-auto flex max-w-3xl items-center gap-[10px]">
            <input
              data-testid="chat-input"
              ref={inputRef}
              name="message"
              value={draft}
              onChange={(event) => handleDraftChange(event.target.value)}
              onFocus={handleFieldFocus}
              onBlur={handleFieldBlur}
              maxLength={2000}
              placeholder={s.placeholder}
              autoComplete="off"
              enterKeyHint="send"
              // 16px is the floor below which iOS Safari zooms the page on focus;
              // the tighter padding keeps the pill at its designed height.
              className="min-w-0 flex-1 rounded-full border border-cream/10 bg-bordeaux px-4 py-[10px] text-base font-light text-cream outline-none transition-colors placeholder:text-taupe/70 focus:border-blush/60"
            />
            <button
              data-testid="chat-send"
              type="submit"
              disabled={draft.trim().length === 0}
              aria-label={s.send}
              // Keep the focus in the field: a tap that moves focus onto the
              // button closes the keyboard, and it cannot be reopened once the
              // send is in flight. Cancelling pointerdown suppresses the
              // compatibility mousedown that would move focus; the click still
              // fires, so the form still submits.
              onPointerDown={(event) => event.preventDefault()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-cream/[0.14] bg-cream/10 text-cream transition-[transform,opacity,background-color,border-color] duration-[120ms] active:scale-[0.97] disabled:border-cream/[0.06] disabled:bg-transparent disabled:text-taupe/60 disabled:opacity-100 disabled:active:scale-100 motion-reduce:active:scale-100"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-[18px] w-[18px]">
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        ) : (
          <p className="mx-auto max-w-3xl text-center text-sm font-light leading-relaxed text-taupe">
            {s.messagingPaused}
          </p>
        )}
        {errorMsg && (
          <p className="mx-auto mt-3 max-w-3xl text-sm text-blush">{errorMsg}</p>
        )}
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </p>
      </form>

      {/* Safety panels are top-aligned and scrollable, not centred: with the
          keyboard up on the note field, a centred panel is half-covered. */}
      {reportOpen && other && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-velvet/85 px-6 py-8">
          <form
            data-testid="chat-report-form"
            onSubmit={submitReport}
            noValidate
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
                    data-testid="chat-report-reason"
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
                        {roomS.reportReasons[reason]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-4 block text-sm font-medium text-taupe">
                  {reportReason === "other"
                    ? roomS.reportNoteRequired
                    : roomS.reportNote}
                  <textarea
                    data-testid="chat-report-note"
                    ref={reportNoteRef}
                    value={reportNote}
                    onChange={(event) => {
                      const note = event.target.value;
                      setReportNote(note);
                      if (note.trim()) setReportNoteError("");
                    }}
                    required={reportReason === "other"}
                    aria-invalid={Boolean(reportNoteError)}
                    aria-describedby={
                      reportNoteError ? "chat-report-note-error" : undefined
                    }
                    maxLength={500}
                    className="night-input mt-2 h-28 resize-none px-4 py-3"
                  />
                </label>
                {reportNoteError && (
                  <p
                    id="chat-report-note-error"
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
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-velvet/85 px-6 py-8">
          <form
            data-testid="chat-block-form"
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
