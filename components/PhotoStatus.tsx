'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { Locale } from '@/lib/strings';
import type { PhotoState, PhotoVersion } from '@/lib/photo-moderation';
import { photoStrings } from '@/lib/photo-strings';
import { photos } from '@/lib/photo-client';
import { invalidatePhotos } from '@/lib/usePhotoState';
import { ProfilePhoto } from './ProfilePhoto';
export function PhotoStatus({ state, versions = [], locale, editor = false, href = '/profile?edit=1' }: { state: PhotoState | null; versions?: PhotoVersion[]; locale: Locale; editor?: boolean; href?: string }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(false);
  const [dismissedRevision, setDismissedRevision] = useState<number | null>(null);
  if (!state) return null;
  const s = photoStrings[locale];
  const current = versions.find(v => v.id === state.displayed_id);
  const pending = versions.find(v => v.id === state.pending_id);
  if (!editor && state.last_action === 'approved' && !state.pending_id && !state.correction_required && dismissedRevision === state.revision) return null;
  if (!editor && !state.correction_required && !state.pending_id && state.last_action !== 'approved' && state.last_action !== 'rejected') return null;
  async function cancel() {
    if (!state?.pending_id) return;
    setWorking(true); setError(false);
    const result = await photos.rpc('decide_profile_photo', { p_owner: state.profile_id, p_version: state.pending_id, p_expected_revision: state.revision, p_action: 'cancelled' });
    setWorking(false); setError(Boolean(result.error)); invalidatePhotos();
  }
  return <section data-testid="photo-status" className="night-panel my-4 rounded-2xl p-5 text-sm text-cream" aria-live="polite">
    <p className="font-semibold">{s.title}</p>
    {state.correction_required && <p className="mt-2">{s.correction}</p>}
    {state.reason && <p className="mt-2">{s.reasons[state.reason]}</p>}
    {state.last_action === "rejected" && state.last_reason && state.last_reason !== state.reason && <p className="mt-2">{s.reasons[state.last_reason]}</p>}
    {state.pending_id ? <p className="mt-2">{s.pending}</p> : state.last_action === 'approved' ? <p className="mt-2">{s.approved}</p> : state.last_action === 'rejected' && !state.correction_required ? <p className="mt-2">{s.rejected}</p> : null}
    {editor && <div className="mt-4 flex flex-wrap gap-5">
      {current && !state.correction_required && <figure><ProfilePhoto src={current.path} alt="" className="h-28 w-24 rounded-xl object-cover"/><figcaption className="mt-2">{s.current}</figcaption></figure>}
      {pending && <figure><ProfilePhoto src={pending.path} alt="" className="h-28 w-24 rounded-xl object-cover"/><figcaption className="mt-2">{s.submitted}</figcaption></figure>}
    </div>}
    {!editor && (state.correction_required || state.last_action === 'rejected') && <Link href={href} className="night-button night-button-primary mt-4 inline-flex px-4 py-3">{s.edit}</Link>}
    {editor && state.pending_id && <button disabled={working} onClick={() => void cancel()} className="night-button night-button-secondary mt-4 px-4 py-2">{s.cancel}</button>}
    {!editor && state.last_action === "approved" && !state.pending_id && <button onClick={() => setDismissedRevision(state.revision)} className="night-button night-button-secondary mt-3 px-4 py-2">OK</button>}
    {error && <p role="alert" className="mt-2">{s.error}</p>}
  </section>;
}
