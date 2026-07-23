"use client";

// Profile editing (#72): a single screen, NOT the guided wizard. A returning
// user changing their bio should not walk five steps, so edit composes the same
// shared field widgets (fields.tsx) in a compact panel. The age gate is absent
// on purpose — it was already cleared at creation and profile_private is left
// untouched here.

import Link from "next/link";
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
  onSubmit,
}: {
  s: ProfileStrings;
  genderLabels: GenderLabels;
  form: ProfileFormState;
  handlers: ProfileFormHandlers;
  saving: boolean;
  message: string;
  backHref: string;
  onSubmit: () => void;
}) {
  const options = genderOptions(genderLabels);

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-5 py-16">
      <div className="night-panel w-full rounded-[2rem] p-6 sm:p-8">
        <div className="flex items-center justify-between">
          <p className="wordmark text-xl text-cream">Amourette</p>
          <LanguageSelector />
        </div>
        <h1 className="font-display mt-3 text-3xl font-medium italic leading-tight text-cream">
          {s.editTitle}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-taupe">
          {s.editSubtitle}
        </p>

        <div className="mt-8 flex justify-center">
          <PhotoPicker
            previewUrl={form.previewUrl}
            onChange={handlers.onPhotoChange}
            label={s.addPhoto}
            size="sm"
          />
        </div>

        <input
          className="night-input mt-8 px-5 py-4"
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

        <div className="mt-6">
          <p className="font-label text-xs uppercase tracking-widest text-taupe">
            {s.iWantToMeet}
          </p>
          <div className="mt-2">
            <Segmented
              layout="inline"
              options={options}
              isOn={(gender) => form.interestedIn.includes(gender)}
              onToggle={handlers.toggleInterest}
              ariaLabel={s.iWantToMeet}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={saving}
          className="night-button night-button-primary mt-8 w-full px-5 py-4 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? s.saving : s.saveChanges}
        </button>

        <Link
          href={backHref}
          className="night-button night-button-secondary mt-3 flex w-full justify-center px-5 py-4"
        >
          {s.back}
        </Link>

        {message && (
          <p className="mt-4 rounded-2xl border border-champagne/15 bg-bordeaux px-4 py-3 text-center text-sm text-taupe">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
