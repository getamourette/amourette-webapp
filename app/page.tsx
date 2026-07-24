"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ensureAnonSession } from "@/lib/auth";
import { DEV_DEFAULT_VENUE_SLUG } from "@/lib/config";
import { type Gender } from "@/lib/profile";
import { browserLocale, t } from "@/lib/strings";
import { preferredLocale, useBrowserLocale } from "@/lib/useLocale";
import { LanguageSelector } from "@/app/LanguageSelector";
import { WaitlistForm } from "@/app/WaitlistForm";

// No real QR / venue selection exists yet (see lib/config.ts), so the dev build
// keeps a direct link into the seeded test venue to stand in for scanning. It is
// hidden in production because a venue must only be reachable by scanning a QR.
const IS_DEV = process.env.NODE_ENV !== "production";

type ProfileSummary = {
  first_name: string;
  photo_url: string;
  bio: string | null;
  gender: Gender;
  interested_in: Gender[];
};

type ActiveChat = { matchId: string; name: string };

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

  const [state, setState] = useState<GateState>("loading");
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [activeChats, setActiveChats] = useState<ActiveChat[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const user = await ensureAnonSession();
        if (!active) return;

        const { data: profileRow, error: profileError } = await supabase
          .from("profiles")
          .select("first_name, photo_url, bio, gender, interested_in")
          .eq("id", user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        if (!active) return;

        if (!profileRow) {
          setState("new");
          return;
        }

        const { data: privateRow, error: privateError } = await supabase
          .from("profile_private")
          .select("adult_confirmed_at")
          .eq("id", user.id)
          .maybeSingle();
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
          gender: profileRow.gender as Gender,
          interested_in: profileRow.interested_in as Gender[],
        });
        setState("returning");

        // Any still-active match from tonight? RLS (matches_select_member)
        // already limits rows to the caller; the expiry guard drops a stale
        // match the 06:00 cron has not yet deleted.
        const { data: matchRows, error: matchError } = await supabase
          .from("matches")
          .select("id, profile_a, profile_b, expires_at")
          .gt("expires_at", new Date().toISOString());
        if (matchError) throw matchError;
        if (!active || !matchRows?.length) return;

        const otherIds = matchRows.map((m) =>
          m.profile_a === user.id ? m.profile_b : m.profile_a
        );
        const { data: others, error: othersError } = await supabase
          .from("profiles")
          .select("id, first_name")
          .in("id", otherIds);
        if (othersError) throw othersError;
        if (!active) return;

        const nameById = new Map(others?.map((o) => [o.id, o.first_name]));
        setActiveChats(
          matchRows.map((m) => {
            const otherId =
              m.profile_a === user.id ? m.profile_b : m.profile_a;
            return { matchId: m.id, name: nameById.get(otherId) ?? "" };
          })
        );
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
  }, []);

  const devLink = IS_DEV ? (
    <Link
      href={`/v/${DEV_DEFAULT_VENUE_SLUG}`}
      className="night-button night-button-secondary inline-flex px-5 py-3 text-xs"
    >
      {s.devEnterVenue}
    </Link>
  ) : null;

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
            <h1 className="wordmark text-[clamp(2.75rem,13vw,4.5rem)] leading-[0.92] text-red">
              Amourette
            </h1>
            <p className="max-w-xs rounded-2xl border border-champagne/20 bg-bordeaux px-4 py-3 text-sm text-blush">
              {error}
            </p>
          </div>
        ) : state === "loading" ? (
          <div className="flex w-full max-w-sm flex-col items-center gap-6">
            <p className="night-kicker">{s.kicker}</p>
            <h1 className="wordmark breathe text-[clamp(2.75rem,13vw,4.5rem)] leading-[0.92] text-red">
              Amourette
            </h1>
          </div>
        ) : state === "new" ? (
          <div className="landing-enter flex w-full max-w-sm flex-col items-center">
            <p className="night-kicker mb-7">{s.kicker}</p>
            <h1 className="wordmark text-[clamp(2.75rem,13vw,4.5rem)] leading-[0.92] text-red">
              Amourette
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
            {devLink && <div className="mt-9">{devLink}</div>}
          </div>
        ) : (
          <div className="landing-enter flex w-full max-w-sm flex-col items-center gap-7">
            <div className="flex flex-col items-center gap-3">
              <p className="night-kicker">{s.welcomeBack}</p>
              <h1 className="wordmark text-[clamp(2.5rem,11vw,3.5rem)] leading-[0.95] text-red">
                Amourette
              </h1>
            </div>

            {profile && (
              <div className="night-card flex w-full flex-col items-center gap-4 p-6 text-center">
                <div className="night-photo-ring h-20 w-20 overflow-hidden rounded-full border border-champagne/40 bg-bordeaux">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={profile.photo_url}
                    alt={profile.first_name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div>
                  <p className="wordmark text-2xl leading-tight text-cream">
                    {profile.first_name}
                  </p>
                  <p className="mt-1 text-sm text-taupe">
                    {p.iAm} {genderLabels[profile.gender].toLowerCase()} ·{" "}
                    {p.iWantToMeet.toLowerCase()}{" "}
                    {profile.interested_in
                      .map((g) => genderLabels[g].toLowerCase())
                      .join(", ")}
                  </p>
                </div>
                {profile.bio && (
                  <p className="text-sm leading-relaxed text-cream">
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

            {activeChats.length > 0 && (
              <div className="w-full">
                <p className="night-kicker mb-3">{s.activeChatTitle}</p>
                <div className="flex flex-col gap-2.5">
                  {activeChats.map((chat) => (
                    <Link
                      key={chat.matchId}
                      href={`/chat/${chat.matchId}`}
                      className="night-card-hot flex items-center justify-center px-5 py-3.5 text-sm text-cream transition-transform duration-200 active:scale-[0.98] motion-reduce:active:scale-100"
                    >
                      {s.openChatWith(chat.name)}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <p className="max-w-xs text-sm leading-relaxed text-taupe">
              {s.returningLead}
            </p>

            {devLink}
          </div>
        )}
      </section>

      {state === "new" && (
        <div className="landing-enter mx-auto mt-10 w-full max-w-sm">
          <WaitlistForm locale={locale} strings={waitlistStrings} />
        </div>
      )}
    </main>
  );
}
