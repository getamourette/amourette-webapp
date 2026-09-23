"use client";

// Shared profile field widgets (#72). Both the guided onboarding wizard (one
// question per screen) and the single-screen editor compose these, so creation
// and editing can never drift in behaviour, validation, or design-system look.
// Presentation that genuinely differs by context is a `layout`/`size` prop, not
// a forked component.

import { useEffect, useRef, type ChangeEvent } from "react";
import { RoundPhoto } from "@/components/RoundPhoto";
import type { PhotoCrop } from "@/lib/photo-upload";
import { ProfilePhoto } from "@/components/ProfilePhoto";
import { GENDERS, type Gender } from "@/lib/profile";
import { bioValidation } from "@/lib/input-validation";
import { PROFILE_BIO_MAX_LENGTH } from "@/lib/profile";
import type { GenderLabels, ProfileStrings } from "@/lib/strings";

export type ProfileFormState = {
  firstName: string;
  bio: string;
  bioError?: string;
  gender: Gender | "";
  interestedIn: Gender[];
  previewUrl: string;
  roundPreviewUrl: string;
  adultConfirmed: boolean;
};

export type ProfileFormHandlers = {
  setFirstName: (value: string) => void;
  setBio: (value: string) => void;
  setGender: (value: Gender) => void;
  toggleInterest: (value: Gender) => void;
  onPhotoChange: (event: ChangeEvent<HTMLInputElement>) => void;
  setAdultConfirmed: (value: boolean) => void;
  onRecrop: React.MouseEventHandler<HTMLButtonElement>;
  photoBusy: boolean;
};

export function genderOptions(
  labels: GenderLabels
): { value: Gender; label: string }[] {
  return GENDERS.map((value) => ({ value, label: labels[value] }));
}

// A single- or multi-select over a fixed option set. `isOn`/`onToggle` carry the
// semantics (single = replace, multi = toggle), so the same widget drives both
// "I am" (single) and "I want to meet" (multi). `layout` is the only per-context
// difference: stacked Fraunces rows in the wizard, compact pills in the editor.
export function Segmented({
  options,
  isOn,
  onToggle,
  layout,
  ariaLabel,
}: {
  options: { value: Gender; label: string }[];
  isOn: (value: Gender) => boolean;
  onToggle: (value: Gender) => void;
  layout: "row" | "inline";
  ariaLabel: string;
}) {
  if (layout === "row") {
    return (
      <div role="group" aria-label={ariaLabel} className="flex flex-col gap-3">
        {options.map((option) => {
          const on = isOn(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(option.value)}
              className={`onb-choice ${on ? "on" : ""}`}
            >
              <span className="dot" aria-hidden />
              {option.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div role="group" aria-label={ariaLabel} className="flex gap-2">
      {options.map((option) => {
        const on = isOn(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(option.value)}
            className={`night-button min-w-0 flex-1 px-3 py-3 text-sm ${
              on
                ? "border border-wine bg-wine text-cream"
                : "night-button-secondary"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// Shared portrait selection and independent secondary round preview.
export function PhotoPicker({ previewUrl, currentPhoto, onChange, label, changeLabel, disabled = false,
  onRecrop, recropLabel, roundCrop, roundPreviewUrl, currentRoundPath, roundLabel, size = 'lg' }: {
  previewUrl: string; currentPhoto?: string | null; onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  label: string; changeLabel?: string; disabled?: boolean; editable?: boolean; size?: 'lg' | 'sm';
  onRecrop: React.MouseEventHandler<HTMLButtonElement>; recropLabel: string; roundCrop?: PhotoCrop;
  roundPreviewUrl?: string; currentRoundPath?: string; roundLabel: string;
}) {
  const selected = Boolean(previewUrl || currentPhoto);
  return <div className="mx-auto flex w-fit flex-col items-center gap-3">
    <label className="flex cursor-pointer flex-col items-center gap-3">
      <div className={`relative flex aspect-[9/19.5] ${size === 'lg' ? 'h-52' : 'h-44'} items-center justify-center overflow-hidden rounded-xl border border-champagne/40 bg-bordeaux text-center`}>
        {previewUrl ? <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="" className="h-full w-full object-cover" />
        </> : currentPhoto ? <ProfilePhoto src={currentPhoto} alt="" className="h-full w-full object-cover" /> : <span className="px-3 text-sm text-taupe">{label}</span>}
      </div>
      <span className="night-button night-button-secondary flex min-h-11 items-center px-4 text-xs">{selected ? changeLabel ?? label : label}</span>
      <input type="file" disabled={disabled} accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onChange} />
    </label>
    {selected && <div className="flex items-center gap-3">
      {previewUrl ? <RoundPhoto src={roundPreviewUrl || previewUrl} className="h-14 w-14" /> : <ProfilePhoto src={currentPhoto} circular roundPath={currentRoundPath} roundCrop={roundCrop} alt="" className="h-14 w-14 rounded-full object-cover" />}
      <span className="max-w-44 text-xs text-taupe">{roundLabel}</span>
    </div>}
    {selected && <div>
      <button type="button" disabled={disabled} onClick={onRecrop} className="night-button night-button-secondary min-h-11 px-4 text-xs disabled:opacity-50">{recropLabel}</button>
    </div>}
  </div>;
}

// Age confirmation — a safety affordance, so it is blush/cream on bordeaux and
// never red (red is love, not alarm; docs/design.md). Calm, not alarmist.
export function AgeGate({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-2xl border border-blush/20 bg-bordeaux p-4 text-sm leading-relaxed text-taupe">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 accent-blush"
      />
      <span>{label}</span>
    </label>
  );
}

export function BioField({ form, handlers, s, className }: {
  form: ProfileFormState;
  handlers: ProfileFormHandlers;
  s: ProfileStrings;
  className: string;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const count = Array.from(form.bio.trim()).length;
  const invalid = bioValidation(form.bio);
  const error = invalid === "invalid"
    ? s.bioInvalid
    : invalid === "too_long"
      ? s.bioRemove(count - PROFILE_BIO_MAX_LENGTH)
      : form.bioError;
  useEffect(() => {
    if (form.bioError) field.current?.focus();
  }, [form.bioError]);

  return (
    <>
      <textarea
        ref={field}
        id="profile-bio"
        className={className}
        aria-label={s.bioOptional}
        placeholder={s.bioOptional}
        value={form.bio}
        aria-invalid={Boolean(error)}
        aria-describedby={`profile-bio-counter${error ? " profile-bio-error" : ""}`}
        onChange={(event) => handlers.setBio(event.target.value)}
      />
      <p id="profile-bio-counter" className={`mt-2 text-xs ${count >= 270 ? "text-champagne" : "text-taupe"}`}>
        {s.bioCounter(count)}
      </p>
      {error && <p id="profile-bio-error" className="mt-2 text-sm text-blush">{error}</p>}
    </>
  );
}
