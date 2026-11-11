"use client";

// Shared profile field widgets (#72). Both the guided onboarding wizard (one
// question per screen) and the single-screen editor compose these, so creation
// and editing can never drift in behaviour, validation, or design-system look.
// Presentation that genuinely differs by context is a `layout`/`size` prop, not
// a forked component.

import { useEffect, useRef, type ChangeEvent } from "react";
import { ConfirmationCheckbox } from "@/components/ConfirmationCheckbox";
import { PHOTO_ACCEPT } from '@/lib/heic';
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
  isDisabled = () => false,
}: {
  options: { value: Gender; label: string }[];
  isOn: (value: Gender) => boolean;
  onToggle: (value: Gender) => void;
  layout: "row" | "inline";
  ariaLabel: string;
  isDisabled?: (value: Gender) => boolean;
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
              disabled={isDisabled(option.value)}
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
            disabled={isDisabled(option.value)}
            onClick={() => onToggle(option.value)}
            className={`night-button min-h-11 min-w-0 flex-1 px-1 py-3 text-sm tracking-[0.06em] disabled:cursor-not-allowed disabled:opacity-50 ${
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

export const photoCaption = 'night-kicker mt-3 text-center text-[0.65rem] leading-relaxed tracking-[0.14em]';

export function PhotoPortrait({ src, caption, refused = false }: { src: string; caption: string; refused?: boolean }) {
  return <figure className="flex w-28 flex-col items-center">
    <div className="aspect-[9/19.5] h-44 overflow-hidden rounded-xl border border-champagne/40 bg-bordeaux">
      <ProfilePhoto src={src} alt="" className={`h-full w-full object-cover ${refused ? 'opacity-40' : ''}`} />
    </div>
    <figcaption className={`${photoCaption} ${refused ? 'text-blush' : 'text-cream'}`}>{caption}</figcaption>
  </figure>;
}

// The portrait itself is the sole add/edit target in both profile flows.
export function PhotoPicker({ previewUrl, currentPhoto, onChange, label, disabled = false, inputId,
  onRecrop, editLabel, size = 'lg' }: {
  previewUrl: string; currentPhoto?: string | null; onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  label: string; disabled?: boolean; size?: 'lg' | 'sm'; inputId?: string;
  onRecrop: React.MouseEventHandler<HTMLButtonElement>; editLabel: string;
}) {
  const selected = Boolean(previewUrl || currentPhoto);
  const frame = `relative flex aspect-[9/19.5] ${size === 'lg' ? 'h-52' : 'h-44'} items-center justify-center overflow-hidden rounded-xl border border-champagne/40 bg-bordeaux text-center`;
  return <div data-testid="photo-picker" className="mx-auto w-fit">
    {selected ? <button id={inputId} type="button" aria-label={editLabel} disabled={disabled} onClick={onRecrop}
      className={`${frame} disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-champagne`}>
      {previewUrl ? <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt="" className="h-full w-full object-cover" />
      </> : <ProfilePhoto src={currentPhoto} alt="" className="h-full w-full object-cover" />}
      <span className="absolute inset-x-2 bottom-3 flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-velvet/90 px-2 text-xs text-cream">
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m16 3 5 5L8 21H3v-5L16 3ZM13 6l5 5" /></svg>
        {editLabel}
      </span>
    </button> : <label className={`${frame} cursor-pointer flex-col gap-3 border-dashed px-2 has-disabled:opacity-50 focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-champagne`}>
      <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-full bg-red text-cream">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
      </span>
      <span className="text-sm text-cream">{label}</span>
      <input id={inputId} type="file" disabled={disabled} accept={PHOTO_ACCEPT} className="sr-only" onChange={onChange} />
    </label>}
  </div>;
}

// Age confirmation — a safety affordance, so it is blush/cream on bordeaux and
// never red (red is love, not alarm; docs/design.md). Calm, not alarmist.
export function AgeGate({
  checked,
  onChange,
  label,
  compact = false,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  return <ConfirmationCheckbox checked={checked} onChange={onChange} label={label} compact={compact} disabled={disabled} />;
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
