'use client';
import Link from 'next/link';
import { Modal } from '@/components/ui/modal';
import { useEffect, useId, useState } from 'react';
import type { Locale } from '@/lib/strings';
import type { PhotoState } from '@/lib/photo-moderation';
import { photoStrings } from '@/lib/photo-strings';
const panel = 'night-panel my-4 rounded-2xl p-5 text-sm text-cream';
function DecisionNotice({ state, locale, sheet, href }: { state: PhotoState; locale: Locale; sheet: boolean; href: string }) {
  const key = `photo-decision-seen:${state.profile_id}`;
  const titleId = useId();
  const [visible, setVisible] = useState(() => {
    try { return localStorage.getItem(key) !== String(state.revision); } catch { return true; }
  });
  useEffect(() => {
    // Both outcomes are consumed on display, not on dismissal. Local state keeps
    // a failed storage write from reopening the notice during this mount.
    try { localStorage.setItem(key, String(state.revision)); } catch { /* Storage may be unavailable. */ }
  }, [key, state.revision]);
  const s = photoStrings[locale];
  if (!visible) return null;
  const rejected = state.last_action === 'rejected';
  const content = <section data-testid="photo-status" className={sheet ? 'text-sm leading-relaxed text-cream' : panel} aria-live={sheet ? undefined : 'polite'}>
    {sheet && <div aria-hidden="true" className="mx-auto mb-5 h-1 w-10 rounded-full bg-champagne/30" />}
    <h2 id={titleId} className="font-display text-2xl italic">{rejected ? s.rejectedTitle : s.approvedTitle}</h2>
    <p className="mt-3 text-base">{rejected ? s.rejected : s.approved}</p>
    {rejected && state.last_reason && <p className="mt-3 text-taupe">{s.reasonLabel} {s.reasons[state.last_reason]}</p>}
    <div className="mt-5 flex flex-col gap-3">
      {rejected && <Link href={href} onClick={() => setVisible(false)} className="night-button night-button-primary min-h-12 px-4 py-3 text-center">{s.chooseAnother}</Link>}
      <button type="button" onClick={() => setVisible(false)} className={`night-button ${rejected ? 'night-button-secondary' : 'night-button-primary'} min-h-12 px-4 py-3`}>{rejected ? s.dismiss : s.ok}</button>
    </div>
  </section>;
  return sheet ? <Modal variant="sheet" onClose={() => setVisible(false)} labelledById={titleId} showClose={false}>{content}</Modal> : content;
}
// A decision is shared across home and room; the editor has a persistent inline status.
export function PhotoDecisionNotice({ state, locale, sheet = false, href = '/profile?edit=1' }: { state: PhotoState; locale: Locale; sheet?: boolean; href?: string }) {
  if (state.correction_required || state.pending_id || (state.last_action !== 'approved' && state.last_action !== 'rejected')) return null;
  return <DecisionNotice key={`${state.profile_id}:${state.revision}`} state={state} locale={locale} sheet={sheet} href={href} />;
}
export function photoReason(state: PhotoState) {
  return state.last_action === 'rejected' ? state.last_reason ?? state.reason : state.reason;
}
export function PhotoStatus({ state, locale, consolidated = false, sheet = false, href = '/profile?edit=1' }: { state: PhotoState | null; locale: Locale; consolidated?: boolean; sheet?: boolean; href?: string }) {
  if (!state || consolidated) return null;
  const s = photoStrings[locale];
  const reason = photoReason(state);
  if (!state.correction_required && !state.pending_id) return <PhotoDecisionNotice state={state} locale={locale} sheet={sheet} href={href} />;
  return <section data-testid="photo-status" className={`${panel} [&>p:first-child]:mt-0`} aria-live="polite">
    {!state.pending_id && state.correction_required && <p className="mt-2">{s.correction}</p>}
    {!state.pending_id && reason && <p className="mt-2">{s.reasons[reason]}</p>}
    {state.pending_id && <p className="mt-2">{s.pending}</p>}
    {!state.pending_id && state.correction_required && <Link href={href} className="night-button night-button-primary mt-4 inline-flex px-4 py-3">{s.edit}</Link>}
  </section>;
}
