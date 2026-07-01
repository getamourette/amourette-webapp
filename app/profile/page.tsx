"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ensureAnonSession } from "@/lib/auth";
import { DEV_DEFAULT_VENUE_SLUG } from "@/lib/config";
import { GENDERS, type Gender } from "@/lib/profile";
import { browserLocale, t } from "@/lib/strings";
import { preferredLocale, useBrowserLocale } from "@/lib/useLocale";
import { LanguageSelector } from "@/app/LanguageSelector";

const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;
const ALLOWED_PROFILE_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function initialVenueSlug() {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("venue");
}

// Returning users reach the form via /profile?edit=1 from the landing gate. Edit
// mode pre-fills the existing profile and UPDATEs it instead of INSERTing.
function initialEditMode() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("edit") === "1";
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
  const [editMode, setEditMode] = useState(false);
  // Current photo when editing: kept if the user does not pick a new file
  // (photo_url is NOT NULL, so we never overwrite it with an empty value).
  const [existingPhotoUrl, setExistingPhotoUrl] = useState("");
  const [targetVenueSlug, setTargetVenueSlug] = useState(DEV_DEFAULT_VENUE_SLUG);
  const [targetVenueName, setTargetVenueName] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const targetRoomPath = `/v/${targetVenueSlug}`;
  const headline = editMode ? s.editTitle : existingProfile ? s.ageTitle : s.title;
  const subhead = editMode
    ? s.editSubtitle
    : existingProfile
      ? s.ageSubtitle
      : s.subtitle;

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

        // Edit mode: pre-fill the full profile and stay on the form (no
        // redirect). Falls back to the creation form if there is nothing yet.
        if (initialEditMode()) {
          const { data: existing, error: existingError } = await supabase
            .from("profiles")
            .select("first_name, bio, gender, interested_in, photo_url")
            .eq("id", user.id)
            .maybeSingle();
          if (existingError) throw existingError;
          if (!active) return;
          if (existing) {
            setEditMode(true);
            setFirstName(existing.first_name);
            setBio(existing.bio ?? "");
            setGender(existing.gender as Gender);
            setInterestedIn(existing.interested_in as Gender[]);
            setExistingPhotoUrl(existing.photo_url);
            setPreviewUrl(existing.photo_url);
            setAdultConfirmed(true);
          }
          return;
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
        if (active) {
          setMessage(t[preferredLocale(browserLocale())].profile.sessionError);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_PROFILE_PHOTO_TYPES.has(file.type)) {
      setPhoto(null);
      setPreviewUrl("");
      setMessage(s.photoInvalidType);
      return;
    }

    if (file.size > MAX_PROFILE_PHOTO_BYTES) {
      setPhoto(null);
      setPreviewUrl("");
      setMessage(s.photoTooLarge);
      return;
    }

    setMessage("");
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

    // Edit mode: UPDATE the existing profile. The photo is optional (keep the
    // current one if unchanged); the age gate was already cleared, so it is not
    // re-asked and profile_private is left untouched.
    if (editMode) {
      if (!firstName.trim()) return setMessage(s.needFirstName);
      if (!gender) return setMessage(s.needGender);
      if (interestedIn.length === 0) return setMessage(s.needInterest);

      setSaving(true);
      setMessage("");

      let photoUrl = existingPhotoUrl;
      if (photo) {
        const review = await reviewProfilePhoto(photo);
        if (!review.ok) {
          setSaving(false);
          return setMessage(
            review.rejected ? s.photoRejected : s.photoReviewFailed
          );
        }
        const fileName = `${userId}/${Date.now()}-${photo.name}`;
        const { error: uploadError } = await supabase.storage
          .from("profile-photos")
          .upload(fileName, photo);
        if (uploadError) {
          console.error(uploadError);
          setSaving(false);
          return setMessage(s.photoUploadFailed);
        }
        photoUrl = supabase.storage
          .from("profile-photos")
          .getPublicUrl(fileName).data.publicUrl;
      }
      if (!photoUrl) {
        setSaving(false);
        return setMessage(s.needPhoto);
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: firstName.trim(),
          photo_url: photoUrl,
          bio: bio.trim() || null,
          gender,
          interested_in: interestedIn,
        })
        .eq("id", userId);
      if (error) {
        console.error(error);
        setSaving(false);
        return setMessage(s.genericError);
      }

      router.replace("/");
      return;
    }

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

    const review = await reviewProfilePhoto(photo);
    if (!review.ok) {
      setSaving(false);
      return setMessage(
        review.rejected ? s.photoRejected : s.photoReviewFailed
      );
    }

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
    <main className="night-shell px-5 py-8 text-white sm:px-6 sm:py-10">
      <div className="fixed right-5 top-5 z-20">
        <LanguageSelector />
      </div>
      <section className="night-content mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center gap-8 lg:grid-cols-[1fr_28rem]">
        <div className="hidden lg:block">
          <p className="night-kicker">Paramour</p>
          <h1 className="mt-5 max-w-xl text-6xl font-black leading-[0.95] tracking-normal">
            {headline}
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-[#e7c7b4]">
            {subhead}
          </p>
          {targetVenueName && (
            <p className="mt-5 inline-flex rounded-2xl border border-[#f6b35a]/25 bg-[#f6b35a]/10 px-4 py-3 text-sm font-semibold text-[#fde7bd]">
              {s.tonightAt(targetVenueName)}
            </p>
          )}
          <div className="mt-8 flex flex-wrap gap-3 text-sm font-semibold">
            {s.trustPills.map((pill) => (
              <span key={pill} className="night-pill rounded-full px-4 py-2">
                {pill}
              </span>
            ))}
          </div>
        </div>

        <div className="night-panel w-full rounded-[2rem] p-6 sm:p-8">
          <p className="night-kicker lg:hidden">Paramour</p>
          <h1 className="mt-3 text-4xl font-black leading-tight tracking-normal lg:hidden">
            {headline}
          </h1>
          <p className="mt-3 leading-relaxed text-[#d9bbb1] lg:hidden">
            {subhead}
          </p>
          {targetVenueName && (
            <p className="mt-4 rounded-2xl border border-[#f6b35a]/25 bg-[#f6b35a]/10 px-4 py-3 text-sm font-semibold text-[#fde7bd]">
              {s.tonightAt(targetVenueName)}
            </p>
          )}

        {!existingProfile && (
          <>
            <div className="mt-8 flex justify-center">
              <label className="cursor-pointer">
                <div className="night-photo-ring flex h-36 w-36 items-center justify-center overflow-hidden rounded-full border border-dashed border-[#f6b35a]/45 bg-black/35 text-center text-sm font-semibold text-[#e7c7b4] transition hover:border-[#ff6b9d]/70">
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
              className="night-input mt-8 px-5 py-4"
              placeholder={s.firstName}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />

            <textarea
              className="night-input mt-4 h-28 resize-none px-5 py-4"
              placeholder={s.bioOptional}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />

            <div className="mt-6">
              <p className="text-sm font-semibold text-[#d9bbb1]">{s.iAm}</p>
              <div className="mt-2 flex gap-2">
                {GENDERS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={`night-button min-w-0 flex-1 px-3 py-3 text-sm ${
                      gender === g
                        ? "night-button-primary"
                        : "night-button-secondary"
                    }`}
                  >
                    {genderLabels[g]}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <p className="text-sm font-semibold text-[#d9bbb1]">
                {s.iWantToMeet}
              </p>
              <div className="mt-2 flex gap-2">
                {GENDERS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleInterest(g)}
                    className={`night-button min-w-0 flex-1 px-3 py-3 text-sm ${
                      interestedIn.includes(g)
                        ? "night-button-primary"
                        : "night-button-secondary"
                    }`}
                  >
                    {genderLabels[g]}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {!editMode && (
          <label className="mt-6 flex items-start gap-3 rounded-2xl border border-white/10 bg-black/35 p-4 text-sm leading-relaxed text-[#d9bbb1]">
            <input
              type="checkbox"
              checked={adultConfirmed}
              onChange={(e) => setAdultConfirmed(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[#f6b35a]"
            />
            <span>{s.adultConfirm}</span>
          </label>
        )}

        <button
          onClick={handleSaveProfile}
          disabled={saving}
          className="night-button night-button-primary mt-8 w-full px-5 py-4 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? s.saving : editMode ? s.saveChanges : s.save}
        </button>

        {editMode && (
          <Link
            href="/"
            className="night-button night-button-secondary mt-3 flex w-full justify-center px-5 py-4"
          >
            {s.back}
          </Link>
        )}

        {message && (
          <p className="mt-4 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-center text-sm text-[#e7c7b4]">
            {message}
          </p>
        )}
      </div>
      </section>
    </main>
  );
}

async function reviewProfilePhoto(
  photo: File
): Promise<{ ok: true } | { ok: false; rejected: boolean }> {
  const formData = new FormData();
  formData.set("photo", photo);

  try {
    const statusResponse = await fetch("/api/profile-photo/review");
    if (statusResponse.ok) {
      const status = (await statusResponse.json()) as unknown;
      if (
        typeof status === "object" &&
        status !== null &&
        "enabled" in status &&
        status.enabled === false
      ) {
        return { ok: true };
      }
    }

    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) return { ok: false, rejected: false };

    const response = await fetch("/api/profile-photo/review", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    });
    if (!response.ok) return { ok: false, rejected: false };

    const result = (await response.json()) as unknown;
    if (
      typeof result === "object" &&
      result !== null &&
      "approved" in result &&
      typeof result.approved === "boolean"
    ) {
      return result.approved
        ? { ok: true }
        : { ok: false, rejected: true };
    }
  } catch (error) {
    console.error(error);
  }

  return { ok: false, rejected: false };
}
