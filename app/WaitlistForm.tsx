"use client";

import { useState } from "react";
import type { Locale } from "@/lib/strings";
import { InvalidEmailError, isValidEmail, subscribeEmail } from "@/lib/waitlist";

type WaitlistStrings = {
  label: string;
  placeholder: string;
  help: string;
  cta: string;
  successText: string;
  invalidText: string;
  errorText: string;
};

type Status = "idle" | "loading" | "success" | "error";

// Cold-acquisition capture on the new-visitor splash (#71). Discreet by design:
// the page's real action is IRL (scan at the bar), so this stays a quiet ghost
// field, not a loud CTA. Persistence lands with email_signups (#105).
export function WaitlistForm({
  locale,
  strings,
  className = "",
}: {
  locale: Locale;
  strings: WaitlistStrings;
  className?: string;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorText, setErrorText] = useState("");

  const invalid = status === "error";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (status === "loading") return;

    if (!isValidEmail(email)) {
      setErrorText(strings.invalidText);
      setStatus("error");
      return;
    }

    setStatus("loading");
    try {
      await subscribeEmail(email, locale);
      setStatus("success");
    } catch (err) {
      // Errors are never red here — red is love, not danger (docs/design.md).
      // The message renders in blush below the field. An invalid address that
      // slips past the pre-check reads as the invalid copy; anything else is a
      // save failure the visitor can retry.
      setErrorText(err instanceof InvalidEmailError ? strings.invalidText : strings.errorText);
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className={`flex flex-col items-center gap-3 ${className}`}>
        <hr className="hairline w-16" />
        <p className="max-w-xs text-center text-sm leading-relaxed text-cream">
          {strings.successText}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`flex w-full flex-col items-center gap-2.5 ${className}`}
      noValidate
    >
      <label htmlFor="waitlist-email" className="night-kicker !text-[0.6rem]">
        {strings.label}
      </label>

      <div
        className={`flex w-full items-center gap-2 rounded-2xl border bg-bordeaux-deep py-1.5 pl-4 pr-1.5 transition-colors duration-300 focus-within:border-blush ${
          invalid ? "border-blush/50" : "border-champagne/20"
        }`}
      >
        <input
          id="waitlist-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === "error") {
              setStatus("idle");
              setErrorText("");
            }
          }}
          placeholder={strings.placeholder}
          aria-invalid={invalid}
          aria-describedby="waitlist-help"
          className="min-w-0 flex-1 bg-transparent text-sm text-cream outline-none placeholder:text-taupe/70"
        />
        <button
          type="submit"
          aria-label={strings.cta}
          disabled={status === "loading"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cream/25 text-cream transition-[transform,border-color,opacity] duration-200 hover:border-cream/45 active:scale-[0.97] disabled:opacity-60 motion-reduce:active:scale-100"
        >
          {status === "loading" ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-blush/40 border-t-blush motion-reduce:animate-none" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M2.5 8h10M9 4.5 12.5 8 9 11.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      </div>

      <p
        id="waitlist-help"
        aria-live="polite"
        className={`text-center text-[0.62rem] uppercase tracking-[0.12em] ${
          invalid ? "text-blush" : "text-taupe/70"
        }`}
        style={{ fontFamily: "var(--font-jost), system-ui, sans-serif" }}
      >
        {invalid ? errorText : strings.help}
      </p>
    </form>
  );
}
