'use client';

// The editor's single photo block (#276): status, photos and actions together.
// With a new photo (local or pending) next to a usable displayed one, both are
// shown side by side; the picker always holds the newest, editable version.

import { useState, type ChangeEvent, type MouseEventHandler } from 'react';
import type { Locale } from '@/lib/strings';
import type { PhotoState, PhotoVersion } from '@/lib/photo-moderation';
import { photoStrings } from '@/lib/photo-strings';
import { photos } from '@/lib/photo-client';
import { invalidatePhotos } from '@/lib/usePhotoState';
import { CircleAlert } from 'lucide-react';
import { photoReason } from '@/components/PhotoStatus';
import { PhotoPicker, PhotoPortrait, photoCaption as caption } from './fields';

export function PhotoSection({ state, versions, locale, unified, previewUrl, selected, sending, disabled, error,
  onPhotoChange, onRecrop, onSend, onKeep, addLabel, editLabel }: {
  state: PhotoState | null; versions: PhotoVersion[]; locale: Locale; unified: boolean;
  previewUrl: string; selected: boolean; sending: boolean; disabled: boolean; error: string;
  onPhotoChange: (event: ChangeEvent<HTMLInputElement>) => void; onRecrop: MouseEventHandler<HTMLButtonElement>;
  onSend: () => void; onKeep: () => void; addLabel: string; editLabel: string;
}) {
  // Cancellation stays locked, and its failure visible, for the revision it targeted.
  const [cancelAt, setCancelAt] = useState<number | null>(null);
  const [cancelErrorAt, setCancelErrorAt] = useState<number | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const s = photoStrings[locale];
  const correction = Boolean(state?.correction_required);
  // The state decides what is pending; version metadata may load later or fail.
  const hasPending = Boolean(state?.pending_id);
  const displayed = versions.find(version => version.id === state?.displayed_id);
  const pending = versions.find(version => version.id === state?.pending_id);
  const usableDisplayed = correction ? undefined : displayed;
  const compareWith = previewUrl || pending ? usableDisplayed : undefined;
  const reason = state && photoReason(state);
  const pickerCaption = previewUrl ? s.unsent : hasPending ? (pending ? s.submitted : '') : usableDisplayed ? s.current : '';

  async function cancel() {
    if (!state?.pending_id) return;
    const revision = state.revision;
    setCancelAt(revision); setCancelErrorAt(null);
    const result = await photos.rpc('decide_profile_photo', { p_owner: state.profile_id, p_version: state.pending_id, p_expected_revision: revision, p_action: 'cancelled' });
    if (result.error) { setCancelAt(null); setCancelErrorAt(revision); }
    else setCancelled(true);
    invalidatePhotos();
  }

  // A unified profile review already explains what to change and when to submit.
  const status = unified ? null : correction ? <div data-testid="photo-status" aria-live="polite" className="mt-4 rounded-2xl bg-blush/10 px-4 py-3 text-sm leading-relaxed text-cream">
    <p className="font-medium">{s.correction}</p>
    {hasPending ? <p className="mt-2">{s.pending}</p> : reason && <p className="mt-2 text-blush">{s.reasons[reason]}</p>}
  </div> : hasPending ? <p data-testid="photo-status" aria-live="polite" className="mt-4 text-sm leading-relaxed text-cream">{s.pending}</p>
    : cancelled && state?.last_action === 'cancelled' && !selected ? <p data-testid="photo-status" aria-live="polite" className="mt-4 text-sm leading-relaxed text-taupe">{s.cancelled}</p>
    : null;

  return <section id="profile-review-photo" tabIndex={-1} data-testid="photo-section" aria-labelledby="profile-photo-heading"
    className={`night-panel mt-8 rounded-[2rem] p-6 sm:p-7 ${correction ? 'border-blush/60' : ''}`}>
    <h2 id="profile-photo-heading" className="night-kicker">{s.title}</h2>
    {status}

    <div className="mt-5 flex items-start justify-center gap-3">
      {compareWith && <>
        <PhotoPortrait src={compareWith.path} caption={s.current} />
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mt-20 shrink-0 text-taupe"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </>}
      <figure className="flex w-28 flex-col items-center">
        <PhotoPicker inputId="profile-review-photo-input" currentPhoto={(pending ?? displayed)?.path} previewUrl={previewUrl}
          onChange={onPhotoChange} label={addLabel} size="sm" disabled={disabled} onRecrop={onRecrop} editLabel={editLabel} />
        {pickerCaption && <figcaption className={`${caption} ${compareWith ? 'text-champagne' : 'text-cream'}`}>{pickerCaption}</figcaption>}
      </figure>
    </div>

    {!correction && !hasPending && state?.last_action === 'rejected' && <p data-testid="photo-rejection-inline" role="status" className="mt-4 flex items-start gap-2 rounded-2xl bg-blush/10 px-4 py-3 text-sm leading-relaxed text-cream">
      <CircleAlert aria-hidden="true" size={18} className="mt-0.5 shrink-0 text-blush" />
      <span>{s.rejectedInline(reason ?? null)}</span>
    </p>}

    {error && <p role="alert" className="mt-4 text-center text-sm text-blush">{error}</p>}
    {cancelErrorAt !== null && cancelErrorAt === state?.revision && <p role="alert" className="mt-4 text-center text-sm text-blush">{s.error}</p>}
    {selected && <div className="mt-5 flex flex-col gap-1">
      <button type="button" onClick={onSend} disabled={disabled} className="night-button night-button-primary w-full px-4 py-3 disabled:cursor-not-allowed disabled:opacity-50">
        {sending ? s.sending : s.send}
      </button>
      {(usableDisplayed || hasPending) && <button type="button" onClick={onKeep} disabled={disabled} className="min-h-11 w-full text-sm text-cream underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-50">
        {hasPending ? s.discard : s.keep}
      </button>}
    </div>}
    {!selected && hasPending && <button type="button" disabled={disabled || cancelAt === state?.revision} onClick={() => void cancel()} className="night-button night-button-secondary mt-5 w-full px-4 py-3 disabled:cursor-not-allowed disabled:opacity-50">{s.cancel}</button>}
  </section>;
}
