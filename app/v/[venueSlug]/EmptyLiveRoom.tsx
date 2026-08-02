"use client";

// Empty live-room state (#118): the night is already live, but the participant
// has nothing to scroll. Deliberately separate from #125's pre-launch waiting
// room, and sharing its two action cards (see RoomCards.tsx) so the two screens
// read as a family without becoming the same screen (#152).
//
// Three variants, one action set. The framing is the only thing that changes,
// because the participant can do exactly the same two things in all three:
//
//   alone   — you are the only one checked in. "It's filling up" is true here.
//   emptied — same, but the room had people earlier tonight, so promising a
//             fill-up would sound false right after watching it drain.
//   live    — people are here and your feed is still empty. Never explain why:
//             a block, a preference mismatch, and an invisible participant are
//             indistinguishable client-side (RLS strips them alike), and
//             spelling it out would announce a rejection, which is the one
//             thing this product never does.
//
// The live count is intentionally NOT repeated here: the persistent room chrome
// already renders "Amourette · venue · ● N" at the top. There is no notify
// opt-in either — web push needs an installed PWA on iOS, rejected in #119, so
// the only notification we can honestly promise is the next-nights email.

import { BioCard, EmailOptInCard } from "./RoomCards";
import type { EmptyRoomVariant } from "@/lib/empty-room";
import { t, type Locale } from "@/lib/strings";

type RoomStrings = (typeof t)["en"]["room"];

export function EmptyLiveRoom({
  variant,
  hasBio,
  polishPath,
  notice,
  locale,
  initialEmail,
  emailSubscribed,
  onEmailOffered,
  onEmailDismissed,
  onEmailSubscribed,
  onBusyChange,
  pendingArrivals,
  onEnterFeed,
  onLeave,
  s,
}: {
  variant: EmptyRoomVariant;
  hasBio: boolean;
  polishPath: string;
  // Transient acknowledgement when the feed drained under the participant.
  notice: string | null;
  locale: Locale;
  initialEmail: string;
  emailSubscribed: boolean;
  onEmailOffered: () => void;
  onEmailDismissed: () => void;
  onEmailSubscribed: (email: string) => void;
  // True while a form is being filled here: the room holds the feed back
  // rather than swapping the screen away under the participant.
  onBusyChange: (busy: boolean) => void;
  // Someone eligible arrived while we were held back.
  pendingArrivals: boolean;
  onEnterFeed: () => void;
  onLeave: () => void;
  s: RoomStrings;
}) {
  const copy = s.empty;
  const title =
    variant === "alone"
      ? copy.aloneTitle
      : variant === "emptied"
        ? copy.emptiedTitle
        : copy.liveTitle;
  const body =
    variant === "alone"
      ? copy.aloneBody
      : variant === "emptied"
        ? copy.emptiedBody
        : copy.liveBody;

  return (
    <div className="room-card-enter flex h-full flex-col overflow-y-auto px-6 pb-10 pt-28">
      {/* The feed draining under your thumb deserves a word, not a silent swap.
          aria-live so it is announced rather than only seen. */}
      {notice && (
        <p
          className="night-pill self-start rounded-full bg-velvet/80 px-3 py-1.5 text-xs text-taupe backdrop-blur"
          aria-live="polite"
        >
          {notice}
        </p>
      )}

      {/* Held back mid-form: the arrival is announced, and entering the feed
          stays the participant's call rather than yanking the screen away. */}
      {pendingArrivals && (
        <button
          type="button"
          onClick={onEnterFeed}
          className="night-pill self-start rounded-full bg-velvet/80 px-3 py-1.5 text-xs text-blush backdrop-blur"
        >
          {s.newArrivalCue}
        </button>
      )}

      <h2 className="wordmark mt-2 text-[2.75rem] leading-[1.02] text-cream">
        {title}
      </h2>
      <p className="mt-4 max-w-sm leading-relaxed text-taupe">{body}</p>

      <p className="night-kicker mt-10">{copy.kicker}</p>

      <div className="mt-4 grid gap-3">
        <BioCard hasBio={hasBio} polishPath={polishPath} s={s} />
        {/* Same capture surface as the popup this card replaces on the empty
            screen, hence the room_popup source and its consent version. */}
        <EmailOptInCard
          title={s.emptyEmail.title}
          body={s.emptyEmail.body}
          initialEmail={initialEmail}
          locale={locale}
          source="room_popup"
          subscribed={emailSubscribed}
          onOffered={onEmailOffered}
          onDismissed={onEmailDismissed}
          onSubscribed={onEmailSubscribed}
          onOpenChange={onBusyChange}
          s={s}
        />
      </div>

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
