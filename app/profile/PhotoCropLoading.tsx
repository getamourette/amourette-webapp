"use client";

import { useEffect, useRef } from 'react';
import type { ProfileStrings } from '@/lib/strings';

/** The source download is cancellable before the cropper has an image to decode. */
export function PhotoCropLoading({ strings, onCancel }: {
  strings: ProfileStrings['crop']; onCancel: () => void;
}) {
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
    <header className="shrink-0 px-4 pb-2 pt-[max(.75rem,env(safe-area-inset-top))] text-center">
      <h2 id="photo-source-title" className="font-display text-xl italic">{strings.title}</h2>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button type="button" autoFocus onClick={onCancel} className="night-button night-button-secondary min-h-11 px-3 text-xs">{strings.cancel}</button>
        <button type="button" disabled className="night-button night-button-primary min-h-11 px-3 text-xs opacity-50">{strings.usePhoto}</button>
      </div>
    </header>
    <div className="flex flex-1 items-center justify-center bg-bordeaux-deep p-4">
      <p role="status" className="text-sm text-taupe">{strings.processing}</p>
    </div>
  </dialog>;
}
