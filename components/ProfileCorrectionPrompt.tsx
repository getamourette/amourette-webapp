'use client';

import { useId } from 'react';
import { ChevronRight } from 'lucide-react';
import { REVIEW_FIELDS, type ReviewCorrection, type ReviewField } from '@/lib/profile-review';
import { correctionStrings } from '@/lib/correction-strings';
import type { Locale } from '@/lib/strings';
import { ProfileCorrectionNotice } from './ProfileCorrectionNotice';
import { RoomCorrectionState } from './RoomCorrectionState';

export function ProfileCorrectionPrompt({ fields, pending, working, error, locale, onEdit, notification = false, onDismiss, variant = 'compact' }: {
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
  variant?: 'compact' | 'room';
}) {
  const titleId = useId();
  const c = correctionStrings[locale];
  const requested = REVIEW_FIELDS.flatMap(field => fields.filter(item => item.field === field));
  const photoOnly = requested.length === 1 && requested[0].field === 'photo';
  if (!requested.length) return null;
  const action = <button type="button" disabled={working} onClick={() => onEdit(requested[0].field)} className={`night-button ${variant === 'room' && !pending ? 'night-button-primary' : 'night-button-secondary'} ${variant === 'room' ? 'mt-8' : 'mt-3'} inline-flex min-h-11 items-center justify-center gap-2 px-4 py-3 text-sm`}>{pending ? c.viewStatus : photoOnly ? c.modifyPhoto : c.modify}<ChevronRight size={16} aria-hidden="true" /></button>;
  const failure = error && <p role="alert" className="mt-3 text-sm leading-6 text-blush">{error}</p>;
  return <>{variant === 'room' ? <RoomCorrectionState locale={locale} photoOnly={photoOnly} pending={pending} testId="profile-correction-prompt">
    {action}{failure}
  </RoomCorrectionState> : <section className="night-panel my-4 rounded-2xl px-4 py-3 text-cream" aria-labelledby={titleId} data-testid="profile-correction-prompt">
    <p id={titleId} className="text-sm leading-6">{pending ? c.pending : photoOnly ? c.photoCorrection : c.profileCorrection}</p>
    {action}{failure}
  </section>}{!pending && notification && <ProfileCorrectionNotice fields={fields} locale={locale} working={working}
    onEdit={() => onEdit(requested[0].field)} onClose={() => onDismiss?.()} />}</>;
}
