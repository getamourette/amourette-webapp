"use client";

import { FeedPhotoPreview } from "@/components/FeedPhotoPreview";
import { isValidText } from "@/lib/input-validation";

// Guided onboarding (#72): one question per screen (name → photo → I am → I want
// to meet), ending on an editable preview of the room card — the confirm screen
// IS the only write to the DB (see page.tsx). All state lives in the parent so
// the draft (localStorage) and the step index persist together; this component
// is presentational + navigation. Motion is a soft Expo.out fade per step, press
// scale 0.97, and it honours prefers-reduced-motion (globals.css .onb-step).

import type { GenderLabels, ProfileStrings } from "@/lib/strings";
import { LanguageSelector } from "@/app/LanguageSelector";
import { FIRST_NAME_MAX_LENGTH, PROFILE_BIO_MAX_LENGTH } from "@/lib/profile";
import {
  AgeGate,
  BioField,
  genderOptions,
  PhotoPicker,
  Segmented,
  type ProfileFormHandlers,
  type ProfileFormState,
} from "./fields";

// name · photo · gender · interest · bio · preview(confirm). The five questions
// carry the progress rail; the preview is a clean showcase of the room card, not
// a numbered step — the only control it keeps is the 18+ confirm at entry.
const QUESTION_COUNT = 5;
const PREVIEW_STEP = 5;

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
    (step === 0 && isValidText(form.firstName, FIRST_NAME_MAX_LENGTH)) ||
    (step === 1 && form.previewUrl !== "") ||
    (step === 2 && form.gender !== "") ||
    (step === 3 && form.interestedIn.length > 0) ||
    (step === 4 && isValidText(form.bio, PROFILE_BIO_MAX_LENGTH, false));

  const goNext = () => {
    if (step < PREVIEW_STEP) setStep(step + 1);
  };
  const goBack = () => {
    if (step > 0) setStep(step - 1);
  };

  if (step === PREVIEW_STEP) {
    return (
      <div key="preview" className="onb-step flex min-h-[100dvh] flex-col items-center">
        {/* Scale the reference feed together; keep actual form actions outside it. */}
        <div className="relative mx-auto aspect-[9/19.5] w-[min(100%,calc(68dvh*9/19.5))] shrink-0 overflow-hidden">
          {form.previewUrl && <FeedPhotoPreview src={form.previewUrl} firstName={form.firstName.trim() || s.firstName} bio={form.bio} likeLabel={s.crop.likePreview} />}
        </div>

        {/* Final consent stays at the moment of entry, above the submission. */}
        <div className="w-full max-w-md space-y-4 bg-velvet px-6 pb-10 pt-5">
          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" disabled={saving} onClick={goBack} className="night-button night-button-secondary min-h-11 px-3 text-xs">← {s.back}</button>
            <button type="button" disabled={saving} onClick={handlers.onRecrop} className="night-button night-button-secondary min-h-11 px-3 text-xs">{s.crop.recrop}</button>
            <label className="flex min-h-11 cursor-pointer items-center text-xs underline">{s.onb.changePhoto}<input type="file" disabled={saving} accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handlers.onPhotoChange} /></label>
          </div>
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
    <div className="flex min-h-[100dvh] flex-col px-6 pb-10 pt-10">
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
          {/* Language lives on the first screen only (the locale is a one-time
              choice at entry); after that it would just clutter the flow. */}
          {step === 0 ? (
            <LanguageSelector />
          ) : (
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
              aria-invalid={!isValidText(form.firstName, FIRST_NAME_MAX_LENGTH)}
              onChange={(event) => handlers.setFirstName(event.target.value)}
            />
            {form.firstName.trim() && !isValidText(form.firstName, FIRST_NAME_MAX_LENGTH) && <p role="alert" className="mt-2 text-sm text-blush">{s.firstNameTooLong}</p>}
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
                onRecrop={handlers.onRecrop}
                recropLabel={s.crop.recrop}
                changeLabel={s.onb.changePhoto}
                roundPreviewUrl={form.roundPreviewUrl}
                roundLabel={s.crop.roundLabel}
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

        {step === 4 && (
          <StepBody prompt={s.onb.bioPrompt} help={s.onb.bioHelp}>
            <BioField form={form} handlers={handlers} s={s} className="onb-input mt-8 h-32 resize-none" />
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
