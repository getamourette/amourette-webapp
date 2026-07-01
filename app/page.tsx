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
      className="night-button night-button-secondary mt-6 inline-flex px-5 py-3 text-sm"
    >
      {s.devEnterVenue}
    </Link>
  ) : null;

  return (
    <main className="night-shell flex min-h-screen items-end px-6 py-10 sm:items-center">
      <div className="fixed right-5 top-5 z-20">
        <LanguageSelector />
      </div>
      <section className="night-content mx-auto w-full max-w-5xl">
        {error ? (
          <div className="max-w-2xl">
            <h1 className="text-6xl font-black leading-[0.9] tracking-normal text-white sm:text-8xl">
              Paramour
            </h1>
            <p className="mt-10 max-w-md rounded-2xl border border-red-300/20 bg-red-950/20 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          </div>
        ) : state === "loading" ? (
          <div className="max-w-2xl">
            <p className="night-kicker">{s.welcome}</p>
            <h1 className="mt-4 text-6xl font-black leading-[0.9] tracking-normal text-white sm:text-8xl">
              Paramour
            </h1>
            <div className="mt-10 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-[#e7c7b4] backdrop-blur">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#f6b35a] shadow-[0_0_18px_rgba(246,179,90,0.9)]" />
              {s.settingUp}
            </div>
          </div>
        ) : state === "new" ? (
          <div className="max-w-2xl">
            <p className="night-kicker">{s.welcome}</p>
            <h1 className="mt-4 text-6xl font-black leading-[0.9] tracking-normal text-white sm:text-8xl">
              Paramour
            </h1>
            <p className="mt-6 max-w-sm text-xl font-medium leading-relaxed text-[#f9d7c4] sm:text-2xl">
              {s.tagline}
            </p>
            <p className="mt-8 inline-flex rounded-2xl border border-[#f6b35a]/25 bg-[#f6b35a]/10 px-4 py-3 text-sm font-semibold text-[#fde7bd]">
              {s.newVisitorLead}
            </p>
            {devLink && <div>{devLink}</div>}
          </div>
        ) : (
          <div className="grid w-full items-center gap-8 lg:grid-cols-[1fr_28rem]">
            <div className="max-w-xl">
              <p className="night-kicker">{s.welcomeBack}</p>
              <h1 className="mt-4 text-5xl font-black leading-[0.95] tracking-normal text-white sm:text-7xl">
                Paramour
              </h1>
              <p className="mt-6 inline-flex rounded-2xl border border-[#f6b35a]/25 bg-[#f6b35a]/10 px-4 py-3 text-sm font-semibold text-[#fde7bd]">
                {s.returningLead}
              </p>

              {activeChats.length > 0 && (
                <div className="mt-8">
                  <p className="text-sm font-semibold text-[#d9bbb1]">
                    {s.activeChatTitle}
                  </p>
                  <div className="mt-3 flex flex-col gap-2">
                    {activeChats.map((chat) => (
                      <Link
                        key={chat.matchId}
                        href={`/chat/${chat.matchId}`}
                        className="night-button night-button-primary px-5 py-3 text-sm"
                      >
                        {s.openChatWith(chat.name)}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {devLink}
            </div>

            {profile && (
              <div className="night-panel w-full rounded-[2rem] p-6 sm:p-8">
                <p className="night-kicker">{s.yourProfile}</p>
                <div className="mt-5 flex items-center gap-4">
                  <div className="night-photo-ring h-20 w-20 overflow-hidden rounded-full border border-[#f6b35a]/45 bg-black/35">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={profile.photo_url}
                      alt={profile.first_name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div>
                    <p className="text-2xl font-black leading-tight text-white">
                      {profile.first_name}
                    </p>
                    <p className="mt-1 text-sm text-[#d9bbb1]">
                      {p.iAm} {genderLabels[profile.gender].toLowerCase()}
                    </p>
                  </div>
                </div>

                {profile.bio && (
                  <p className="mt-4 leading-relaxed text-[#e7c7b4]">
                    {profile.bio}
                  </p>
                )}

                <p className="mt-4 text-sm text-[#d9bbb1]">
                  {p.iWantToMeet}:{" "}
                  {profile.interested_in
                    .map((g) => genderLabels[g].toLowerCase())
                    .join(", ")}
                </p>

                <Link
                  href="/profile?edit=1"
                  className="night-button night-button-secondary mt-6 flex w-full justify-center px-5 py-4"
                >
                  {s.editProfile}
                </Link>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
