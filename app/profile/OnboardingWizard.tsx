"use client";

// Guided onboarding (#72): one question per screen (name → photo → I am → I want
// to meet), ending on an editable preview of the room card — the confirm screen
// IS the only write to the DB (see page.tsx). All state lives in the parent so
// the draft (localStorage) and the step index persist together. This component
// also owns its mobile viewport shell so iOS keyboard panning cannot scroll the
// document. Motion is a soft Expo.out fade per step, press scale 0.97, and it
// honours prefers-reduced-motion (globals.css .onb-step).

import { useEffect, useRef, type CSSProperties } from "react";
import type { GenderLabels, ProfileStrings } from "@/lib/strings";
import { LanguageSelector } from "@/app/LanguageSelector";
import { FIRST_NAME_MAX_LENGTH, PROFILE_BIO_MAX_LENGTH } from "@/lib/profile";
import {
  AgeGate,
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
const KEYBOARD_HEIGHT_THRESHOLD = 120;

function layoutViewportHeight() {
  return document.documentElement.clientHeight || window.innerHeight;
}

function useOnboardingViewport() {
  const shellRef = useRef<HTMLDivElement>(null);
  const followViewportRef = useRef<(ms: number) => void>(() => undefined);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const viewport = window.visualViewport;
    let polling = false;
    let pollUntil = 0;
    let restoreScrollUntil = 0;
    let stopped = false;
    let keyboardWasOpen = false;
    let regime: "unknown" | "pan" | "none" = "unknown";
    let regimeDeadline = 0;

    const apply = () => {
      const layoutHeight = layoutViewportHeight();
      const visibleHeight = viewport?.height ?? layoutHeight;
      const offset = viewport?.offsetTop ?? 0;
      const keyboardInset = layoutHeight - visibleHeight;
      const keyboardIsOpen = keyboardInset > KEYBOARD_HEIGHT_THRESHOLD;

      if (keyboardIsOpen && regime === "unknown") {
        if (regimeDeadline === 0) {
          regimeDeadline = performance.now() + 600;
        } else if (performance.now() > regimeDeadline) {
          regime = offset > 0 ? "pan" : "none";
        }
      } else if (!keyboardIsOpen) {
        regimeDeadline = 0;
      }

      if (keyboardWasOpen && !keyboardIsOpen) {
        restoreScrollUntil = performance.now() + 700;
      }
      if (performance.now() < restoreScrollUntil && shellRef.current) {
        shellRef.current.scrollTop = 0;
      }

      keyboardWasOpen = keyboardIsOpen;
      const shift = regime === "none" ? -keyboardInset : 0;
      root.style.setProperty("--onb-shell-shift", `${shift}px`);
      root.style.setProperty("--onb-vh", `${visibleHeight}px`);
    };

    const poll = () => {
      if (stopped) {
        polling = false;
        return;
      }
      apply();
      if (performance.now() < pollUntil) {
        requestAnimationFrame(poll);
        return;
      }
      polling = false;
    };

    const follow = (ms: number) => {
      pollUntil = Math.max(pollUntil, performance.now() + ms);
      if (polling) return;
      polling = true;
      requestAnimationFrame(poll);
    };
    followViewportRef.current = follow;

    const handleViewportEvent = () => follow(700);

    apply();
    viewport?.addEventListener("resize", handleViewportEvent);
    viewport?.addEventListener("scroll", handleViewportEvent);
    window.addEventListener("resize", handleViewportEvent);
    window.addEventListener("orientationchange", handleViewportEvent);

    const previous = {
      htmlOverflow: root.style.overflow,
      htmlOverscroll: root.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
    };
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";

    return () => {
      stopped = true;
      pollUntil = 0;
      viewport?.removeEventListener("resize", handleViewportEvent);
      viewport?.removeEventListener("scroll", handleViewportEvent);
      window.removeEventListener("resize", handleViewportEvent);
      window.removeEventListener("orientationchange", handleViewportEvent);
      root.style.overflow = previous.htmlOverflow;
      root.style.overscrollBehavior = previous.htmlOverscroll;
      body.style.overflow = previous.bodyOverflow;
      body.style.overscrollBehavior = previous.bodyOverscroll;
      root.style.removeProperty("--onb-vh");
      root.style.removeProperty("--onb-shell-shift");
    };
  }, []);

  const followKeyboardTransition = () => followViewportRef.current(1_000);
  return { shellRef, followKeyboardTransition };
}

const viewportShellStyle = {
  position: "fixed",
  bottom: 0,
  left: 0,
  width: "100%",
  height: "var(--onb-vh, 100dvh)",
  minHeight: 0,
  transform: "translateY(var(--onb-shell-shift, 0px))",
} satisfies CSSProperties;

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
  const { shellRef, followKeyboardTransition } = useOnboardingViewport();

  const canContinue =
    (step === 0 && form.firstName.trim() !== "") ||
    (step === 1 && form.previewUrl !== "") ||
    (step === 2 && form.gender !== "") ||
    (step === 3 && form.interestedIn.length > 0) ||
    step === 4; // bio is optional — always skippable

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
      <div
        ref={shellRef}
        key="preview"
        className="onb-step flex flex-col overflow-y-auto overscroll-contain"
        style={viewportShellStyle}
      >
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

        {/* The card above is a clean showcase (photo, name, bio, chips). The
            only control here is the 18+ confirm — the legal gate lives at the
            moment of entry, right above the CTA. */}
        <div className="space-y-4 bg-velvet px-6 pb-10 pt-5">
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
    <div
      ref={shellRef}
      className="flex flex-col overflow-y-auto overscroll-contain px-6 pb-10 pt-10"
      style={viewportShellStyle}
      onFocusCapture={followKeyboardTransition}
      onBlurCapture={followKeyboardTransition}
    >
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
              maxLength={FIRST_NAME_MAX_LENGTH}
              onChange={(event) => handlers.setFirstName(event.target.value)}
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

        {step === 4 && (
          <StepBody prompt={s.onb.bioPrompt} help={s.onb.bioHelp}>
            <textarea
              className="onb-input mt-8 h-32 resize-none"
              placeholder={s.bioOptional}
              value={form.bio}
              maxLength={PROFILE_BIO_MAX_LENGTH}
              onChange={(event) => handlers.setBio(event.target.value)}
            />
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
