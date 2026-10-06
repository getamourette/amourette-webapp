'use client';

import { useId } from 'react';
import { ChevronRight } from 'lucide-react';
import { REVIEW_FIELDS, reviewReady, type ReviewCorrection, type ReviewField } from '@/lib/profile-review';
import { profileReviewStrings } from '@/lib/profile-review-strings';
import { correctionStrings } from '@/lib/correction-strings';
import type { Locale } from '@/lib/strings';

export function ProfileCorrectionPrompt({ fields, updatedFields, pending, canSubmit, working, error, locale, onEdit }: {
  fields: ReviewCorrection[];
  updatedFields: ReviewField[];
  pending: boolean;
  canSubmit: boolean;
  working: boolean;
  error: string | null;
  locale: Locale;
  onEdit: (field: ReviewField) => void;
}) {
  const titleId = useId();
  const s = profileReviewStrings[locale];
  const c = correctionStrings[locale];
  const requested = REVIEW_FIELDS.flatMap(field => fields.filter(item => item.field === field));
  if (!requested.length) return null;
  const ready = reviewReady(fields, updatedFields, canSubmit);
  return <section className="night-panel my-4 rounded-2xl p-5 text-cream" aria-labelledby={titleId} data-testid="profile-correction-prompt">
    <h2 id={titleId} className="font-display text-xl text-pretty">{pending ? c.waiting : ready ? c.ready : s.title}</h2>
    {!pending && !ready && <p className="mt-2 text-sm">{new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(requested.map(item => c.labels[item.field]))}</p>}
    <p className="mt-2 text-sm leading-6 text-taupe">{pending ? c.sentCopy : ready ? requested.length === 1 ? c.readyCopy : c.readyMany : c.access}</p>
    <button type="button" disabled={working} onClick={() => onEdit(requested.find(item => !updatedFields.includes(item.field))?.field ?? requested[0].field)} className="night-button night-button-secondary mt-3 inline-flex min-h-11 items-center justify-center gap-2 px-4 py-3 text-sm">{pending ? c.viewStatus : ready ? c.summary : c.continue}<ChevronRight size={16} aria-hidden="true" /></button>
    {error && <p role="alert" className="mt-3 text-sm leading-6 text-blush">{error}</p>}
  </section>;
}
