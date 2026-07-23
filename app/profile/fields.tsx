"use client";

// Shared profile field widgets (#72). Both the guided onboarding wizard (one
// question per screen) and the single-screen editor compose these, so creation
// and editing can never drift in behaviour, validation, or design-system look.
// Presentation that genuinely differs by context is a `layout`/`size` prop, not
// a forked component.

import type { ChangeEvent } from "react";
import { GENDERS, type Gender } from "@/lib/profile";
import type { GenderLabels } from "@/lib/strings";

export type ProfileFormState = {
  firstName: string;
  bio: string;
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

// Photo picker: a champagne-ringed circle that previews the chosen file. Size is
// the only per-context difference (large in the wizard step, smaller inline in
// the editor). Validation lives in the parent (it owns the error message).
export function PhotoPicker({
  previewUrl,
  onChange,
  label,
  size = "lg",
}: {
  previewUrl: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  label: string;
  size?: "lg" | "sm";
}) {
  const dimension = size === "lg" ? "h-44 w-44" : "h-28 w-28";
  return (
    <label className="mx-auto block w-fit cursor-pointer">
      <div
        className={`night-photo-ring flex ${dimension} items-center justify-center overflow-hidden rounded-full border border-dashed border-champagne/40 bg-bordeaux text-center transition hover:border-blush/60`}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="px-4 text-sm font-medium text-taupe">{label}</span>
        )}
      </div>
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onChange}
      />
    </label>
  );
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
