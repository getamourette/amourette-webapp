"use client";

import { ReactNode, useEffect, useRef } from "react";

// The shared room modal shell. Every popup around the live room (entry primer,
// email prompt, report, block) renders through this so backdrop, dismissal,
// spacing and the night-panel surface stay identical by construction. It only
// owns the frame: children provide their own content (and their own <form> when
// they need one). Keep it presentational — all state lives with the caller.
interface ModalProps {
  variant?: "centered" | "sheet";
  onClose: () => void;
  // Backdrop click, Esc and the × button only act while this is true. Callers
  // gate it to freeze the modal during in-flight work (e.g. email saving).
  dismissable?: boolean;
  // Render the top-right × (still gated by `dismissable`).
  showClose?: boolean;
  closeLabel?: string;
  labelledById?: string;
  // Extra classes for the backdrop (z-index, blur) and the panel (max-width).
  overlayClassName?: string;
  panelClassName?: string;
  children: ReactNode;
}

export function Modal({
  variant = "centered",
  onClose,
  dismissable = true,
  showClose = true,
  closeLabel,
  labelledById,
  overlayClassName = "",
  panelClassName = "",
  children,
}: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (variant !== "sheet") return;
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [variant]);
  // Esc closes, but only when the caller allows dismissal. Mount == open, since
  // callers render the modal conditionally.
  useEffect(() => {
    if (!dismissable || variant === "sheet") return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dismissable, onClose, variant]);

  // The native modal top layer makes the page inert even inside a clipped room.
  // Wrap Tab explicitly so the browser chrome does not interrupt the action loop.
  if (variant === "sheet") return <dialog ref={dialog} aria-modal="true" aria-labelledby={labelledById}
    className={`fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 text-cream backdrop:bg-velvet/85 backdrop:backdrop-blur-[2px] ${overlayClassName}`}
    onCancel={event => { event.preventDefault(); if (dismissable) onClose(); }}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
      )).filter(control => control.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus(); }
    }}
    onMouseDown={event => { if (dismissable && event.target === event.currentTarget) onClose(); }}>
    <div className={`night-panel absolute inset-x-0 bottom-0 mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] rounded-b-none px-6 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] ${panelClassName}`}>
      {children}
    </div>
  </dialog>;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledById}
      className={`fixed inset-0 z-40 flex items-center justify-center bg-velvet/85 px-6 backdrop-blur-[2px] ${overlayClassName}`}
      onMouseDown={(event) => {
        if (dismissable && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`night-panel relative w-full max-w-sm rounded-[2rem] p-6 ${panelClassName}`}
      >
        {showClose && dismissable && (
          <button
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className="night-button night-button-secondary absolute right-4 top-4 h-9 w-9 p-0 text-lg"
          >
            ×
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
