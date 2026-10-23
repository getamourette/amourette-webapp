'use client';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Locale } from '@/lib/strings';
import type { PhotoState } from '@/lib/photo-moderation';
import { photoStrings } from '@/lib/photo-strings';
import { correctionStrings } from '@/lib/correction-strings';
import { RoomCorrectionState } from './RoomCorrectionState';
const panel = 'night-panel my-4 rounded-2xl p-5 text-sm text-cream';
const notice = 'mt-4 flex w-full items-center justify-between gap-3 rounded-2xl border border-champagne/20 bg-velvet px-4 shadow-lg shadow-black/40 py-3 text-left text-sm leading-relaxed text-cream';
const dismiss = 'min-h-11 shrink-0 rounded-lg px-2 text-sm text-champagne hover:text-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne';
function ApprovalNotice({ state, locale }: { state: PhotoState; locale: Locale }) {
  const key = `photo-approval-seen:${state.profile_id}`;
  const [visible, setVisible] = useState(() => {
    try { return localStorage.getItem(key) !== String(state.revision); } catch { return true; }
  });
  useEffect(() => {
    // A decision remains available after an absence, but is consumed once shown.
    try { localStorage.setItem(key, String(state.revision)); } catch { /* Storage may be unavailable. */ }
  }, [key, state.revision]);
  if (!visible) return null;
  return <section data-testid="photo-status" className={notice} aria-live="polite">
    <p className="flex items-center gap-2"><Check aria-hidden="true" size={16} className="shrink-0 text-champagne" />{photoStrings[locale].approved}</p>
    <button type="button" onClick={() => setVisible(false)} className={dismiss}>{photoStrings[locale].dismiss}</button>
  </section>;
}
function ReplacementRejectionNotice({ state, locale }: { state: PhotoState; locale: Locale }) {
  const key = `photo-rejection-dismissed:${state.profile_id}`;
  const [visible, setVisible] = useState(() => {
    try { return localStorage.getItem(key) !== String(state.revision); } catch { return true; }
  });
  const s = photoStrings[locale];
  if (!visible) return null;
  return <section data-testid="photo-status" className={notice} aria-live="polite">
    <div className="min-w-0 text-blush">
      <p>{s.rejected}</p>
      {state.last_reason && <p className="mt-2">{s.reasons[state.last_reason]}</p>}
    </div>
    <button type="button" onClick={() => {
      try { localStorage.setItem(key, String(state.revision)); } catch { /* Storage may be unavailable. */ }
      setVisible(false);
    }} className={dismiss}>{s.dismiss}</button>
  </section>;
}
// Dismissible outcome of a voluntary replacement; the displayed photo stays usable.
export function PhotoDecisionNotice({ state, locale }: { state: PhotoState; locale: Locale }) {
  if (state.correction_required || state.pending_id) return null;
  const key = `${state.profile_id}:${state.revision}`;
  if (state.last_action === 'approved') return <ApprovalNotice key={key} state={state} locale={locale} />;
  if (state.last_action === 'rejected') return <ReplacementRejectionNotice key={key} state={state} locale={locale} />;
  return null;
}
export function photoReason(state: PhotoState) {
  return state.last_action === 'rejected' ? state.last_reason ?? state.reason : state.reason;
}
export function PhotoStatus({ state, locale, consolidated = false, href = '/profile?edit=1', variant = 'compact' }: { state: PhotoState | null; locale: Locale; consolidated?: boolean; href?: string; variant?: 'compact' | 'room' }) {
  if (!state || consolidated) return null;
  const s = photoStrings[locale];
  const reason = photoReason(state);
  if (!state.correction_required && !state.pending_id) return <PhotoDecisionNotice state={state} locale={locale} />;
  if (variant === 'room' && state.correction_required) return <RoomCorrectionState locale={locale} photoOnly pending={Boolean(state.pending_id)}>
    <Link href={href} className={`night-button ${state.pending_id ? 'night-button-secondary' : 'night-button-primary'} mt-8 inline-flex min-h-11 items-center justify-center px-4 py-3 text-sm`}>{state.pending_id ? correctionStrings[locale].viewStatus : correctionStrings[locale].modifyPhoto}</Link>
  </RoomCorrectionState>;
  return <section data-testid="photo-status" className={`${panel} [&>p:first-child]:mt-0`} aria-live="polite">
    {!state.pending_id && state.correction_required && <p className="mt-2">{s.correction}</p>}
    {!state.pending_id && reason && <p className="mt-2">{s.reasons[reason]}</p>}
    {state.pending_id && <p className="mt-2">{s.pending}</p>}
    {!state.pending_id && state.correction_required && <Link href={href} className="night-button night-button-primary mt-4 inline-flex px-4 py-3">{s.edit}</Link>}
  </section>;
}
