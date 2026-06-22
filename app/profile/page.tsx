"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ensureAnonSession } from "@/lib/auth";
import { DEV_DEFAULT_VENUE_SLUG } from "@/lib/config";
import { GENDERS, type Gender } from "@/lib/profile";
import { browserLocale, t } from "@/lib/strings";
import { useBrowserLocale } from "@/lib/useLocale";

function initialVenueSlug() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("venue");
}

export default function ProfilePage() {
  const router = useRouter();
  // Pre-venue page: no venue yet, so fall back to the browser language
  // (resolved after mount to avoid an SSR hydration mismatch).
  const locale = useBrowserLocale();
  const s = t[locale].profile;
  const genderLabels = t[locale].genders;

  const [userId, setUserId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [bio, setBio] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [interestedIn, setInterestedIn] = useState<Gender[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [adultConfirmed, setAdultConfirmed] = useState(false);
  const [existingProfile, setExistingProfile] = useState(false);
  const [targetVenueSlug, setTargetVenueSlug] = useState(DEV_DEFAULT_VENUE_SLUG);
  const [targetVenueName, setTargetVenueName] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const targetRoomPath = `/v/${targetVenueSlug}`;

  // Ensure a session, and skip onboarding if this user already has a profile.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const user = await ensureAnonSession();
        if (!active) return;
        setUserId(user.id);

        const requestedVenueSlug = initialVenueSlug();
        let nextVenueSlug = DEV_DEFAULT_VENUE_SLUG;
        if (requestedVenueSlug) {
          const { data: venueRow, error: venueError } = await supabase
            .from("venues")
            .select("name, slug")
            .eq("slug", requestedVenueSlug)
            .maybeSingle();
          if (venueError) throw venueError;
          if (!active) return;
          if (venueRow) {
            nextVenueSlug = venueRow.slug;
            setTargetVenueSlug(venueRow.slug);
            setTargetVenueName(venueRow.name);
          }
        }

        const { data } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", user.id)
          .maybeSingle();
        if (!active) return;
        if (data) {
          const { data: privateProfile } = await supabase
            .from("profile_private")
            .select("adult_confirmed_at")
            .eq("id", user.id)
            .maybeSingle();
          if (!active) return;
          if (privateProfile?.adult_confirmed_at) {
            router.replace(`/v/${nextVenueSlug}`);
            return;
          }
          setExistingProfile(true);
        }
      } catch (e) {
        console.error(e);
        if (active) setMessage(t[browserLocale()].profile.sessionError);
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function toggleInterest(g: Gender) {
    setInterestedIn((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
    );
  }

  async function handleSaveProfile() {
    if (!userId) return;
    if (!adultConfirmed) return setMessage(s.needAdult);

    if (existingProfile) {
      setSaving(true);
      setMessage("");
      const { error } = await supabase.from("profile_private").upsert(
        {
          id: userId,
          adult_confirmed_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
      if (error) {
        console.error(error);
        setSaving(false);
        return setMessage(s.genericError);
      }
      router.replace(targetRoomPath);
      return;
    }

    if (!firstName.trim()) return setMessage(s.needFirstName);
    if (!photo) return setMessage(s.needPhoto);
    if (!gender) return setMessage(s.needGender);
    if (interestedIn.length === 0) return setMessage(s.needInterest);

    setSaving(true);
    setMessage("");

    // Photo goes to the public profile-photos bucket, namespaced by user id.
    const fileName = `${userId}/${Date.now()}-${photo.name}`;
    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(fileName, photo);
    if (uploadError) {
      console.error(uploadError);
      setSaving(false);
      return setMessage(s.photoUploadFailed);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("profile-photos").getPublicUrl(fileName);

    const { error } = await supabase.from("profiles").insert({
      id: userId,
      first_name: firstName.trim(),
      photo_url: publicUrl,
      bio: bio.trim() || null,
      gender,
      interested_in: interestedIn,
    });
    if (error) {
      console.error(error);
      setSaving(false);
      return setMessage(s.genericError);
    }

    const { error: privateError } = await supabase
      .from("profile_private")
      .upsert(
        {
          id: userId,
          adult_confirmed_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
    if (privateError) {
      console.error(privateError);
      setSaving(false);
      return setMessage(s.genericError);
    }

    router.replace(targetRoomPath);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-black via-zinc-950 to-neutral-900 px-6 py-10 text-white">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
        <p className="text-sm uppercase tracking-[0.35em] text-yellow-400">
          BarTap
        </p>
        <h1 className="mt-3 text-4xl font-black">
          {existingProfile ? s.ageTitle : s.title}
        </h1>
        <p className="mt-3 text-zinc-400">
          {existingProfile ? s.ageSubtitle : s.subtitle}
        </p>
        {targetVenueName && (
          <p className="mt-4 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 px-4 py-3 text-sm font-semibold text-yellow-100">
            {s.tonightAt(targetVenueName)}
          </p>
        )}

        {!existingProfile && (
          <>
            <div className="mt-8 flex justify-center">
              <label className="cursor-pointer">
                <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-zinc-500 bg-black/30 text-center text-sm text-zinc-400">
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    s.addPhoto
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </label>
            </div>

            <input
              className="mt-8 w-full rounded-2xl border border-white/10 bg-black/40 px-5 py-4 text-white outline-none placeholder:text-zinc-600 focus:border-yellow-400"
              placeholder={s.firstName}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />

            <textarea
              className="mt-4 h-28 w-full resize-none rounded-2xl border border-white/10 bg-black/40 px-5 py-4 text-white outline-none placeholder:text-zinc-600 focus:border-yellow-400"
              placeholder={s.bioOptional}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />

            <div className="mt-6">
              <p className="text-sm text-zinc-400">{s.iAm}</p>
              <div className="mt-2 flex gap-2">
                {GENDERS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={`flex-1 rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
                      gender === g
                        ? "border-yellow-400 bg-yellow-400 text-black"
                        : "border-white/10 bg-black/40 text-zinc-300 hover:border-yellow-400"
                    }`}
                  >
                    {genderLabels[g]}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <p className="text-sm text-zinc-400">{s.iWantToMeet}</p>
              <div className="mt-2 flex gap-2">
                {GENDERS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleInterest(g)}
                    className={`flex-1 rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
                      interestedIn.includes(g)
                        ? "border-yellow-400 bg-yellow-400 text-black"
                        : "border-white/10 bg-black/40 text-zinc-300 hover:border-yellow-400"
                    }`}
                  >
                    {genderLabels[g]}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <label className="mt-6 flex items-start gap-3 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={adultConfirmed}
            onChange={(e) => setAdultConfirmed(e.target.checked)}
            className="mt-1 h-4 w-4 accent-yellow-400"
          />
          <span>{s.adultConfirm}</span>
        </label>

        <button
          onClick={handleSaveProfile}
          disabled={saving}
          className="mt-8 w-full rounded-2xl bg-yellow-400 px-5 py-4 font-bold text-black transition hover:bg-yellow-300 disabled:opacity-50"
        >
          {saving ? s.saving : s.save}
        </button>

        {message && (
          <p className="mt-4 text-center text-sm text-zinc-300">{message}</p>
        )}
      </div>
    </main>
  );
}
