"use client";

import { publishedName } from '@/lib/text-moderation';
import { ProfilePhoto } from "@/components/ProfilePhoto";
import { BrandLogo } from "@/app/BrandLogo";

import { useCallback, useEffect, useState } from "react";
import { PhotoStatus } from "@/components/PhotoStatus";
import { OwnerProfileReview } from '@/components/OwnerProfileReview';
import { useProfileReview } from '@/lib/useProfileReview';
import { usePhotoState, PHOTO_REFRESH_EVENT } from "@/lib/usePhotoState";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ensureAnonSession } from "@/lib/auth";
import { isGender, isInterestedIn, type Gender } from "@/lib/profile";
import { matchingConsentStrings } from "@/lib/matching-consent-strings";
import { browserLocale, INSTAGRAM_URL, t } from "@/lib/strings";
import { preferredLocale, useBrowserLocale } from "@/lib/useLocale";
import { LanguageSelector } from "@/app/LanguageSelector";
import { WaitlistForm } from "@/app/WaitlistForm";
import { emailPreferenceStrings } from "@/lib/email-preference-strings";
import { LegalLinks } from "@/components/LegalLinks";
import { legalLabels } from "@/lib/legal";

type ProfileSummary = {
  first_name: string | null;
  photo_url: string | null;
  bio: string | null;
  gender: Gender | null;
  interested_in: Gender[];
};

// "loading" until the session + profile are resolved, then either the new-visitor
// pitch or the returning-user dashboard (decisions.md, 2026-07-01: gate page).
type GateState = "loading" | "new" | "returning";

export default function Home() {
  // Pre-venue page: no venue yet, so fall back to the browser language
  // (resolved after mount to avoid an SSR hydration mismatch).
  const locale = useBrowserLocale();
  const s = t[locale].landing;
  const p = t[locale].profile;
  const genderLabels = t[locale].genders;

  const [userId, setUserId] = useState<string | null>(null);
  const photoState = usePhotoState(userId);
  const profileReview = useProfileReview(userId);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => { const refresh = () => setRefreshKey(k => k + 1); window.addEventListener(PHOTO_REFRESH_EVENT, refresh); return () => window.removeEventListener(PHOTO_REFRESH_EVENT, refresh); }, []);
  const [state, setState] = useState<GateState>("loading");
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [error, setError] = useState("");

  // A failed load keeps a way forward without a reload (#244): the button, or
  // the network or the screen coming back.
  const retryLoad = useCallback(() => { setError(""); setState("loading"); setRefreshKey(k => k + 1); }, []);
  useEffect(() => {
    if (!error) return;
    const onVisible = () => { if (document.visibilityState === "visible") retryLoad(); };
    window.addEventListener("online", retryLoad);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", retryLoad);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [error, retryLoad]);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const user = await ensureAnonSession();
        if (!active) return;
        setUserId(user.id);

        const [profileResult, privateResult] = await Promise.all([
          supabase.rpc("get_my_profile")
            .maybeSingle(),
          supabase.from("profile_private")
            .select("adult_confirmed_at")
            .eq("id", user.id)
            .maybeSingle(),
        ]);
        const { data: profileRow, error: profileError } = profileResult;
        if (profileError) throw profileError;
        if (!active) return;

        if (!profileRow) {
          setState("new");
          return;
        }

        const { data: privateRow, error: privateError } = privateResult;
        if (privateError) throw privateError;
        if (!active) return;

        // A profile row without a cleared age gate means onboarding never
        // finished — show the pitch, not a half-built dashboard.
        if (!privateRow?.adult_confirmed_at) {
          setState("new");
          return;
        }

        setProfile({
          first_name: profileRow.first_name,
          photo_url: profileRow.photo_url,
          bio: profileRow.bio,
          gender: isGender(profileRow.gender) ? profileRow.gender : null,
          interested_in: isInterestedIn(profileRow.interested_in) ? profileRow.interested_in : [],
        });
        setState("returning");
      } catch (e) {
        console.error(e);
        if (active) {
          setError(t[preferredLocale(browserLocale())].landing.sessionError);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [refreshKey]);

  // Direction C ("Cérémonie", #71): a centred, ceremonial front door. The
  // wordmark is red here — the landing (all its gate states) is the brand's
  // public threshold, so red is the identity; inside the app the wordmark is
  // cream and red goes back to being only the like/CTA/reveal. The real action
  // (scan a QR at the bar) is not clickable off-venue, so this reads as an
  // affiche, not a funnel.
  const waitlistStrings = {
    label: s.waitlistLabel,
    placeholder: s.waitlistPlaceholder,
    help: s.waitlistHelp,
    cta: s.waitlistCta,
    successText: s.waitlistSuccess,
    alreadyText: s.waitlistAlready,
    invalidText: s.waitlistInvalid,
    errorText: s.waitlistError,
  };

  return (
    <main className="night-shell flex min-h-dvh flex-col px-8 pb-12 pt-20">
      <div className="fixed right-5 top-5 z-20">
        <LanguageSelector />
      </div>

      <section className="night-content flex flex-1 flex-col items-center justify-center text-center">
        {error ? (
          <div className="landing-enter flex w-full max-w-sm flex-col items-center gap-6">
            <h1 className="landing-brand">
              <BrandLogo tone="ruby" className="w-full" />
            </h1>
            <p role="alert" className="max-w-xs rounded-2xl border border-champagne/20 bg-bordeaux px-4 py-3 text-sm text-blush">
              {error}
            </p>
            <button type="button" onClick={retryLoad} className="night-button night-button-primary min-h-11 px-6 py-3">
              {s.retry}
            </button>
          </div>
        ) : state === "loading" ? (
          <div className="flex w-full max-w-sm flex-col items-center gap-6">
            <p className="night-kicker">{s.kicker}</p>
            <h1 className="landing-brand breathe">
              <BrandLogo tone="ruby" className="w-full" />
            </h1>
          </div>
        ) : state === "new" ? (
          <div className="landing-enter flex w-full max-w-sm flex-col items-center">
            <p className="night-kicker mb-7">{s.kicker}</p>
            <h1 className="landing-brand">
              <BrandLogo variant="vertical" tone="ruby" className="w-full" />
            </h1>
            <p className="mt-6 max-w-xs text-lg font-light leading-relaxed text-cream sm:text-xl">
              {s.promise}
            </p>
            <hr className="hairline my-8 w-20" />
            <div
              className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[0.62rem] uppercase tracking-[0.18em] text-taupe"
              style={{ fontFamily: "var(--font-jost), system-ui, sans-serif" }}
            >
              {s.how.map((step, i) => (
                <span key={step} className="flex items-center gap-2.5">
                  {i > 0 && (
                    <span className="h-[3px] w-[3px] rounded-full bg-champagne/50" />
                  )}
                  {step}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="landing-enter flex w-full max-w-sm flex-col items-center gap-7">
            <div className="flex w-full flex-col items-center gap-3">
              <p className="night-kicker">{s.welcomeBack}</p>
              <h1 className="w-full max-w-[280px]">
                <BrandLogo tone="ruby" className="w-full" />
              </h1>
            </div>

            <OwnerProfileReview state={profileReview} locale={locale} />
            <PhotoStatus consolidated={Boolean(profileReview.review) || profileReview.error} state={photoState.state} locale={locale} />
            {profile && (
              <div className="night-card flex w-full flex-col items-center gap-4 p-6 text-center">
                <div className="night-photo-ring h-20 w-20 overflow-hidden rounded-full border border-champagne/40 bg-bordeaux">
                  <ProfilePhoto profileId={userId ?? undefined}
                    src={profile.photo_url}
                    ownProfileSource circular
                    alt={publishedName(profile.first_name, locale)}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div>
                  <p className="wordmark text-2xl leading-tight text-cream">
                    {publishedName(profile.first_name, locale)}
                  </p>
                  <p className="mt-1 text-sm text-taupe">
                    {profile.gender ? <>{p.iAm} {genderLabels[profile.gender].toLowerCase()} ·{" "}
                    {p.iWantToMeet.toLowerCase()}{" "}
                    {profile.interested_in
                      .map((g) => genderLabels[g].toLowerCase())
                      .join(", ")}</> : matchingConsentStrings[locale].inactive}
                  </p>
                </div>
                {profile.bio && (
                  <p className="w-full wrap-anywhere text-sm leading-relaxed text-cream">
                    {profile.bio}
                  </p>
                )}
                <Link
                  href="/profile?edit=1"
                  className="night-button night-button-secondary mt-1 flex w-full justify-center px-5 py-3.5 text-xs"
                >
                  {s.editProfile}
                </Link>
              </div>
            )}

            <p className="max-w-xs text-sm leading-relaxed text-taupe">
              {s.returningLead}
            </p>
          </div>
        )}
      </section>

      {state === "new" && (
        <div className="landing-enter mx-auto mt-10 w-full max-w-sm">
          <WaitlistForm locale={locale} strings={waitlistStrings} />
        </div>
      )}
      <footer className="mt-10 flex flex-wrap justify-center gap-x-6 text-center">
        {/* Own row above the utility links: the account is where a visitor
            sees the nights before one is announced near them (#345). */}
        <div className="flex w-full justify-center">
          <a
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-sm text-sm text-cream underline decoration-champagne/40 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blush"
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <path d="M17.5 6.5h.01" />
            </svg>
            {s.instagram}
            <span className="sr-only"> ({legalLabels[locale].newTab})</span>
          </a>
        </div>
        <Link
          href="/email-preferences"
          className="inline-flex min-h-11 items-center text-xs text-taupe underline decoration-champagne/40 underline-offset-4"
        >
          {emailPreferenceStrings[locale].footerLink}
        </Link>
        <LegalLinks locale={locale} />
      </footer>
    </main>
  );
}
