'use client';

import { correctionStrings } from '@/lib/correction-strings';
import { profileReviewStrings } from '@/lib/profile-review-strings';
import type { Locale } from '@/lib/strings';
import type { useProfileReview } from '@/lib/useProfileReview';
import { PhotoPortrait } from './fields';

export function CorrectionCard({ state, locale, refusedPhoto, onEdit }: {
  state: ReturnType<typeof useProfileReview>; locale: Locale; refusedPhoto?: string; onEdit: () => void;
}) {
  const review = state.review;
  if (!review) return null;
  const s = correctionStrings[locale];
  const pending = review.status === 'needs_review';
  const photoOnly = review.fields.length === 1 && review.fields[0].field === 'photo';
  return <section data-testid="correction-card" className="night-panel mt-6 rounded-[2rem] border-blush/60 p-6">
    <h2 className="night-kicker">{s.requested}</h2>
    {refusedPhoto && <div className="mt-5 flex justify-center"><PhotoPortrait src={refusedPhoto} caption={s.refused} refused /></div>}
    <p className="mt-4 text-sm leading-6">{pending ? s.pending : photoOnly ? s.photoCorrection : s.profileCorrection}</p>
    <button type="button" disabled={state.working} onClick={onEdit}
      className={`night-button ${pending ? 'night-button-secondary' : 'night-button-primary'} mt-4 min-h-12 w-full px-4 py-3`}>
      {pending ? s.viewStatus : photoOnly ? s.modifyPhoto : s.modify}
    </button>
    {state.error && <p role="alert" className="mt-3 text-sm text-blush">{profileReviewStrings[locale].error} <button type="button" className="min-h-11 underline" onClick={() => void state.refresh()}>{profileReviewStrings[locale].retry}</button></p>}
  </section>;
}
