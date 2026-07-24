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
//   C "En attendant" — editorial/structured, productive actions as cards
//                     (utility-calm).
//
// This is a checkpoint for choosing a direction, so the genuinely new lines are
// hardcoded FR here; once a variant is chosen they move into lib/strings.ts for
// all locales. Strings that already exist (count label, leave, live status) are
// threaded through `s` so they stay localized.

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

// New user-facing copy under review (FR). Calm, honest, no jackpot: vide = début
// de soirée, pas app morte. The notify line promises a mail, never a push.
const COPY = {
  waiting: "En attente",
  early: "C'est encore tôt.",
  earlyBody: (venue: string) =>
    `${venue} se remplit plus tard dans la soirée. Le premier profil compatible s'affiche ici dès qu'il arrive.`,
  bioEmptyTitle: "Ajoute une phrase à ton profil",
  bioEmptyBody:
    "Une ligne de bio, et tu passes de silhouette à quelqu'un qu'on a envie de remarquer.",
  bioFullTitle: "Peaufine ton profil",
  bioFullBody: "Un détail de plus ne fait jamais de mal.",
  notify: "Préviens-moi quand ça bouge",
  notifyBody: (venue: string) =>
    `Un mail le soir où ${venue} se remplit. Rien d'autre.`,
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

// A "Veilleuse": everything centred and airy like the ceremonial landing. The
// live count is the hero, breathing like a candle (reused .breathe), a red
// live-dot beside it. One productive action, a whispered notify link, leave last.
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
      <p className="mt-3 max-w-xs leading-relaxed text-taupe">
        {COPY.earlyBody(venueName)}
      </p>

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
        {COPY.notify} →
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
// uses (inset-x-6 bottom-11), so the count dissolves into the first real face.
function VariantSeuil({
  venueName,
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
          {COPY.earlyBody(venueName)}
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
            {COPY.notify}
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

// C "En attendant": editorial and structured, top-aligned. A compact live row, a
// large Fraunces reframe, then the two things you can actually do now rendered as
// tappable cards — the productive profile action (warm card) and the soft notify
// (plain card). A sense of progress without losing the calm.
function VariantEnAttendant({
  venueName,
  roomCount,
  hasBio,
  polishPath,
  onLeave,
  onNotify,
  s,
}: Props) {
  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 pb-10 pt-28">
      {roomCount !== null && roomCount > 0 && (
        <div className="flex items-center gap-2">
          <span className="breathe h-[6px] w-[6px] rounded-full bg-red shadow-[0_0_10px_rgba(204,20,54,.85)]" />
          <span className="font-label text-[11px] uppercase tracking-[0.24em] text-taupe">
            {s.liveStatus(roomCount)}
          </span>
        </div>
      )}

      <h2 className="wordmark mt-6 text-[2.75rem] leading-[1.02] text-cream">
        {COPY.early}
      </h2>
      <p className="mt-4 max-w-sm leading-relaxed text-taupe">
        {COPY.earlyBody(venueName)}
      </p>

      <p className="night-kicker mt-10">{COPY.waiting}</p>

      <Link
        href={polishPath}
        className="night-card-hot mt-4 flex items-center justify-between gap-4 p-5 text-left transition-transform active:scale-[0.99] motion-reduce:active:scale-100"
      >
        <div className="min-w-0">
          <p className="font-body text-[15px] text-cream">
            {hasBio ? COPY.bioFullTitle : COPY.bioEmptyTitle}
          </p>
          <p className="mt-1 text-sm leading-snug text-taupe">
            {hasBio ? COPY.bioFullBody : COPY.bioEmptyBody}
          </p>
        </div>
        <span aria-hidden className="shrink-0 text-taupe">
          →
        </span>
      </Link>

      <button
        type="button"
        onClick={onNotify}
        className="night-card mt-3 flex items-center justify-between gap-4 p-5 text-left transition-transform active:scale-[0.99] motion-reduce:active:scale-100"
      >
        <div className="min-w-0">
          <p className="font-body text-[15px] text-cream">{COPY.notify}</p>
          <p className="mt-1 text-sm leading-snug text-taupe">
            {COPY.notifyBody(venueName)}
          </p>
        </div>
        <span aria-hidden className="shrink-0 text-taupe">
          →
        </span>
      </button>

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
