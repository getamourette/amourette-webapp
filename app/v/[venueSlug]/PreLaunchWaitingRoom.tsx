"use client";

// Pre-launch waiting room (#125): the night is scheduled and you are checked
// in, but nobody can browse or like until it opens. Its sibling is the empty
// live room (EmptyLiveRoom.tsx) and the two now share a visual language and the
// same two action cards (#152) — what keeps them apart is the promise each one
// makes. Here, the opening time is the whole point, so it stays the largest
// thing on screen; there, the night is already on and there is no deadline to
// show.

import { LanguageSelector } from "@/app/LanguageSelector";
import { BioCard, EmailOptInCard } from "./RoomCards";
import { t, type Locale } from "@/lib/strings";

type RoomStrings = (typeof t)["en"]["room"];

export function PreLaunchWaitingRoom({
  venueName,
  city,
  participantCount,
  guaranteedLaunchAt,
  guaranteedLaunchTime,
  hasBio,
  polishPath,
  locale,
  emailActionVisible,
  emailSubscribed,
  initialEmail,
  onEmailOffered,
  onEmailDismissed,
  onEmailSubscribed,
  errorMessage,
  onLeave,
  s,
}: {
  venueName: string;
  city: string | null;
  participantCount: number;
  guaranteedLaunchAt: string;
  guaranteedLaunchTime: string;
  hasBio: boolean;
  polishPath: string;
  locale: Locale;
  emailActionVisible: boolean;
  emailSubscribed: boolean;
  initialEmail: string;
  onEmailOffered: () => void;
  onEmailDismissed: () => void;
  onEmailSubscribed: (email: string) => void;
  errorMessage: string;
  onLeave: () => void;
  s: RoomStrings;
}) {
  const copy = s.preLaunch;

  return (
    <main className="night-shell min-h-dvh px-5 py-8 text-cream sm:px-6 sm:py-10">
      <div className="fixed right-5 top-5 z-20">
        <LanguageSelector />
      </div>

      <div className="night-content mx-auto flex min-h-[calc(100dvh-4rem)] max-w-md flex-col">
        {/* Same header as the live room chrome: the wordmark, then the venue on
            its own line with the live dot, so arriving in the waiting room and
            arriving in the room feel like the same place. */}
        <div className="min-w-0">
          <p className="wordmark text-lg text-cream">Amourette</p>
          <p className="night-kicker mt-1 inline-flex items-center gap-2">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-blush shadow-[0_0_12px_rgba(232,160,174,.55)]"
            />
            {city ? `${venueName} · ${city}` : venueName}
          </p>
        </div>

        <section className="room-card-enter my-auto py-12">
          <p className="night-kicker">{copy.kicker}</p>

          <h1 className="font-display mt-3 text-[2.8rem] font-medium leading-[1.02] text-cream">
            {copy.title}
          </h1>
          <p className="mt-5 max-w-sm leading-relaxed text-taupe">
            {copy.body}
          </p>

          {/* The opening time is what this screen exists to say: it stays the
              loudest element, and the only hot card above the fold. */}
          <div className="night-card-hot mt-9 p-6">
            <p className="font-display text-2xl leading-tight text-cream">
              <time dateTime={guaranteedLaunchAt}>
                {copy.deadline(guaranteedLaunchTime)}
              </time>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-taupe">
              {copy.earlier}
            </p>
          </div>

          <p
            className="mt-5 text-center font-label text-xs uppercase tracking-[0.18em] text-taupe"
            aria-live="polite"
            aria-atomic="true"
          >
            {copy.count(participantCount)}
          </p>

          {/* The same two cards as the empty live room, in the same order: the
              bio lever (adapting to an empty bio, #147) then the next-nights
              email. */}
          <div className="mt-8 grid gap-3">
            <BioCard hasBio={hasBio} polishPath={polishPath} s={s} />
            {emailActionVisible && (
              <EmailOptInCard
                title={copy.emailTitle}
                body={copy.emailBody}
                initialEmail={initialEmail}
                locale={locale}
                source="waiting_room"
                subscribed={emailSubscribed}
                onOffered={onEmailOffered}
                onDismissed={onEmailDismissed}
                onSubscribed={onEmailSubscribed}
                s={s}
              />
            )}
            <button
              type="button"
              onClick={onLeave}
              className="mt-3 self-center text-xs text-taupe/70 transition-colors hover:text-taupe"
            >
              {s.leave}
            </button>
            {errorMessage && (
              <p className="text-center text-sm text-blush" role="alert">
                {errorMessage}
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
