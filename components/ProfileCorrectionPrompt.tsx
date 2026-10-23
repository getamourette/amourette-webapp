'use client';

import { useId } from 'react';
import { ChevronRight } from 'lucide-react';
import { REVIEW_FIELDS, type ReviewCorrection, type ReviewField } from '@/lib/profile-review';
import { correctionStrings } from '@/lib/correction-strings';
import type { Locale } from '@/lib/strings';
import { ProfileCorrectionNotice } from './ProfileCorrectionNotice';

export function ProfileCorrectionPrompt({ fields, pending, working, error, locale, onEdit, notification = false, onDismiss }: {
  fields: ReviewCorrection[];
  updatedFields: ReviewField[];
  pending: boolean;
  canSubmit: boolean;
  working: boolean;
  error: string | null;
  locale: Locale;
  onEdit: (field: ReviewField) => void;
  notification?: boolean;
  onDismiss?: () => void;
}) {
  const titleId = useId();
  const c = correctionStrings[locale];
  const requested = REVIEW_FIELDS.flatMap(field => fields.filter(item => item.field === field));
  const photoOnly = requested.length === 1 && requested[0].field === 'photo';
  if (!requested.length) return null;
  return <><section className="night-panel my-4 rounded-2xl px-4 py-3 text-cream" aria-labelledby={titleId} data-testid="profile-correction-prompt">
    <p id={titleId} className="text-sm leading-6">{pending ? c.pending : photoOnly ? c.photoCorrection : c.profileCorrection}</p>
    <button type="button" disabled={working} onClick={() => onEdit(requested[0].field)} className="night-button night-button-secondary mt-3 inline-flex min-h-11 items-center justify-center gap-2 px-4 py-3 text-sm">{pending ? c.viewStatus : photoOnly ? c.modifyPhoto : c.modify}<ChevronRight size={16} aria-hidden="true" /></button>
    {error && <p role="alert" className="mt-3 text-sm leading-6 text-blush">{error}</p>}
  </section>{!pending && notification && <ProfileCorrectionNotice fields={fields} locale={locale} working={working}
    onEdit={() => onEdit(requested[0].field)} onClose={() => onDismiss?.()} />}</>;
}
