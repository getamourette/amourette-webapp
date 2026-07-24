"use client";

// Profile editing (#72, redesigned #102): a single screen, NOT the guided wizard.
// A returning user changing their bio should not walk five steps, so edit composes
// the same shared field widgets (fields.tsx) grouped into two blocks — "You"
// (identity) and "I want to meet" (preference). The age gate is absent on purpose —
// it was already cleared at creation and profile_private is left untouched here.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { GenderLabels, ProfileStrings } from "@/lib/strings";
import { LanguageSelector } from "@/app/LanguageSelector";
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
}) {
  const router = useRouter();
  const options = genderOptions(genderLabels);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

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
  const handleBack = () => {
    if (isDirty) setConfirmDiscard(true);
    else leave();
  };

  return (
    <div className="mx-auto w-full max-w-md px-5 py-10">
      <div className="flex items-center justify-between">
        <p className="wordmark text-xl text-cream">Amourette</p>
        <LanguageSelector />
      </div>
      <h1 className="font-display mt-4 text-3xl font-medium italic leading-tight text-cream">
        {s.editTitle}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-taupe">{s.editSubtitle}</p>

      {/* Group 1 — "You": identity (photo, name, bio, gender). */}
      <section className="night-panel mt-8 rounded-[2rem] p-6 sm:p-7">
        <p className="night-kicker">{s.youSection}</p>

        <div className="mt-5 flex justify-center">
          <PhotoPicker
            previewUrl={form.previewUrl}
            onChange={handlers.onPhotoChange}
            label={s.addPhoto}
            size="sm"
            editable
            changeLabel={changePhotoLabel}
          />
        </div>

        <input
          className="night-input mt-6 px-5 py-4"
          placeholder={s.firstName}
          value={form.firstName}
          onChange={(event) => handlers.setFirstName(event.target.value)}
        />

        <textarea
          className="night-input mt-4 h-24 resize-none px-5 py-4"
          placeholder={s.bioOptional}
          value={form.bio}
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
          className="night-button night-button-secondary w-full px-5 py-4"
        >
          {s.back}
        </button>
      </div>

      {confirmDiscard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-velvet/85 px-6">
          <div className="night-panel w-full max-w-sm rounded-[2rem] p-6">
            <h2 className="font-display text-2xl font-medium italic leading-tight text-cream">
              {s.discardTitle}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-taupe">
              {s.discardBody}
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={leave}
                className="night-button night-button-primary w-full px-5 py-4"
              >
                {s.discardConfirm}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDiscard(false)}
                className="night-button night-button-secondary w-full px-5 py-4"
              >
                {s.discardKeep}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
