"use client";

import Link from "next/link";
import { useState } from "react";
import { emailPreferenceStrings } from "@/lib/email-preference-strings";
import type { Locale } from "@/lib/strings";

type State = "checking" | "confirm" | "submitting" | "unsubscribed" | "already_unsubscribed" | "invalid_token" | "failure";

export function UnsubscribeClient({ locale, validation }: { locale: Locale; validation: "valid" | "invalid" | "failure" }) {
  const [state, setState] = useState<State>(
    validation === "valid" ? "confirm" : validation === "invalid" ? "invalid_token" : "failure"
  );
  const s = emailPreferenceStrings[locale];

  async function unsubscribe() {
    setState("submitting");
    try {
      // Read the bearer credential from the address bar only at confirmation
      // time. Passing it through a Server-to-Client prop would serialize it
      // into the RSC response and hydration payload.
      const token = new URLSearchParams(window.location.search).get("token") ?? "";
      const response = await fetch("/api/unsubscribe", {
        method: "POST", cache: "no-store", referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json() as { status: State };
      setState(result.status);
    } catch { setState("failure"); }
  }

  const message = state === "unsubscribed" ? s.publicUnsubscribed
    : state === "already_unsubscribed" ? s.publicAlready
    : state === "invalid_token" ? s.publicInvalid
    : state === "failure" ? s.publicError : null;

  return <main className="night-shell flex min-h-dvh items-center justify-center px-6 py-16">
    <section className="night-panel w-full max-w-md p-7 text-center">
      <p className="night-kicker mb-4">Amourette</p>
      <h1 className="wordmark text-3xl text-cream">{s.publicTitle}</h1>
      {(state === "checking" || state === "submitting") && <p className="mt-6 text-sm text-taupe">{s.loading}</p>}
      {state === "confirm" && <>
        <p className="mt-6 text-sm leading-relaxed text-taupe">{s.publicConfirm}</p>
        <button type="button" onClick={unsubscribe} className="night-button mt-7 w-full px-5 py-3.5 text-xs">{s.publicAction}</button>
      </>}
      {message && <p role="status" className="mt-6 text-sm leading-relaxed text-cream">{message}</p>}
      <Link href="/" className="mt-7 inline-block text-xs text-taupe underline underline-offset-4">{s.back}</Link>
    </section>
  </main>;
}
