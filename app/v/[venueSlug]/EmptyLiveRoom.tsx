"use client";

// Empty live-room state (#118): the night is already live, but the participant
// has nothing to scroll. Deliberately separate from #125's pre-launch waiting
// room, and sharing its two action cards (see RoomCards.tsx) so the two screens
// read as a family without becoming the same screen (#152).
//
// Three variants, one action set. The framing is the only thing that changes,
// because the participant can do exactly the same two things in all three:
//
//   alone   — you are the only one checked in right now. "It's filling up" is
//             true here; "you are the first tonight" would not be (see
//             lib/empty-room.ts).
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
  onHoldChange,
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
  // True while an answer is actually being typed here: the room holds the feed
  // back rather than swapping the screen away under the participant.
  onHoldChange: (holding: boolean) => void;
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
    <div className="relative h-full">
      {/* The room chrome (wordmark, venue, live count) floats over every room
          state, but this is the one that scrolls text under it, and it scrolls
          on velvet rather than on a photo with its own scrim. Without this band
          the paragraph and the cards ride straight through the header on the
          way up. It stays opaque across the chrome (which ends around 106px)
          and fades out just above where the content starts, so scrolled text
          dissolves before the wordmark and nothing is dimmed at rest. */}
      <div
        aria-hidden
        className="room-text-top-scrim pointer-events-none absolute inset-x-0 top-0 z-20 h-[136px]"
      />

      {/* Keep the arrival action outside the scrolling content. The email card
          scrolls itself into view when it opens, so rendering this action at
          the top of that same scroller left it above the visible viewport just
          when it mattered. Floating it below the persistent room chrome keeps
          the participant's draft in place while making the new profile
          immediately discoverable. */}
      {pendingArrivals && (
        <button
          type="button"
          onClick={onEnterFeed}
          aria-live="polite"
          className="night-card-hot room-card-enter absolute inset-x-6 top-[7.25rem] z-30 flex items-center justify-between gap-4 p-5 text-left transition-transform active:scale-[0.99] motion-reduce:active:scale-100"
        >
          <p className="font-body text-[15px] text-cream">
            {copy.heldArrival}
          </p>
          <span aria-hidden className="shrink-0 text-blush">
            →
          </span>
        </button>
      )}

      <div className="room-card-enter flex h-full flex-col overflow-y-auto px-6 pb-10 pt-36">
        {/* The feed draining under your thumb deserves a word, not a silent
            swap. aria-live so it is announced rather than only seen. */}
        {notice && (
          <p
            className="night-pill self-start rounded-full bg-velvet/80 px-3 py-1.5 text-xs text-taupe backdrop-blur"
            aria-live="polite"
          >
            {notice}
          </p>
        )}

        <h2 className="wordmark mt-2 text-[2.75rem] leading-[1.02] text-cream">
          {title}
        </h2>
        <p className="mt-4 max-w-sm leading-relaxed text-taupe">{body}</p>

        <p className="night-kicker mt-10">{copy.kicker}</p>

        <div className="mt-4 grid gap-3">
          <BioCard hasBio={hasBio} polishPath={polishPath} s={s} />
          {/* Its own source: this is an inline card on the empty room, not the
              2-minute popup it replaces here, and `source` records where we
              asked. Same consent version as the other live-night surfaces. */}
          <EmailOptInCard
            title={s.emailCard.title}
            body={s.emailCard.body}
            initialEmail={initialEmail}
            locale={locale}
            source="empty_room"
            subscribed={emailSubscribed}
            onOffered={onEmailOffered}
            onDismissed={onEmailDismissed}
            onSubscribed={onEmailSubscribed}
            onHoldChange={onHoldChange}
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
    </div>
  );
}
