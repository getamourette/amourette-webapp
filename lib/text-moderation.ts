import type { Locale } from './strings';

export const TEXT_REASONS = ['sexual', 'hateful', 'harassment', 'misleading_identity', 'inappropriate'] as const;
export type TextReason = typeof TEXT_REASONS[number];
export type TextField = 'first_name' | 'bio';
export type TextCorrection = {
  field: TextField;
  revision: string;
  required: boolean;
  reason: TextReason | null;
  request_id: string | null;
  proposed_text: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | null;
};
export type TextReview = TextCorrection & {
  profile_id: string;
  first_name: string | null;
  published_text: string | null;
  rejected_text: string | null;
};
export function publishedName(name: string | null, locale: Locale): string {
  return name ?? ({ en: 'Participant', fr: 'Participant', es: 'Participante' }[locale]);
}
