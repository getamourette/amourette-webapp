"use client";

// Waiting-room redesign (#106). Three distinct visual directions for the empty
// state a checked-in user sees before any compatible profile has arrived. All
// three speak the v2 system (docs/design.md): velvet ground, Fraunces italic,
// Jost tracked labels, a single champagne hairline, red only as an event, blush
// as the soft state. They differ in composition, not just copy:
//   A "Veilleuse"   — ceremonial minimal, the breathing live count is the hero
//                     (landing / direction C DNA).
//   B "Le seuil"    — full-bleed empty stage, the count sits in the exact slot a
//                     RoomFeedCard's name occupies so it dissolves into the first
//                     arrival (room-card / hero #1 DNA).
//   C "En attendant" — editorial/structured, productive actions as cards. This is
//                     the chosen direction being refined (Marwane, #106).
//
// Copy under review lives in COPY (FR); once frozen it moves into lib/strings.ts
// for all locales. Strings that already exist (leave, live status) are threaded
// through `s` so they stay localized.

import { useState } from "react";
import Link from "next/link";
import { t } from "@/lib/strings";

type RoomStrings = (typeof t)["en"]["room"];

export type WaitingVariant = "a" | "b" | "c";

type Props = {
  variant: WaitingVariant;
  venueName: string;
  // Honest count: the query is hidden unless it returns >= 1 (you are visibly
  // checked in, so a real room is never 0). null means the count is unavailable.
  roomCount: number | null;
  hasBio: boolean;
  polishPath: string;
  onLeave: () => void;
  onNotify: () => void;
  s: RoomStrings;
};

// New user-facing copy under review (FR). Calm, honest, no jackpot: an empty
// room is the start of the night, not a dead app. The reframe deliberately does
// NOT describe the launch trigger (1-compatible vs headcount vs schedule is not
// yet decided, Marwane/Aymane), so it stays true whatever that mechanism becomes.
const COPY = {
  waiting: "En attendant",
  early: "Ça se remplit.",
  earlyBody: "La vraie soirée démarre plus tard. On te fait signe dès que ça bouge.",
  // The bio is the only real "improve your odds" lever (no second photo). Empty
  // gets a pointed, dedicated message; filled degrades to a gentle nudge.
  bioEmptyTitle: "Ta bio est vide",
  bioEmptyBody:
    "Une phrase, et tu passes de simple photo à quelqu'un qu'on remarque. C'est ton seul vrai levier ce soir.",
  bioEmptyBadge: "À compléter",
  bioFullTitle: "Peaufine ton profil",
  bioFullBody: "Un détail de plus ne fait jamais de mal.",
  // Notify = browser notifications (web-push), never email.
  notifTitle: "Préviens-moi quand ça bouge",
  notifBody: "Active les notifs, on te fait signe dès qu'il y a du monde pour toi.",
  notifOnTitle: "Notifications activées",
  notifOnBody: (venue: string) => `On te fait signe dès que ça bouge à ${venue}.`,
  notifOffTitle: "Notifications bloquées",
  notifOffBody:
    "Réactive-les dans les réglages de ton navigateur pour qu'on te prévienne.",
};

export function WaitingRoom(props: Props) {
  switch (props.variant) {
    case "a":
      return <VariantVeilleuse {...props} />;
    case "b":
      return <VariantSeuil {...props} />;
    case "c":
      return <VariantEnAttendant {...props} />;
  }
}

// C "En attendant" (chosen): editorial and structured, top-aligned. The live
// count is intentionally NOT repeated here — the persistent room chrome already
// shows "Amourette · venue · ● N" at the top, so echoing it caused a duplicate.
// Below the reframe, the two things you can actually do now: the bio lever (warm
// card, pointed when empty) and the notify opt-in (browser push).
function VariantEnAttendant({
  venueName,
  hasBio,
  polishPath,
  onLeave,
  s,
}: Props) {
  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 pb-10 pt-28">
      <h2 className="wordmark mt-2 text-[2.75rem] leading-[1.02] text-cream">
        {COPY.early}
      </h2>
      <p className="mt-4 max-w-sm leading-relaxed text-taupe">
        {COPY.earlyBody}
      </p>

      <p className="night-kicker mt-10">{COPY.waiting}</p>

      {/* The bio lever. Empty gets a dedicated message + a blush "à compléter"
          tag (blush = soft state, never red); filled degrades to a gentle nudge. */}
      <Link
        href={polishPath}
        className="night-card-hot mt-4 flex items-start justify-between gap-4 p-5 text-left transition-transform active:scale-[0.99] motion-reduce:active:scale-100"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-body text-[15px] text-cream">
              {hasBio ? COPY.bioFullTitle : COPY.bioEmptyTitle}
            </p>
            {!hasBio && (
              <span className="rounded-full border border-blush/30 px-2 py-0.5 font-label text-[10px] uppercase tracking-[0.14em] text-blush">
                {COPY.bioEmptyBadge}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm leading-snug text-taupe">
            {hasBio ? COPY.bioFullBody : COPY.bioEmptyBody}
          </p>
        </div>
        <span aria-hidden className="mt-0.5 shrink-0 text-taupe">
          →
        </span>
      </Link>

      <NotifyCard venueName={venueName} />

      <button
        type="button"
        onClick={onLeave}
        className="mt-8 self-center text-xs text-taupe/70 transition-colors hover:text-taupe"
      >
        {s.leave}
      </button>
    </div>
  );
}

type NotifPermission = "unsupported" | "default" | "granted" | "denied";

// The notify opt-in. This is the browser-permission brick of web-push: it asks
// for the Notification permission so a real subscription flow (service worker +
// pushManager.subscribe + persisting the subscription server-side) has something
// to build on. That backend piece is the next step (Marwane), wired at the TODO
// below. Deliberately decoupled from whatever decides *when* a night "opens", so
// the notify promise holds no matter which launch mechanism we land on.
function NotifyCard({ venueName }: { venueName: string }) {
  // The waiting room only ever mounts client-side (the page starts at
  // status="loading" and resolves session/venue/candidates before this renders),
  // so reading the browser permission in a lazy initializer is safe — no SSR
  // pass renders this, hence no hydration mismatch, and no set-state-in-effect.
  const [perm, setPerm] = useState<NotifPermission>(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "unsupported";
    }
    return Notification.permission as NotifPermission;
  });

  async function enable() {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPerm(result as NotifPermission);
    // TODO(web-push): if result === "granted", register the service worker,
    // subscribe via registration.pushManager.subscribe({ applicationServerKey }),
    // and POST the subscription to the backend so the night can push to it.
  }

  // No notification support at all: hide rather than promise something we can't
  // deliver (docs/AGENTS.md — no empty promises).
  if (perm === "unsupported") return null;

  if (perm === "granted") {
    return (
      <div className="night-card mt-3 flex items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="font-body text-[15px] text-cream">{COPY.notifOnTitle}</p>
          <p className="mt-1 text-sm leading-snug text-taupe">
            {COPY.notifOnBody(venueName)}
          </p>
        </div>
        <span aria-hidden className="shrink-0 text-blush">
          ✓
        </span>
      </div>
    );
  }

  if (perm === "denied") {
    return (
      <div className="night-card mt-3 p-5">
        <p className="font-body text-[15px] text-cream">{COPY.notifOffTitle}</p>
        <p className="mt-1 text-sm leading-snug text-taupe">
          {COPY.notifOffBody}
        </p>
      </div>
    );
  }

  // default (not yet asked): the actionable opt-in. Marwane's favourite — the
  // one big, obvious "turn on notifications" affordance.
  return (
    <button
      type="button"
      onClick={enable}
      className="night-card mt-3 flex w-full items-center justify-between gap-4 p-5 text-left transition-transform active:scale-[0.99] motion-reduce:active:scale-100"
    >
      <div className="min-w-0">
        <p className="font-body text-[15px] text-cream">{COPY.notifTitle}</p>
        <p className="mt-1 text-sm leading-snug text-taupe">{COPY.notifBody}</p>
      </div>
      <span aria-hidden className="shrink-0 text-taupe">
        →
      </span>
    </button>
  );
}

// A "Veilleuse": everything centred and airy like the ceremonial landing. The
// live count is the hero, breathing like a candle (reused .breathe), a red
// live-dot beside it. Kept as a comparison direction (not the chosen one), so
// its notify link still opens the email prompt via onNotify.
function VariantVeilleuse({
  venueName,
  roomCount,
  hasBio,
  polishPath,
  onLeave,
  onNotify,
  s,
}: Props) {
  return (
    <div className="flex h-full flex-col items-center justify-center overflow-y-auto px-8 pb-10 pt-28 text-center">
      <p className="night-kicker">{venueName}</p>

      {roomCount !== null && roomCount > 0 && (
        <div className="breathe mt-8 flex flex-col items-center">
          <span className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-red shadow-[0_0_12px_rgba(204,20,54,.9)]" />
            <span className="wordmark text-[5.5rem] leading-none text-cream">
              {roomCount}
            </span>
          </span>
          <p className="mt-3 max-w-[15rem] text-sm text-taupe">
            {s.roomCount(roomCount)}
          </p>
        </div>
      )}

      <hr className="hairline mt-9 w-16" />
      <h2 className="wordmark mt-9 text-3xl text-cream">{COPY.early}</h2>
      <p className="mt-3 max-w-xs leading-relaxed text-taupe">{COPY.earlyBody}</p>

      <Link
        href={polishPath}
        className="night-button night-button-secondary mt-10 w-full max-w-xs px-5 py-3.5 text-center text-xs"
      >
        {hasBio ? COPY.bioFullTitle : COPY.bioEmptyTitle}
      </Link>

      <button
        type="button"
        onClick={onNotify}
        className="mt-6 font-label text-[11px] uppercase tracking-[0.18em] text-taupe transition-colors hover:text-cream"
      >
        {COPY.notifTitle} →
      </button>

      <button
        type="button"
        onClick={onLeave}
        className="mt-8 text-xs text-taupe/70 transition-colors hover:text-taupe"
      >
        {s.leave}
      </button>
    </div>
  );
}

// B "Le seuil": the empty state IS the stage, not a card floating on it. A warm
// spotlight (room-key) over vignetted, grained velvet reads as a lit spot no one
// has stepped into yet. The content sits in the identity slot a RoomFeedCard
// uses. Kept as a comparison direction (not the chosen one).
function VariantSeuil({
  roomCount,
  hasBio,
  polishPath,
  onLeave,
  onNotify,
  s,
}: Props) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-velvet">
      {/* Empty lit stage: a rose key light high on the frame, framed to velvet by
          the vignette, kept cinematic (never flat) by the grain. */}
      <div className="room-key pointer-events-none absolute inset-0" />
      <div className="room-vignette pointer-events-none absolute inset-0" />
      <div className="room-grain pointer-events-none absolute inset-0" />
      <div className="room-identity-scrim pointer-events-none absolute inset-0" />

      <div className="room-card-enter absolute inset-x-6 bottom-11 text-center">
        <p className="night-kicker mb-3 text-[10px]">{COPY.waiting}</p>

        {roomCount !== null && roomCount > 0 && (
          <>
            <h2
              className="wordmark text-[3.75rem] leading-[0.96] text-cream"
              style={{ textShadow: "0 1px 22px rgba(18,10,15,.7)" }}
            >
              {roomCount}
            </h2>
            <p className="mx-auto mt-1.5 max-w-[16rem] text-sm text-taupe">
              {s.roomCount(roomCount)}
            </p>
          </>
        )}

        <p className="mx-auto mt-4 max-w-[17rem] font-body text-sm font-light leading-relaxed text-cream">
          {COPY.earlyBody}
        </p>

        <hr className="hairline mx-auto my-5 w-16" />

        <Link
          href={polishPath}
          className="night-button night-button-secondary inline-flex px-7 py-[13px] text-xs"
        >
          {hasBio ? COPY.bioFullTitle : COPY.bioEmptyTitle}
        </Link>

        <div className="mt-5 flex items-center justify-center gap-5">
          <button
            type="button"
            onClick={onNotify}
            className="font-label text-[10px] uppercase tracking-[0.18em] text-taupe transition-colors hover:text-cream"
          >
            {COPY.notifTitle}
          </button>
          <button
            type="button"
            onClick={onLeave}
            className="font-label text-[10px] uppercase tracking-[0.18em] text-taupe/70 transition-colors hover:text-taupe"
          >
            {s.leave}
          </button>
        </div>
      </div>
    </div>
  );
}
