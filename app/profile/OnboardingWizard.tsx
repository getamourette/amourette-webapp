"use client";

// Guided onboarding (#72): one question per screen (name → photo → I am → I want
// to meet), ending on an editable preview of the room card — the confirm screen
// IS the only write to the DB (see page.tsx). All state lives in the parent so
// the draft (localStorage) and the step index persist together; this component
// is presentational + navigation. Motion is a soft Expo.out fade per step, press
// scale 0.97, and it honours prefers-reduced-motion (globals.css .onb-step).

import type { GenderLabels, ProfileStrings } from "@/lib/strings";
import {
  AgeGate,
  genderOptions,
  PhotoPicker,
  Segmented,
  type ProfileFormHandlers,
  type ProfileFormState,
} from "./fields";

// name · photo · gender · interest · preview(confirm). The four questions carry
// the progress rail; the preview is the confirmation, not a numbered step.
const QUESTION_COUNT = 4;
const PREVIEW_STEP = 4;

export function OnboardingWizard({
  s,
  genderLabels,
  form,
  handlers,
  step,
  setStep,
  saving,
  message,
  resumed,
  onSubmit,
}: {
  s: ProfileStrings;
  genderLabels: GenderLabels;
  form: ProfileFormState;
  handlers: ProfileFormHandlers;
  step: number;
  setStep: (step: number) => void;
  saving: boolean;
  message: string;
  resumed: boolean;
  onSubmit: () => void;
}) {
  const options = genderOptions(genderLabels);

  const canContinue =
    (step === 0 && form.firstName.trim() !== "") ||
    (step === 1 && form.previewUrl !== "") ||
    (step === 2 && form.gender !== "") ||
    (step === 3 && form.interestedIn.length > 0);

  const goNext = () => {
    if (step < PREVIEW_STEP) setStep(step + 1);
  };
  const goBack = () => {
    if (step > 0) setStep(step - 1);
  };

  if (step === PREVIEW_STEP) {
    const interestSummary = form.interestedIn
      .map((gender) => genderLabels[gender])
      .join(" · ");

    return (
      <div key="preview" className="onb-step flex min-h-[100dvh] flex-col">
        {/* Full-bleed room-card preview: your photo, graded into the same night
            as the live feed (chiaroscuro → key → vignette → grain → scrim). */}
        <div className="relative flex-1 overflow-hidden">
          {form.previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={form.previewUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <div className="room-grade absolute inset-0" />
          <div className="room-key absolute inset-0" />
          <div className="room-vignette absolute inset-0" />
          <div className="room-grain absolute inset-0" />
          <div className="room-top-scrim absolute inset-x-0 top-0 h-40" />
          <div className="room-identity-scrim absolute inset-0" />

          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 pt-6">
            <button
              type="button"
              onClick={goBack}
              className="night-button night-button-secondary px-4 py-2 text-xs"
            >
              ← {s.back}
            </button>
            <label className="night-button night-button-secondary cursor-pointer px-4 py-2 text-xs">
              {s.onb.changePhoto}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlers.onPhotoChange}
              />
            </label>
          </div>

          <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-6">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-blush" aria-hidden />
              <span className="night-kicker">{s.onb.previewKicker}</span>
            </div>
            <h2 className="font-display mt-3 text-5xl font-medium italic leading-none text-cream">
              {form.firstName.trim() || s.firstName}
            </h2>
            {form.bio.trim() && (
              <p className="mt-3 max-w-[16rem] text-sm font-light leading-relaxed text-cream/80">
                {form.bio.trim()}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {form.gender && <Chip>{genderLabels[form.gender]}</Chip>}
              {interestSummary && (
                <Chip>
                  {s.iWantToMeet} · {interestSummary}
                </Chip>
              )}
              {form.adultConfirmed && <Chip tone="blush">18+</Chip>}
            </div>
          </div>
        </div>

        {/* Below the card: what you edit reflects live into the preview above. */}
        <div className="space-y-4 bg-velvet px-6 pb-10 pt-6">
          <textarea
            className="night-input h-24 resize-none px-5 py-4"
            placeholder={s.onb.previewBioPlaceholder}
            value={form.bio}
            onChange={(event) => handlers.setBio(event.target.value)}
          />
          <AgeGate
            checked={form.adultConfirmed}
            onChange={handlers.setAdultConfirmed}
            label={s.adultConfirm}
          />
          {message && <Message>{message}</Message>}
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving || !form.adultConfirmed}
            className="night-button night-button-primary w-full px-5 py-4 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? s.saving : s.save}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col px-6 pb-10 pt-20">
      <div>
        <div className="onb-progress" aria-hidden>
          {Array.from({ length: QUESTION_COUNT }, (_, index) => (
            <span
              key={index}
              className={index < step ? "done" : index === step ? "now" : ""}
            />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <p className="night-kicker">{s.onb.stepOf(step + 1, QUESTION_COUNT)}</p>
          {step > 0 && (
            <button
              type="button"
              onClick={goBack}
              className="font-label text-xs uppercase tracking-widest text-taupe transition hover:text-cream"
            >
              ← {s.back}
            </button>
          )}
        </div>
        {resumed && (
          <p className="mt-3 text-xs font-light text-blush/80">
            {s.onb.resumeNote}
          </p>
        )}
      </div>

      <div key={step} className="onb-step flex flex-1 flex-col justify-center py-10">
        {step === 0 && (
          <StepBody prompt={s.onb.namePrompt} help={s.onb.nameHelp}>
            <input
              className="onb-input mt-8"
              placeholder={s.firstName}
              value={form.firstName}
              onChange={(event) => handlers.setFirstName(event.target.value)}
              autoFocus
            />
          </StepBody>
        )}

        {step === 1 && (
          <StepBody prompt={s.onb.photoPrompt} help={s.onb.photoHelp}>
            <div className="mt-10">
              <PhotoPicker
                previewUrl={form.previewUrl}
                onChange={handlers.onPhotoChange}
                label={s.addPhoto}
                size="lg"
              />
            </div>
            {message && <Message center>{message}</Message>}
          </StepBody>
        )}

        {step === 2 && (
          <StepBody prompt={s.onb.genderPrompt}>
            <div className="mt-8">
              <Segmented
                layout="row"
                options={options}
                isOn={(gender) => form.gender === gender}
                onToggle={handlers.setGender}
                ariaLabel={s.iAm}
              />
            </div>
          </StepBody>
        )}

        {step === 3 && (
          <StepBody prompt={s.onb.interestPrompt} help={s.onb.interestHelp}>
            <div className="mt-8">
              <Segmented
                layout="row"
                options={options}
                isOn={(gender) => form.interestedIn.includes(gender)}
                onToggle={handlers.toggleInterest}
                ariaLabel={s.iWantToMeet}
              />
            </div>
          </StepBody>
        )}
      </div>

      <div className="space-y-4">
        <button
          type="button"
          onClick={goNext}
          disabled={!canContinue}
          className="night-button night-button-primary w-full px-5 py-4 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {s.onb.continue}
        </button>
        <p className="flex items-center justify-center gap-2 font-label text-[9.5px] uppercase tracking-[0.16em] text-taupe">
          <span className="h-1 w-1 rounded-full bg-blush" aria-hidden />
          {s.onb.reassure}
        </p>
      </div>
    </div>
  );
}

function StepBody({
  prompt,
  help,
  children,
}: {
  prompt: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="font-display text-[2.4rem] font-medium italic leading-[1.05] text-cream">
        {prompt}
      </h2>
      {help && <p className="mt-3 text-sm font-light text-taupe">{help}</p>}
      {children}
    </div>
  );
}

function Chip({
  children,
  tone = "cream",
}: {
  children: React.ReactNode;
  tone?: "cream" | "blush";
}) {
  const toneClass =
    tone === "blush"
      ? "border-blush/30 text-blush"
      : "border-champagne/25 text-cream";
  return (
    <span
      className={`rounded-full border bg-velvet/50 px-3.5 py-2 font-label text-[10px] uppercase tracking-wider ${toneClass}`}
    >
      {children}
    </span>
  );
}

function Message({
  children,
  center,
}: {
  children: React.ReactNode;
  center?: boolean;
}) {
  return (
    <p
      className={`rounded-2xl border border-champagne/15 bg-bordeaux px-4 py-3 text-sm text-taupe ${
        center ? "mt-6 text-center" : ""
      }`}
    >
      {children}
    </p>
  );
}
