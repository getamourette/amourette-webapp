"use client";

import { PhotoStatus } from "@/components/PhotoStatus";
import { photoStrings } from "@/lib/photo-strings";
import { invalidatePhotos, usePhotoState } from "@/lib/usePhotoState";
import { MAX_PHOTO_SOURCE_BYTES, type PhotoCrop } from "@/lib/photo-upload";
import { submitPhoto, recropPhoto, loadPhotoSource } from "@/lib/photo-client";
import { isGender, isInterestedIn } from "@/lib/profile";
import { bioValidation, isBioLengthError, isVenueSlug, isValidText } from "@/lib/input-validation";

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
import { NameCorrection } from "./NameCorrection";
import { PreferencesEditor } from "./PreferencesEditor";
import { profileEditStrings } from "@/lib/profile-edit-strings";
import { ProfileEditor } from "./ProfileEditor";
import { PhotoCropper, cropPreview, roundPreview } from "./PhotoCropper";
import { PhotoCropLoading } from "./PhotoCropLoading";
import {
  clearDraft,
  clearPhotoDraft,
  loadDraft,
  loadPhotoDraft,
  saveDraft,
  savePhotoDraft,
} from "./draft";

const MAX_PROFILE_PHOTO_BYTES = MAX_PHOTO_SOURCE_BYTES;
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
  const [bioError, setBioError] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [interestedIn, setInterestedIn] = useState<Gender[]>([]);
  const [photoCrop, setPhotoCrop] = useState<PhotoCrop | undefined>();
  const [roundCrop, setRoundCrop] = useState<PhotoCrop>();
  const [recrop, setRecrop] = useState<{ version: string; revision: number; legacy: boolean } | null>(null);
  const [openingCrop, setOpeningCrop] = useState(false);
  const sourceRequest = useRef<AbortController | null>(null);
  const cropTrigger = useRef<HTMLButtonElement | null>(null);
  // One private original for this mounted page, separate from the dirty draft.
  const sourceCache = useRef<{
    owner: string; version: string; revision: number;
    source: Awaited<ReturnType<typeof loadPhotoSource>>;
  } | null>(null);
  const savedPhotoVersion = photoState.state?.pending_id ?? photoState.state?.displayed_id;
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoToCrop, setPhotoToCrop] = useState<{
    file: File;
    url: string;
    crop?: PhotoCrop;
    roundCrop?: PhotoCrop;
    saved?: { version: string; revision: number; legacy: boolean };
  } | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [roundPreviewUrl, setRoundPreviewUrl] = useState("");
  useEffect(() => () => { if (roundPreviewUrl) URL.revokeObjectURL(roundPreviewUrl); }, [roundPreviewUrl]);
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
    bio: string;
  } | null>(null);
  const [targetVenueSlug, setTargetVenueSlug] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [photoError, setPhotoError] = useState("");
  const [saving, setSaving] = useState(false);
  const [bioSaving, setBioSaving] = useState(false);
  const [nameDirty, setNameDirty] = useState(false);
  const [preferencesDirty, setPreferencesDirty] = useState(false);
  const [preferencesBusy, setPreferencesBusy] = useState(false);
  const backHref = targetVenueSlug ? `/v/${targetVenueSlug}` : "/";

  useEffect(() => {
    function clearSource() {
      sourceCache.current = null;
      sourceRequest.current?.abort();
      sourceRequest.current = null;
      setOpeningCrop(false);
      setPhotoToCrop(current => current?.saved ? null : current);
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== userId) clearSource();
    });
    // A new revision can carry moderation or crop changes even for the same ID.
    return () => { subscription.unsubscribe(); clearSource(); };
  }, [userId, savedPhotoVersion, photoState.state?.revision]);

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
            .rpc("get_my_profile")
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
              bio: existing.bio ?? "",
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
        let validPhoto =
          restoredPhoto !== null &&
          ALLOWED_PROFILE_PHOTO_TYPES.has(restoredPhoto.file.type) &&
          restoredPhoto.file.size <= MAX_PROFILE_PHOTO_BYTES;
        if (restoredPhoto && !validPhoto) void clearPhotoDraft(user.id);
        if (validPhoto && restoredPhoto) {
          const sourceUrl = URL.createObjectURL(restoredPhoto.file);
          try {
            const preview = restoredPhoto.crop ? await cropPreview(sourceUrl, restoredPhoto.crop) : null;
            const restoredRound = await roundPreview(sourceUrl, restoredPhoto.roundSourceCrop);
            if (!active) return;
            setRoundPreviewUrl(URL.createObjectURL(restoredRound.blob));
            const restoredPreviewUrl = preview ? URL.createObjectURL(preview) : sourceUrl;
            ownedPreviewUrl.current = restoredPreviewUrl;
            setPhoto(restoredPhoto.file);
            setPhotoCrop(restoredPhoto.crop);
            setRoundCrop(restoredRound.crop);
            setPreviewUrl(restoredPreviewUrl);
          } catch {
            validPhoto = false;
            void clearPhotoDraft(user.id);
          } finally {
            if (restoredPhoto.crop || !active || !validPhoto) URL.revokeObjectURL(sourceUrl);
          }
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
                  : bioValidation(draft.bio)
                    ? 4
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
      sourceRequest.current?.abort();
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

  useEffect(() => {
    return () => {
      if (photoToCrop) URL.revokeObjectURL(photoToCrop.url);
    };
  }, [photoToCrop]);

  useEffect(() => {
    if (!openingCrop && !photoToCrop) {
      cropTrigger.current?.focus();
      cropTrigger.current = null;
    }
  }, [openingCrop, photoToCrop]);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (saving || openingCrop) return;
    if (!file) return;

    if (!ALLOWED_PROFILE_PHOTO_TYPES.has(file.type) || file.size === 0 || file.size > MAX_PROFILE_PHOTO_BYTES) {
      const error = file.size > MAX_PROFILE_PHOTO_BYTES ? s.photoTooLarge : s.photoInvalidType;
      if (editMode) setPhotoError(error); else setMessage(error);
      return;
    }

    if (!editMode) setMessage("");
    setPhotoError("");
    sourceCache.current = null;
    setPhotoToCrop({ file, url: URL.createObjectURL(file) });
  }

  function cancelPhotoCrop() {
    sourceRequest.current?.abort();
    sourceRequest.current = null;
    setOpeningCrop(false);
    setPhotoToCrop(null);
  }

  async function reopenCrop() {
    if (saving || openingCrop) return;
    if (photo) {
      setPhotoToCrop({ file: photo, url: URL.createObjectURL(photo), crop: photoCrop, roundCrop, saved: recrop ?? undefined });
      return;
    }
    const state = photoState.state;
    const version = state?.pending_id ?? state?.displayed_id;
    if (!userId || !state || !version) return;
    setOpeningCrop(true); setPhotoError('');
    const request = new AbortController(); sourceRequest.current = request;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (request.signal.aborted) return;
      if (session?.user.id !== userId) throw new Error('Session expired');
      const cached = sourceCache.current;
      // Correction sources have server-enforced retention; always reauthorize them.
      const source = !state.correction_required && cached?.owner === userId && cached.version === version && cached.revision === state.revision
        ? cached.source : await loadPhotoSource(version, state.revision, request.signal);
      if (request.signal.aborted) return;
      sourceCache.current = state.correction_required ? null : { owner: userId, version, revision: state.revision, source };
      setPhotoToCrop({ file: source.file, url: URL.createObjectURL(source.file), crop: source.crop, roundCrop: source.roundCrop,
        saved: { version, revision: state.revision, legacy: source.legacy } });
    } catch { if (!request.signal.aborted) { sourceCache.current = null; setPhotoError(s.crop.sourceLoadFailed); void photoState.refresh(); } }
    finally { if (sourceRequest.current === request) { sourceRequest.current = null; setOpeningCrop(false); } }
  }

  function confirmPhotoCrop(file: File, crop: PhotoCrop, preview: string, nextRoundCrop: PhotoCrop, nextRoundPreview: string) {
    setRoundPreviewUrl(nextRoundPreview);
    setRoundCrop(nextRoundCrop);
    setRecrop(photoToCrop?.saved ?? null);
    setPhoto(file);
    setPhotoCrop(crop);
    replaceOwnedPreview(preview);
    setPhotoToCrop(null);
    if (!editMode && userId) void savePhotoDraft(userId, file, crop, nextRoundCrop);
    if (!editMode && step === 1) setStep(2);
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
    bioError,
    firstName,
    bio,
    gender,
    interestedIn,
    previewUrl,
    roundPreviewUrl,
    adultConfirmed,
  };

  const handlers: ProfileFormHandlers = {
    setFirstName,
    setBio: (value) => {
      setBio(value);
      setBioError("");
      if (editMode) setMessage("");
    },
    setGender: (value) => setGender(value),
    toggleInterest,
    onPhotoChange: handlePhotoChange,
    onRecrop: event => { cropTrigger.current = event.currentTarget; void reopenCrop(); },
    photoBusy: openingCrop,
    setAdultConfirmed,
  };

  // Each group owns its baseline; saving one must not clear another's draft.
  const isDirty = editMode && editBaseline !== null &&
    (bio !== editBaseline.bio || preferencesDirty || nameDirty || photo !== null);

  async function saveSelectedPhoto() {
    if (!photo) return true;
    setPhotoError("");
    try {
      if (!photoState.state) throw new Error('Photo state unavailable');
      if (recrop && photoCrop) await recropPhoto(recrop.version, recrop.revision, photoCrop, roundCrop);
      else await submitPhoto(photo, photoState.state.revision, undefined, photoCrop, roundCrop);
      sourceCache.current = null;
      await photoState.refresh();
      setPhoto(null);
      setPhotoCrop(undefined);
      setRoundCrop(undefined);
      setRoundPreviewUrl("");
      setRecrop(null);
      replaceOwnedPreview("");
      invalidatePhotos();
      return true;
    } catch (error) {
      void photoState.refresh();
      setPhotoError(error instanceof Error && error.message === "stale" ? s.crop.stale : error instanceof Error && error.message === "crop_too_large" ? s.photoCropTooLarge : error instanceof Error && error.message === "rejected" ? s.photoRejected : error instanceof Error && error.message === "review" ? s.photoReviewFailed : s.photoUploadFailed);
      return false;
    }
  }

  async function handlePhotoSubmit() {
    if (!photo || saving) return;
    setSaving(true);
    await saveSelectedPhoto();
    setSaving(false);
  }

  function rejectBio() {
    setBioError(bioValidation(bio) === "invalid" ? s.bioInvalid : s.bioTooLong);
    if (!editMode) setStep(4);
    document.getElementById("profile-bio")?.focus();
  }

  async function handleSubmit() {
    if (!userId || saving) return;

    if (editMode) {
      if (!isValidText(bio, PROFILE_BIO_MAX_LENGTH, false)) return rejectBio();
      const submittedBio = bio.trim();
      setSaving(true);
      setBioSaving(true);
      setMessage("");
      try {
        const { error } = await supabase.from("profiles")
          .update({ bio: submittedBio || null }).eq("id", userId);
        if (error) throw error;
        setEditBaseline(previous => previous && ({ ...previous, bio: submittedBio }));
        // Preserve text typed while the request was in flight.
        setBio(current => current === bio ? submittedBio : current);
        setMessage(profileEditStrings[locale].bioSaved);
      } catch (error) {
        if (isBioLengthError(error)) rejectBio();
        else setMessage(s.genericError);
      } finally {
        setSaving(false);
        setBioSaving(false);
      }
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
      return rejectBio();
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
      }, photoCrop, roundCrop);
    } catch (error) {
      setSaving(false);
      if (isBioLengthError(error)) return rejectBio();
      return setMessage(error instanceof Error && error.message === "crop_too_large" ? s.photoCropTooLarge : error instanceof Error && error.message === "rejected" ? s.photoRejected : error instanceof Error && error.message === "review" ? s.photoReviewFailed : s.photoUploadFailed);
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
            bioSaving={bioSaving}
            editStrings={profileEditStrings[locale]}
            preferences={<PreferencesEditor locale={locale} disabled={saving} onDirtyChange={setPreferencesDirty} onBusyChange={setPreferencesBusy} />}
            nameCorrection={<NameCorrection currentName={firstName} locale={locale} onNameChange={setFirstName} onDirtyChange={setNameDirty} />}
            currentPhoto={photoState.versions.find(version => version.id === (photoState.state?.pending_id ?? photoState.state?.displayed_id))?.path}
            currentRoundCrop={photoState.versions.find(version => version.id === (photoState.state?.pending_id ?? photoState.state?.displayed_id))?.round_crop ?? undefined}
            currentRoundPath={photoState.versions.find(version => version.id === (photoState.state?.pending_id ?? photoState.state?.displayed_id))?.round_path ?? undefined}
            pendingPhoto={Boolean(photoState.state?.pending_id)}
            photoSubmission={<div aria-live="polite">
              {photo && <button type="button" onClick={() => void handlePhotoSubmit()} disabled={saving || preferencesBusy} className="night-button night-button-primary mt-4 w-full px-4 py-3 disabled:opacity-50">
                {saving && !bioSaving ? photoStrings[locale].sending : photoStrings[locale].send}
              </button>}
              {photoError && <p role="alert" className="mt-3 text-center text-sm text-taupe">{photoError}</p>}
            </div>}
            photoStatus={<PhotoStatus state={photoState.state} versions={photoState.versions} locale={locale} editor />}
            s={s}
            form={form}
            handlers={handlers}
            saving={saving || preferencesBusy}
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
      {openingCrop && <PhotoCropLoading strings={s.crop} onCancel={cancelPhotoCrop} />}
      {photoToCrop && (
        <PhotoCropper
          key={photoToCrop.url}
          file={photoToCrop.file}
          imageUrl={photoToCrop.url}
          strings={s.crop}
          firstName={firstName}
          bio={bio}
          initialCrop={photoToCrop.crop}
          initialRoundCrop={photoToCrop.roundCrop}
          legacy={photoToCrop.saved?.legacy}
          pending={Boolean(photoToCrop.saved && photoToCrop.saved.version === photoState.state?.pending_id)}
          onCancel={cancelPhotoCrop}
          onConfirm={confirmPhotoCrop}
          onChooseAnother={(file) => { sourceCache.current = null; setPhotoToCrop({ file, url: URL.createObjectURL(file) }); }}
          invalidType={s.photoInvalidType}
          tooLarge={s.photoTooLarge}
        />
      )}
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
