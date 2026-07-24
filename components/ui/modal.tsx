"use client";

import { ReactNode, useEffect } from "react";

// The shared room modal shell. Every popup around the live room (entry primer,
// email prompt, report, block) renders through this so backdrop, dismissal,
// spacing and the night-panel surface stay identical by construction. It only
// owns the frame: children provide their own content (and their own <form> when
// they need one). Keep it presentational — all state lives with the caller.
interface ModalProps {
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
  onClose,
  dismissable = true,
  showClose = true,
  closeLabel,
  labelledById,
  overlayClassName = "",
  panelClassName = "",
  children,
}: ModalProps) {
  // Esc closes, but only when the caller allows dismissal. Mount == open, since
  // callers render the modal conditionally.
  useEffect(() => {
    if (!dismissable) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dismissable, onClose]);

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
