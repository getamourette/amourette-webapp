'use client';

import { useId } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { REVIEW_FIELDS, reviewReady, type ReviewCorrection, type ReviewField } from '@/lib/profile-review';
import { profileReviewStrings } from '@/lib/profile-review-strings';
import { photoStrings } from '@/lib/photo-strings';
import type { Locale } from '@/lib/strings';

export function ProfileCorrectionPrompt({ fields, updatedFields, pending, canSubmit, notification, working, error, locale, onAcknowledge, onEdit, onSubmit }: {
  fields: ReviewCorrection[];
  updatedFields: ReviewField[];
  pending: boolean;
  canSubmit: boolean;
  notification: boolean;
  working: boolean;
  error: string | null;
  locale: Locale;
  onAcknowledge: () => void;
  onEdit: (field: ReviewField) => void;
  onSubmit: () => void;
}) {
  const titleId = useId();
  const helpId = useId();
  const s = profileReviewStrings[locale];
  const requested = REVIEW_FIELDS.flatMap(field => fields.filter(item => item.field === field));
  if (!requested.length) return null;
  const ready = reviewReady(fields, updatedFields, canSubmit);
  return <section className="night-panel my-4 rounded-2xl p-5 text-cream" aria-labelledby={titleId} data-testid="profile-correction-prompt">
    {notification && <div className="mb-4 border-b border-cream/10 pb-4" role="status">
      <p className="text-sm font-semibold">{s.notification}</p>
      <button type="button" disabled={working} onClick={onAcknowledge} className="night-button night-button-secondary mt-3 min-h-11 px-4 py-2">{s.acknowledge}</button>
    </div>}
    <h2 id={titleId} className="font-display text-xl text-pretty">{pending ? s.pendingTitle : s.title}</h2>
    <p className="mt-2 text-sm leading-6 text-taupe">{pending ? s.pending : s.hidden}</p>
    <ul className="mt-4 space-y-4">{requested.map(item => <li key={item.field} className="min-w-0 rounded-xl border border-cream/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{s.fields[item.field]}</h3>
        {updatedFields.includes(item.field) && <span className="inline-flex items-center gap-1 text-xs text-champagne"><Check aria-hidden="true" size={14} />{s.updated}</span>}
      </div>
      <p className="mt-2 break-words text-sm leading-6 text-taupe">{item.field === 'photo' ? photoStrings[locale].reasons[item.reason] : s.reasons[item.reason]}</p>
      {!pending && <button type="button" disabled={working} onClick={() => onEdit(item.field)} className="night-button night-button-secondary mt-3 inline-flex min-h-11 items-center justify-center gap-2 px-4 py-3 text-sm">{s.edit[item.field]}<ChevronRight size={16} aria-hidden="true" /></button>}
    </li>)}</ul>
    {!pending && <>
      <p id={helpId} className="mt-4 text-sm leading-6 text-taupe" role="status">{ready ? s.ready : s.remaining}</p>
      <button type="button" disabled={working || !ready} aria-describedby={helpId} onClick={onSubmit} className="night-button night-button-primary mt-4 min-h-11 w-full px-4 py-3 text-sm disabled:opacity-50">{working ? s.submitting : s.submit}</button>
    </>}
    {error && <p role="alert" className="mt-3 text-sm leading-6 text-blush">{error}</p>}
  </section>;
}
