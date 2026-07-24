import Link from "next/link";
import { LanguageSelector } from "@/app/LanguageSelector";
import { t } from "@/lib/strings";

type RoomStrings = (typeof t)["en"]["room"];

export function PreLaunchWaitingRoom({
  venueName,
  city,
  participantCount,
  guaranteedLaunchAt,
  guaranteedLaunchTime,
  polishPath,
  errorMessage,
  onLeave,
  s,
}: {
  venueName: string;
  city: string | null;
  participantCount: number;
  guaranteedLaunchAt: string;
  guaranteedLaunchTime: string;
  polishPath: string;
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
        <p className="wordmark text-xl text-cream">Amourette</p>

        <section className="my-auto py-12">
          <p className="night-kicker inline-flex items-center gap-2.5">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-blush shadow-[0_0_12px_rgba(232,160,174,.55)]"
            />
            {copy.kicker}
          </p>
          <p className="mt-3 font-label text-[11px] uppercase tracking-[0.22em] text-taupe">
            {city ? `${venueName} · ${city}` : venueName}
          </p>

          <h1 className="font-display mt-5 text-[2.8rem] font-medium leading-[1.02] text-cream">
            {copy.title}
          </h1>
          <p className="mt-5 max-w-sm leading-relaxed text-taupe">
            {copy.body}
          </p>

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

          {/* #120 can add its optional install/notification card to this stack.
              The core waiting journey never depends on that future surface. */}
          <div className="mt-8 grid gap-3">
            <Link
              href={polishPath}
              className="night-button night-button-secondary px-5 py-4 text-center"
            >
              {copy.polishProfile}
            </Link>
            <button
              type="button"
              onClick={onLeave}
              className="px-5 py-3 text-xs text-taupe/70 transition-colors hover:text-taupe"
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
