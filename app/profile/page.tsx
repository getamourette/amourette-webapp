"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ensureAnonSession } from "@/lib/auth";
import { DEV_DEFAULT_VENUE_SLUG } from "@/lib/config";
import { type Gender } from "@/lib/profile";
import { browserLocale, t } from "@/lib/strings";
import { preferredLocale, useBrowserLocale } from "@/lib/useLocale";
import { LanguageSelector } from "@/app/LanguageSelector";
import { AgeGate, type ProfileFormHandlers, type ProfileFormState } from "./fields";
import { OnboardingWizard } from "./OnboardingWizard";
import { ProfileEditor } from "./ProfileEditor";
import { clearDraft, loadDraft, saveDraft } from "./draft";

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
  // Onboarding is a guided wizard; the step index persists in the draft so a
  // returning user resumes where they stopped.
  const [step, setStep] = useState(0);
  const [resumed, setResumed] = useState(false);
  // existingProfile: has a profile row but never confirmed age (age-gate-only
  // screen). editMode: updating a complete profile. loading: initial checks.
  const [existingProfile, setExistingProfile] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  // Current photo when editing: kept if the user does not pick a new file
  // (photo_url is NOT NULL, so we never overwrite it with an empty value).
  const [existingPhotoUrl, setExistingPhotoUrl] = useState("");
  const [targetVenueSlug, setTargetVenueSlug] = useState(DEV_DEFAULT_VENUE_SLUG);
  const [targetVenueName, setTargetVenueName] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const targetRoomPath = `/v/${targetVenueSlug}`;
  const backHref = targetVenueName ? targetRoomPath : "/";

  // Ensure a session, resolve the venue, and pick the mode (edit / age-gate /
  // create). Create mode restores the localStorage draft so an interrupted
  // onboarding resumes instead of starting over.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const requestedVenueSlug = initialVenueSlug();
        const user = await ensureAnonSession();
        if (!active) return;
        setUserId(user.id);

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

        // Edit mode: pre-fill the full profile and stay on the editor (no
        // redirect). Falls back to the creation flow if there is nothing yet.
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
            setLoading(false);
            return;
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
          // Profile exists but age never confirmed: age-gate-only screen.
          setExistingProfile(true);
          setLoading(false);
          return;
        }

        // Fresh onboarding: restore any saved draft. The photo is not persisted
        // (a File does not serialize; #98 tracks the IndexedDB upgrade), so on a
        // full reload it is missing and we clamp back to the photo step.
        const draft = loadDraft(user.id);
        if (draft) {
          setFirstName(draft.firstName);
          setBio(draft.bio);
          setGender(draft.gender);
          setInterestedIn(draft.interestedIn);
          setAdultConfirmed(draft.adultConfirmed);
          const furthestReachable = draft.firstName.trim() ? 1 : 0;
          setStep(Math.min(draft.step, furthestReachable));
          setResumed(
            draft.firstName.trim() !== "" ||
              draft.gender !== "" ||
              draft.interestedIn.length > 0
          );
        }
        setLoading(false);
      } catch (e) {
        console.error(e);
        if (active) {
          setMessage(t[preferredLocale(browserLocale())].profile.sessionError);
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  // Persist the create-mode draft on every change so an interruption resumes.
  useEffect(() => {
    if (loading || editMode || existingProfile || !userId) return;
    saveDraft(userId, {
      firstName,
      bio,
      gender,
      interestedIn,
      adultConfirmed,
      step,
    });
  }, [
    loading,
    editMode,
    existingProfile,
    userId,
    firstName,
    bio,
    gender,
    interestedIn,
    adultConfirmed,
    step,
  ]);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_PROFILE_PHOTO_TYPES.has(file.type)) {
      setPhoto(null);
      setPreviewUrl(existingPhotoUrl);
      setMessage(s.photoInvalidType);
      return;
    }

    if (file.size > MAX_PROFILE_PHOTO_BYTES) {
      setPhoto(null);
      setPreviewUrl(existingPhotoUrl);
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

  const form: ProfileFormState = {
    firstName,
    bio,
    gender,
    interestedIn,
    previewUrl,
    adultConfirmed,
  };

  const handlers: ProfileFormHandlers = {
    setFirstName,
    setBio,
    setGender: (value) => setGender(value),
    toggleInterest,
    onPhotoChange: handlePhotoChange,
    setAdultConfirmed,
  };

  async function handleSubmit() {
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

      router.replace(backHref);
      return;
    }

    // Age-gate-only: profile exists, just record the adult confirmation.
    if (existingProfile) {
      if (!adultConfirmed) return setMessage(s.needAdult);
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

    // Fresh creation: the wizard gates each step, but validate defensively —
    // this is the single write to the DB.
    if (!firstName.trim()) return setMessage(s.needFirstName);
    if (!photo) return setMessage(s.needPhoto);
    if (!gender) return setMessage(s.needGender);
    if (interestedIn.length === 0) return setMessage(s.needInterest);
    if (!adultConfirmed) return setMessage(s.needAdult);

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

    clearDraft(userId);
    router.replace(targetRoomPath);
  }

  return (
    <main className="night-shell text-cream">
      <div className="night-content">
        {loading ? (
          <div className="flex min-h-[100dvh] items-center justify-center">
            <p className="wordmark text-2xl text-cream/70">Amourette</p>
          </div>
        ) : editMode ? (
          <ProfileEditor
            s={s}
            genderLabels={genderLabels}
            form={form}
            handlers={handlers}
            saving={saving}
            message={message}
            backHref={backHref}
            onSubmit={handleSubmit}
          />
        ) : existingProfile ? (
          <AgeGateScreen
            title={s.ageTitle}
            subtitle={s.ageSubtitle}
            checked={adultConfirmed}
            onChange={setAdultConfirmed}
            confirmLabel={adultConfirmed ? (saving ? s.saving : s.save) : s.save}
            adultConfirmLabel={s.adultConfirm}
            disabled={saving || !adultConfirmed}
            message={message}
            onSubmit={handleSubmit}
          />
        ) : (
          <OnboardingWizard
            s={s}
            genderLabels={genderLabels}
            form={form}
            handlers={handlers}
            step={step}
            setStep={setStep}
            saving={saving}
            message={message}
            resumed={resumed}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </main>
  );
}

// Age-gate-only screen: a returning user whose profile predates the age gate.
// Minimal by design — the profile already exists, we only need the confirmation.
function AgeGateScreen({
  title,
  subtitle,
  checked,
  onChange,
  confirmLabel,
  adultConfirmLabel,
  disabled,
  message,
  onSubmit,
}: {
  title: string;
  subtitle: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  confirmLabel: string;
  adultConfirmLabel: string;
  disabled: boolean;
  message: string;
  onSubmit: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-5 py-16">
      <div className="night-panel w-full rounded-[2rem] p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <p className="wordmark text-xl text-cream">Amourette</p>
          <LanguageSelector />
        </div>
        <h1 className="font-display mt-3 text-3xl font-medium italic leading-tight text-cream">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-taupe">{subtitle}</p>
        <div className="mt-8">
          <AgeGate checked={checked} onChange={onChange} label={adultConfirmLabel} />
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled}
          className="night-button night-button-primary mt-8 w-full px-5 py-4 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {confirmLabel}
        </button>
        {message && (
          <p className="mt-4 rounded-2xl border border-champagne/15 bg-bordeaux px-4 py-3 text-center text-sm text-taupe">
            {message}
          </p>
        )}
      </div>
    </div>
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
      return result.approved ? { ok: true } : { ok: false, rejected: true };
    }
  } catch (error) {
    console.error(error);
  }

  return { ok: false, rejected: false };
}
