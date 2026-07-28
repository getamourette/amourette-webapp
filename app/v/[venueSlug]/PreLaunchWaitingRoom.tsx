"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { LanguageSelector } from "@/app/LanguageSelector";
import {
  InvalidEmailError,
  isValidEmail,
  subscribeEmail,
} from "@/lib/email-subscriptions";
import { t, type Locale } from "@/lib/strings";

type RoomStrings = (typeof t)["en"]["room"];

export function PreLaunchWaitingRoom({
  venueName,
  city,
  participantCount,
  guaranteedLaunchAt,
  guaranteedLaunchTime,
  polishPath,
  locale,
  emailActionVisible,
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
  polishPath: string;
  locale: Locale;
  emailActionVisible: boolean;
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
            {emailActionVisible && (
              <WaitingRoomEmailAction
                initialEmail={initialEmail}
                locale={locale}
                onOffered={onEmailOffered}
                onDismissed={onEmailDismissed}
                onSubscribed={onEmailSubscribed}
                s={s}
              />
            )}
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

function WaitingRoomEmailAction({
  initialEmail,
  locale,
  onOffered,
  onDismissed,
  onSubscribed,
  s,
}: {
  initialEmail: string;
  locale: Locale;
  onOffered: () => void;
  onDismissed: () => void;
  onSubscribed: (email: string) => void;
  s: RoomStrings;
}) {
  const copy = s.preLaunch;
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(initialEmail);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "success" | "already">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    onOffered();
  }, [onOffered]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "saving") return;
    if (!isValidEmail(email)) {
      setError(copy.emailInvalid);
      return;
    }
    if (!consent) {
      setError(copy.emailConsentRequired);
      return;
    }
    setState("saving");
    setError("");
    try {
      const result = await subscribeEmail(email, locale, "waiting_room");
      setEmail(result.email);
      setState(result.alreadySubscribed ? "already" : "success");
      setOpen(false);
      onSubscribed(result.email);
    } catch (submitError) {
      setState("idle");
      setError(
        submitError instanceof InvalidEmailError
          ? copy.emailInvalid
          : copy.emailError
      );
    }
  }

  function dismiss() {
    setOpen(false);
    setError("");
    onDismissed();
  }

  if (!open) {
    if (state === "success" || state === "already") {
      return (
        <button
          type="button"
          disabled
          className="night-button border border-emerald-400/40 bg-emerald-950/30 px-5 py-4 text-center text-emerald-200"
        >
          {copy.emailConfirmed}
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="night-button night-button-secondary px-5 py-4 text-center"
        aria-expanded="false"
      >
        {copy.emailAction}
      </button>
    );
  }

  return (
    <div className="night-card p-5">
      {state === "success" || state === "already" ? (
        <button
          type="button"
          disabled
          className="night-button w-full border border-emerald-400/40 bg-emerald-950/30 px-5 py-3 text-emerald-200"
          aria-live="polite"
        >
          {copy.emailConfirmed}
        </button>
      ) : (
        <form onSubmit={submit} noValidate>
          <p className="font-body text-[15px] text-cream">{copy.emailTitle}</p>
          <p className="mt-1 text-sm leading-relaxed text-taupe">{copy.emailBody}</p>
          <input
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={copy.emailPlaceholder}
            className="night-input mt-4 px-4 py-3"
          />
          <label className="mt-4 flex items-start gap-3 text-sm leading-relaxed text-taupe">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--wine)]"
            />
            <span>{copy.emailConsent}</span>
          </label>
          {error && <p className="mt-3 text-sm text-blush" role="alert">{error}</p>}
          <div className="mt-5 grid gap-2">
            <button
              type="submit"
              disabled={state === "saving"}
              className="night-button bg-cream px-5 py-3 text-ink disabled:opacity-60"
            >
              {state === "saving" ? copy.emailSaving : copy.emailSubmit}
            </button>
            <button
              type="button"
              disabled={state === "saving"}
              onClick={dismiss}
              className="px-5 py-3 text-xs text-taupe/70 disabled:opacity-60"
            >
              {copy.emailNotNow}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
