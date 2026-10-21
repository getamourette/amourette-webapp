"use client";

import { useEffect, useRef, useState } from 'react';
import { PHOTO_ACCEPT } from '@/lib/heic';
import type { ProfileStrings } from '@/lib/strings';

/** The source download is cancellable before the cropper has an image to decode. */
export function PhotoCropLoading({ strings, onCancel, error, onChooseAnother }: {
  strings: ProfileStrings['crop']; onCancel: () => void;
  error?: string; onChooseAnother: (file: File) => Promise<void>;
}) {
  const [selecting, setSelecting] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const focus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      if (focus instanceof HTMLElement) focus.focus();
    };
  }, []);
  return <dialog ref={dialogRef} aria-modal="true" aria-labelledby="photo-source-title"
    onCancel={event => { event.preventDefault(); onCancel(); }}
    className="fixed inset-0 m-0 flex h-[100dvh] max-h-none w-full max-w-none flex-col overflow-y-auto border-0 bg-velvet p-0 text-cream">
    <header className="shrink-0 px-4 pb-4 pt-[max(.75rem,env(safe-area-inset-top))] text-center">
      <div className="relative px-11">
        <button type="button" autoFocus aria-label={strings.cancel} onClick={onCancel}
          className="absolute left-0 top-0 flex min-h-11 min-w-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-champagne">
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
        <p className="night-kicker text-taupe">{strings.kicker}</p>
        <h2 id="photo-source-title" className="mt-2 font-display text-2xl italic leading-tight">{strings.title}</h2>
      </div>
    </header>
    <div className="flex flex-1 items-center justify-center bg-bordeaux-deep p-4">
      <p role={error ? "alert" : "status"} className="max-w-sm text-center text-sm text-taupe">{error || strings.processing}</p>
    </div>
    <div className="shrink-0 bg-bordeaux px-5 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-4">
      <button type="button" disabled className="night-button night-button-primary min-h-12 w-full px-5 py-3 opacity-50">{strings.next}</button>
      {error && <label className="relative mx-auto mt-1 flex min-h-11 w-fit cursor-pointer items-center text-xs underline underline-offset-4 focus-within:outline-2 focus-within:outline-champagne">
        {strings.chooseAnother}<input type="file" accept={PHOTO_ACCEPT} disabled={selecting} className="sr-only" onChange={async event => {
          const file = event.target.files?.[0]; event.target.value = '';
          if (!file || selecting) return;
          setSelecting(true);
          try { await onChooseAnother(file); } finally { setSelecting(false); }
        }} />
      </label>}
    </div>
  </dialog>;
}
