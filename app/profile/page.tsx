"use client";

import { PhotoStatus } from "@/components/PhotoStatus";
import { photoStrings } from "@/lib/photo-strings";
import { invalidatePhotos, usePhotoState } from "@/lib/usePhotoState";
import { submitPhoto } from "@/lib/photo-client";
import { isGender, isInterestedIn } from "@/lib/profile";
import { isVenueSlug, isValidText } from "@/lib/input-validation";

import { BrandLogo } from "@/app/BrandLogo";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ensureAnonSession } from "@/lib/auth";
import {
  FIRST_NAME_MAX_LENGTH,
  PROFILE_BIO_MAX_LENGTH,
  type Gender,
} from "@/lib/profile";
import { browserLocale, t } from "@/lib/strings";
import { preferredLocale, useBrowserLocale } from "@/lib/useLocale";
import { LanguageSelector } from "@/app/LanguageSelector";
import { AgeGate, type ProfileFormHandlers, type ProfileFormState } from "./fields";
import { OnboardingWizard } from "./OnboardingWizard";
import { ProfileEditor } from "./ProfileEditor";
import {
  clearDraft,
  clearPhotoDraft,
  loadDraft,
  loadPhotoDraft,
  saveDraft,
  savePhotoDraft,
} from "./draft";

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
  const photoState = usePhotoState(userId);
  const [firstName, setFirstName] = useState("");
  const [bio, setBio] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [interestedIn, setInterestedIn] = useState<Gender[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const ownedPreviewUrl = useRef("");
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
  // Baseline captured when edit mode loads, so the editor can warn on leaving
  // with unsaved changes (#102). Null until an existing profile is loaded.
  const [editBaseline, setEditBaseline] = useState<{
    firstName: string;
    bio: string;
    gender: Gender | "";
    interestedIn: Gender[];
  } | null>(null);
  const [targetVenueSlug, setTargetVenueSlug] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [saving, setSaving] = useState(false);
  const backHref = targetVenueSlug ? `/v/${targetVenueSlug}` : "/";

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

        let nextPath = "/";
        if (requestedVenueSlug && isVenueSlug(requestedVenueSlug)) {
          const { data: venueRow, error: venueError } = await supabase
            .from("venues")
            .select("slug")
            .eq("slug", requestedVenueSlug)
            .maybeSingle();
          if (venueError) throw venueError;
          if (!active) return;
          if (venueRow) {
            nextPath = `/v/${venueRow.slug}`;
            setTargetVenueSlug(venueRow.slug);
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
            setGender(isGender(existing.gender) ? existing.gender : "");
            setInterestedIn(isInterestedIn(existing.interested_in) ? existing.interested_in : []);
            setPreviewUrl("");
            setAdultConfirmed(true);
            setEditBaseline({
              firstName: existing.first_name,
              bio: existing.bio ?? "",
              gender: existing.gender as Gender,
              interestedIn: existing.interested_in as Gender[],
            });
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
            router.replace(nextPath);
            return;
          }
          // Profile exists but age never confirmed: age-gate-only screen.
          setExistingProfile(true);
          setLoading(false);
          return;
        }

        // Fresh onboarding: restore scalar answers and the short-lived local
        // photo, then resume only as far as the restored fields permit.
        const draft = loadDraft(user.id);
        const restoredPhoto = await loadPhotoDraft(user.id);
        if (!active) return;
        const validPhoto =
          restoredPhoto !== null &&
          ALLOWED_PROFILE_PHOTO_TYPES.has(restoredPhoto.type) &&
          restoredPhoto.size <= MAX_PROFILE_PHOTO_BYTES;
        if (restoredPhoto && !validPhoto) void clearPhotoDraft(user.id);
        if (validPhoto) {
          const restoredPreviewUrl = URL.createObjectURL(restoredPhoto);
          ownedPreviewUrl.current = restoredPreviewUrl;
          setPhoto(restoredPhoto);
          setPreviewUrl(restoredPreviewUrl);
        }
        if (draft) {
          setFirstName(draft.firstName);
          setBio(draft.bio);
          setGender(draft.gender);
          setInterestedIn(draft.interestedIn);
          setAdultConfirmed(draft.adultConfirmed);
          const furthestReachable = !draft.firstName.trim()
            ? 0
            : !validPhoto
              ? 1
              : !draft.gender
                ? 2
                : draft.interestedIn.length === 0
                  ? 3
                  : 5;
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
      if (ownedPreviewUrl.current) {
        URL.revokeObjectURL(ownedPreviewUrl.current);
        ownedPreviewUrl.current = "";
      }
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
    e.target.value = "";
    if (saving) return;
    if (!file) return;

    if (!ALLOWED_PROFILE_PHOTO_TYPES.has(file.type)) {
      setPhoto(null);
      replaceOwnedPreview("");
      if (!editMode && userId) void clearPhotoDraft(userId);
      if (editMode) setPhotoError(s.photoInvalidType);
      else setMessage(s.photoInvalidType);
      return;
    }

    if (file.size === 0) {
      setMessage(s.photoInvalidType);
      setPhoto(null);
      replaceOwnedPreview("");
      if (!editMode && userId) void clearPhotoDraft(userId);
      return;
    }

    if (file.size > MAX_PROFILE_PHOTO_BYTES) {
      setPhoto(null);
      replaceOwnedPreview("");
      if (!editMode && userId) void clearPhotoDraft(userId);
      if (editMode) setPhotoError(s.photoTooLarge);
      else setMessage(s.photoTooLarge);
      return;
    }

    setMessage("");
    setPhotoError("");
    setPhoto(file);
    replaceOwnedPreview(URL.createObjectURL(file));
    if (!editMode && userId) void savePhotoDraft(userId, file);
  }

  function replaceOwnedPreview(nextUrl: string) {
    if (ownedPreviewUrl.current) URL.revokeObjectURL(ownedPreviewUrl.current);
    ownedPreviewUrl.current = nextUrl.startsWith("blob:") ? nextUrl : "";
    setPreviewUrl(nextUrl);
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

  // Dirty when any editable field diverges from the loaded baseline, or a new
  // photo file was picked (interest order is irrelevant, so compare as a set).
  const sameInterests =
    editBaseline !== null &&
    interestedIn.length === editBaseline.interestedIn.length &&
    interestedIn.every((g) => editBaseline.interestedIn.includes(g));
  const isDirty =
    editMode &&
    editBaseline !== null &&
    (firstName !== editBaseline.firstName ||
      bio !== editBaseline.bio ||
      gender !== editBaseline.gender ||
      !sameInterests ||
      photo !== null);

  async function saveSelectedPhoto() {
    if (!photo) return true;
    setPhotoError("");
    try {
      if (!photoState.state) throw new Error('Photo state unavailable');
      await submitPhoto(photo, photoState.state.revision);
      await photoState.refresh();
      setPhoto(null);
      replaceOwnedPreview("");
      invalidatePhotos();
      return true;
    } catch (error) {
      void photoState.refresh();
      setPhotoError(error instanceof Error && error.message === "rejected" ? s.photoRejected : error instanceof Error && error.message === "review" ? s.photoReviewFailed : s.photoUploadFailed);
      return false;
    }
  }

  async function handlePhotoSubmit() {
    if (!photo || saving) return;
    setSaving(true);
    await saveSelectedPhoto();
    setSaving(false);
  }

  async function handleSubmit() {
    if (!userId || saving) return;

    // Edit mode: UPDATE the existing profile. The photo is optional (keep the
    // current one if unchanged); the age gate was already cleared, so it is not
    // re-asked and profile_private is left untouched.
    if (editMode) {
      if (!firstName.trim()) return setMessage(s.needFirstName);
      if (!isValidText(firstName, FIRST_NAME_MAX_LENGTH)) {
        return setMessage(s.firstNameTooLong);
      }
      if (!isValidText(bio, PROFILE_BIO_MAX_LENGTH, false)) {
        return setMessage(s.bioTooLong);
      }
      if (!isGender(gender)) return setMessage(s.needGender);
      if (!isInterestedIn(interestedIn)) return setMessage(s.needInterest);

      setSaving(true);
      setMessage("");

      if (!await saveSelectedPhoto()) {
        setSaving(false);
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: firstName.trim(),
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
      router.replace(backHref);
      return;
    }

    // Fresh creation: the wizard gates each step, but validate defensively —
    // this is the single write to the DB.
    if (!firstName.trim()) return setMessage(s.needFirstName);
    if (!isValidText(firstName, FIRST_NAME_MAX_LENGTH)) {
      return setMessage(s.firstNameTooLong);
    }
    if (!isValidText(bio, PROFILE_BIO_MAX_LENGTH, false)) {
      return setMessage(s.bioTooLong);
    }
    if (!photo) return setMessage(s.needPhoto);
    if (!isGender(gender)) return setMessage(s.needGender);
    if (!isInterestedIn(interestedIn)) return setMessage(s.needInterest);
    if (!adultConfirmed) return setMessage(s.needAdult);

    setSaving(true);
    setMessage("");

    try {
      await submitPhoto(photo, 0, {
        first_name: firstName.trim(), bio: bio.trim() || null,
        gender, interested_in: interestedIn, adult_confirmed: adultConfirmed,
      });
    } catch (error) {
      setSaving(false);
      return setMessage(error instanceof Error && error.message === "rejected" ? s.photoRejected : error instanceof Error && error.message === "review" ? s.photoReviewFailed : s.photoUploadFailed);
    }

    clearDraft(userId);
    await clearPhotoDraft(userId);
    router.replace(backHref);
  }

  return (
    <main
      className="night-shell text-cream"
      // Match the wizard's viewport reference so the shared 100vh minimum
      // cannot leave extra document scroll space after keyboard dismissal.
      style={
        !loading && !editMode && !existingProfile
          ? { minHeight: "100dvh" }
          : undefined
      }
    >
      <div className="night-content">
        {loading ? (
          <div className="flex min-h-[100dvh] items-center justify-center">
            <BrandLogo className="opacity-70" />
          </div>
        ) : editMode ? (
          <ProfileEditor
            currentPhoto={!photoState.state?.correction_required ? photoState.versions.find(version => version.id === photoState.state?.displayed_id)?.path : null}
            photoSubmission={<div aria-live="polite">
              {photo && <button type="button" onClick={() => void handlePhotoSubmit()} disabled={saving} className="night-button night-button-primary mt-4 w-full px-4 py-3 disabled:opacity-50">
                {saving ? photoStrings[locale].sending : photoStrings[locale].send}
              </button>}
              {photoError && <p role="alert" className="mt-3 text-center text-sm text-taupe">{photoError}</p>}
            </div>}
            photoStatus={<PhotoStatus state={photoState.state} versions={photoState.versions} locale={locale} editor />}
            s={s}
            genderLabels={genderLabels}
            form={form}
            handlers={handlers}
            saving={saving}
            message={message}
            backHref={backHref}
            changePhotoLabel={s.onb.changePhoto}
            isDirty={isDirty}
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <BrandLogo align="start" />
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
