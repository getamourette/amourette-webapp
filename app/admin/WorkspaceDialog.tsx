"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./VenueWorkspace.module.css";

export function WorkspaceDialog({ title, busy, onClose, children }: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  return <dialog ref={dialog} className={`admin-modal-surface ${styles.dialog}`} aria-labelledby="venue-dialog-title" aria-busy={busy}
    onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]'
      )).filter(element => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      if (!first || !last) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    }}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className={styles.dialogHeader}>
      <h2 id="venue-dialog-title">{title}</h2>
      <button type="button" disabled={busy} className={styles.close} aria-label="Close dialog" onClick={onClose}>×</button>
    </header>
    <div className={styles.dialogContent}>{children}</div>
  </dialog>;
}
