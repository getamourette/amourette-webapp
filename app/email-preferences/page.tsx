"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { LanguageSelector } from "@/app/LanguageSelector";
import { ensureAnonSession } from "@/lib/auth";
import { emailPreferenceStrings } from "@/lib/email-preference-strings";
import { getEmailSubscription, InvalidEmailError, subscribeEmail, unsubscribeMyEmail } from "@/lib/email-subscriptions";
import { useBrowserLocale } from "@/lib/useLocale";

type Subscription = Awaited<ReturnType<typeof getEmailSubscription>>;

export default function EmailPreferencesPage() {
  const locale = useBrowserLocale();
  const s = emailPreferenceStrings[locale];
  const [subscription, setSubscription] = useState<Subscription>(null);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await ensureAnonSession();
        const row = await getEmailSubscription();
        if (!active) return;
        setSubscription(row);
        setEmail(row?.email ?? "");
      } catch { if (active) setError(s.error); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [s.error]);

  async function subscribe(event: FormEvent) {
    event.preventDefault();
    if (!consent) return;
    setSaving(true); setError("");
    try {
      await subscribeEmail(email, locale, "subscription_management");
      setSubscription(await getEmailSubscription());
      setConsent(false);
    } catch (caught) {
      setError(caught instanceof InvalidEmailError ? s.invalidEmail : s.error);
    } finally { setSaving(false); }
  }

  async function unsubscribe() {
    setSaving(true); setError("");
    try {
      const result = await unsubscribeMyEmail();
      if (result === "failure") throw new Error("Unsubscribe failed");
      setSubscription(await getEmailSubscription());
    } catch { setError(s.error); }
    finally { setSaving(false); }
  }

  const isSubscribed = subscription?.status === "subscribed";
  return <main className="night-shell min-h-dvh px-6 pb-14 pt-20">
    <div className="fixed right-5 top-5 z-20"><LanguageSelector /></div>
    <section className="mx-auto w-full max-w-md">
      <p className="night-kicker mb-4">Amourette</p>
      <h1 className="wordmark text-4xl text-cream">{s.title}</h1>
      <div className="night-panel mt-7 p-6">
        {loading ? <p className="text-sm text-taupe">{s.loading}</p> : <>
          <p className="text-sm leading-relaxed text-cream">
            {isSubscribed ? s.subscribed : subscription ? s.unsubscribed : s.noSubscription}
          </p>
          {isSubscribed ? <>
            <p className="mt-5 text-xs uppercase tracking-[0.16em] text-taupe">{s.emailLabel}</p>
            <p className="mt-1 break-all text-sm text-cream">{subscription.email}</p>
            <button type="button" disabled={saving} onClick={unsubscribe} className="night-button night-button-secondary mt-6 w-full px-5 py-3.5 text-xs disabled:opacity-60">
              {saving ? s.saving : s.unsubscribe}
            </button>
          </> : <form onSubmit={subscribe} className="mt-6">
            <label className="block text-xs uppercase tracking-[0.16em] text-taupe" htmlFor="preference-email">{s.emailLabel}</label>
            <input id="preference-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder={s.emailPlaceholder} className="night-input mt-2 w-full px-4 py-3 text-sm" />
            <label className="mt-4 flex items-start gap-3 text-sm leading-relaxed text-taupe">
              <input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1" />
              <span>{s.consent}</span>
            </label>
            <button type="submit" disabled={saving || !consent} className="night-button mt-6 w-full px-5 py-3.5 text-xs disabled:opacity-60">
              {saving ? s.saving : subscription ? s.resubscribe : s.subscribe}
            </button>
          </form>}
          {error && <p role="alert" className="mt-4 text-sm text-blush">{error}</p>}
        </>}
      </div>
      <section className="mt-8 text-sm leading-relaxed text-taupe">
        <h2 className="night-kicker mb-3">{s.privacyTitle}</h2>
        <p>{s.privacy}</p><p className="mt-3">{s.rights}</p><p className="mt-3">{s.contactPending}</p>
      </section>
      <Link href="/" className="mt-9 inline-block text-xs text-taupe underline underline-offset-4">{s.back}</Link>
    </section>
  </main>;
}
