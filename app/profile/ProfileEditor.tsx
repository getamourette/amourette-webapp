"use client";

import { BrandLogo } from "@/app/BrandLogo";

// Profile editing (#72, redesigned #102): a single screen, NOT the guided wizard.
// A returning user changing their bio should not walk five steps, so edit composes
// the same shared field widgets (fields.tsx) grouped into two blocks — "You"
// (identity) and "I want to meet" (preference). The age gate is absent on purpose —
// it was already cleared at creation and profile_private is left untouched here.

import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { AlertDialog } from "radix-ui";
import { useRouter } from "next/navigation";
import type { GenderLabels, ProfileStrings } from "@/lib/strings";
import { LanguageSelector } from "@/app/LanguageSelector";
import { FIRST_NAME_MAX_LENGTH, PROFILE_BIO_MAX_LENGTH } from "@/lib/profile";
import {
  genderOptions,
  PhotoPicker,
  Segmented,
  type ProfileFormHandlers,
  type ProfileFormState,
} from "./fields";

export function ProfileEditor({
  s,
  genderLabels,
  form,
  handlers,
  saving,
  message,
  backHref,
  changePhotoLabel,
  isDirty,
  onSubmit,
  photoStatus,
  currentPhoto,
  photoSubmission,
}: {
  s: ProfileStrings;
  genderLabels: GenderLabels;
  form: ProfileFormState;
  handlers: ProfileFormHandlers;
  saving: boolean;
  message: string;
  backHref: string;
  changePhotoLabel: string;
  isDirty: boolean;
  onSubmit: () => void;
  photoStatus?: ReactNode;
  currentPhoto?: string | null;
  photoSubmission?: ReactNode;
}) {
  const router = useRouter();
  const options = genderOptions(genderLabels);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const backButton = useRef<HTMLButtonElement | null>(null);

  // Warn on a browser reload/close while there are unsaved edits. The in-app back
  // button is guarded separately by the confirm overlay below.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const leave = () => router.push(backHref);
  const handleBack = (event: MouseEvent<HTMLButtonElement>) => {
    if (saving) return;
    backButton.current = event.currentTarget;
    if (isDirty) setConfirmDiscard(true);
    else leave();
  };

  return (
    <div className="mx-auto w-full max-w-md px-5 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <button
        type="button"
        onClick={handleBack}
        disabled={saving}
        className="night-button night-button-secondary mb-6 inline-flex min-h-11 items-center gap-2 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span aria-hidden="true">←</span>
        {s.back}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BrandLogo align="start" />
        <LanguageSelector />
      </div>
      <h1 className="font-display mt-4 text-3xl font-medium italic leading-tight text-cream">
        {s.editTitle}
      </h1>
      <p className="mt-3 text-pretty text-sm leading-relaxed text-taupe">{s.editSubtitle}</p>

      {photoStatus}

      {/* Group 1 — "You": identity (photo, name, bio, gender). */}
      <section className="night-panel mt-8 rounded-[2rem] p-6 sm:p-7">
        <p className="night-kicker">{s.youSection}</p>

        <div className="mt-5 flex justify-center">
          <PhotoPicker
            currentPhoto={currentPhoto}
            previewUrl={form.previewUrl}
            onChange={handlers.onPhotoChange}
            label={changePhotoLabel}
            size="sm"
            editable
            disabled={saving}
            changeLabel={changePhotoLabel}
          />
        </div>

        {photoSubmission}

        <input
          className="night-input mt-6 px-5 py-4"
          placeholder={s.firstName}
          value={form.firstName}
          maxLength={FIRST_NAME_MAX_LENGTH}
          onChange={(event) => handlers.setFirstName(event.target.value)}
        />

        <textarea
          className="night-input mt-4 h-24 resize-none px-5 py-4"
          placeholder={s.bioOptional}
          value={form.bio}
          maxLength={PROFILE_BIO_MAX_LENGTH}
          onChange={(event) => handlers.setBio(event.target.value)}
        />

        <div className="mt-6">
          <p className="font-label text-xs uppercase tracking-widest text-taupe">
            {s.iAm}
          </p>
          <div className="mt-2">
            <Segmented
              layout="inline"
              options={options}
              isOn={(gender) => form.gender === gender}
              onToggle={handlers.setGender}
              ariaLabel={s.iAm}
            />
          </div>
        </div>
      </section>

      {/* Group 2 — "I want to meet": matching preference. */}
      <section className="night-panel mt-4 rounded-[2rem] p-6 sm:p-7">
        <p className="night-kicker">{s.iWantToMeet}</p>
        <div className="mt-4">
          <Segmented
            layout="inline"
            options={options}
            isOn={(gender) => form.interestedIn.includes(gender)}
            onToggle={handlers.toggleInterest}
            ariaLabel={s.iWantToMeet}
          />
        </div>
      </section>

      {message && (
        <p className="mt-4 rounded-2xl border border-champagne/15 bg-bordeaux px-4 py-3 text-center text-sm text-taupe">
          {message}
        </p>
      )}

      <div className="mt-8 space-y-3">
        <button
          type="button"
          onClick={onSubmit}
          disabled={saving}
          className="night-button night-button-primary w-full px-5 py-4 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? s.saving : s.saveChanges}
        </button>
        <button
          type="button"
          onClick={handleBack}
          disabled={saving}
          className="night-button night-button-secondary w-full px-5 py-4 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {s.back}
        </button>
      </div>

      <AlertDialog.Root open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-velvet/85" />
          <AlertDialog.Content
            className="night-panel fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-3rem)] w-[calc(100%-3rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[2rem] p-6"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              backButton.current?.focus();
            }}
          >
            <AlertDialog.Title className="font-display text-2xl font-medium italic leading-tight text-cream">
              {s.discardTitle}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-3 text-sm leading-relaxed text-taupe">
              {s.discardBody}
            </AlertDialog.Description>
            <div className="mt-6 flex flex-col gap-3">
              <AlertDialog.Action
                type="button"
                onClick={leave}
                className="night-button night-button-primary w-full px-5 py-4"
              >
                {s.discardConfirm}
              </AlertDialog.Action>
              <AlertDialog.Cancel
                type="button"
                className="night-button night-button-secondary w-full px-5 py-4"
              >
                {s.discardKeep}
              </AlertDialog.Cancel>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
