"use client";

// The two action cards shared by the pre-launch waiting room (#125/#147) and
// the empty live room (#118/#152). Both screens are "you are here, nothing to
// swipe yet", so they offer the same two things and must not drift apart:
//
//   BioCard      — the only real "improve your odds" lever (there is no second
//                  photo), with copy that adapts to an empty bio.
//   EmailOptIn   — the next-nights email. It is the only notification we can
//                  actually deliver: web push needs an installed PWA on iOS,
//                  which #119 rejected as too much friction at the door.
//
// They speak the v2 system (docs/design.md): velvet ground, cream on taupe,
// blush as the soft state, red reserved for events.

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  EmailSubscriptionSource,
  InvalidEmailError,
  isValidEmail,
  subscribeEmail,
} from "@/lib/email-subscriptions";
import { t, type Locale } from "@/lib/strings";

type RoomStrings = (typeof t)["en"]["room"];

export function BioCard({
  hasBio,
  polishPath,
  s,
}: {
  hasBio: boolean;
  polishPath: string;
  s: RoomStrings;
}) {
  const copy = s.bio;
  return (
    <Link
      href={polishPath}
      className="night-card-hot flex items-start justify-between gap-4 p-5 text-left transition-transform active:scale-[0.99] motion-reduce:active:scale-100"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-body text-[15px] text-cream">
            {hasBio ? copy.fullTitle : copy.emptyTitle}
          </p>
          {/* Blush, never red: an incomplete profile is a soft state, not an
              error the participant did something wrong to deserve. */}
          {!hasBio && (
            <span className="rounded-full border border-blush/30 px-2 py-0.5 font-label text-[10px] uppercase tracking-[0.14em] text-blush">
              {copy.emptyBadge}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm leading-snug text-taupe">
          {hasBio ? copy.fullBody : copy.emptyBody}
        </p>
      </div>
      <span aria-hidden className="mt-0.5 shrink-0 text-taupe">
        →
      </span>
    </Link>
  );
}

export function EmailOptInCard({
  title,
  body,
  initialEmail,
  locale,
  source,
  subscribed,
  onOffered,
  onDismissed,
  onSubscribed,
  onOpenChange,
  s,
}: {
  title: string;
  body: string;
  initialEmail: string;
  locale: Locale;
  source: EmailSubscriptionSource;
  // Already on the list (typically captured earlier tonight by the live-room
  // popup): the card degrades to a confirmation instead of asking twice.
  subscribed: boolean;
  onOffered: () => void;
  onDismissed: () => void;
  onSubscribed: (email: string) => void;
  // Lets the empty live room know a form is being filled, so an arrival does
  // not swap the screen away mid-typing.
  onOpenChange?: (open: boolean) => void;
  s: RoomStrings;
}) {
  const copy = s.preLaunch;
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(initialEmail);
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "success" | "already">(
    "idle"
  );
  const [error, setError] = useState("");
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!subscribed) onOffered();
  }, [subscribed, onOffered]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  // Expanding the form used to leave it below the fold, so the participant had
  // to scroll to find the field they just asked for. Bring it into view instead.
  useEffect(() => {
    if (!open) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    formRef.current?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "center",
    });
  }, [open]);

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
      const result = await subscribeEmail(email, locale, source);
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

  const confirmed = subscribed || state === "success" || state === "already";

  if (confirmed) {
    return <EmailConfirmedCard label={copy.emailConfirmed} />;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded="false"
        className="night-card flex w-full items-center justify-between gap-4 p-5 text-left transition-transform active:scale-[0.99] motion-reduce:active:scale-100"
      >
        <div className="min-w-0">
          <p className="font-body text-[15px] text-cream">{title}</p>
          <p className="mt-1 text-sm leading-snug text-taupe">{body}</p>
        </div>
        <span aria-hidden className="shrink-0 text-taupe">
          →
        </span>
      </button>
    );
  }

  return (
    <div ref={formRef} className="night-card p-5">
      <form onSubmit={submit} noValidate>
        <p className="font-body text-[15px] text-cream">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-taupe">{body}</p>
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
        {error && (
          <p className="mt-3 text-sm text-blush" role="alert">
            {error}
          </p>
        )}
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
    </div>
  );
}

// Confirmation reads as a soft state in the palette (blush + check), not as the
// off-palette emerald the first pass borrowed from nowhere in the design system.
function EmailConfirmedCard({ label }: { label: string }) {
  return (
    <div
      className="night-card flex items-center justify-between gap-4 p-5"
      aria-live="polite"
    >
      <p className="font-body text-[15px] text-cream">{label}</p>
      <span aria-hidden className="shrink-0 text-blush">
        ✓
      </span>
    </div>
  );
}
