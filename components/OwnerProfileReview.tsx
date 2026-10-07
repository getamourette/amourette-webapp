'use client';
import { useRouter } from 'next/navigation';
import type { Locale } from '@/lib/strings';
import type { ReviewField } from '@/lib/profile-review';
import { useProfileReview } from '@/lib/useProfileReview';
import { profileReviewStrings } from '@/lib/profile-review-strings';
import { ProfileCorrectionPrompt } from './ProfileCorrectionPrompt';
import { OwnerTextCorrectionStatus } from './TextCorrectionStatus';

// Share one localized prompt across profile, arrival, room and existing chats.
export function OwnerProfileReview({ state, locale, href = '/profile?edit=1', onEdit, showNotice = true }: {
  state: ReturnType<typeof useProfileReview>; locale: Locale; href?: string; onEdit?: (field: ReviewField) => void; showNotice?: boolean;
}) {
  const router = useRouter();
  const s = profileReviewStrings[locale];
  if (!state.review) return state.error ? <p role="alert" className="night-panel my-4 rounded-xl p-4 text-sm">{s.error} <button type="button" className="min-h-11 underline" onClick={() => void state.refresh()}>{s.retry}</button></p> : null;
  return <ProfileCorrectionPrompt fields={state.review.fields} updatedFields={state.review.updatedFields}
    pending={state.review.status === 'needs_review'} canSubmit={state.review.canSubmit}
    working={state.working} error={state.error ? s.error : null} locale={locale}
    notification={showNotice && state.review.notification} onDismiss={() => void state.acknowledge()}
    onEdit={field => {
      void state.acknowledge().then(() => {
        if (onEdit) onEdit(field);
        else router.push(`${href}&correction=1`);
      });
    }} />;
}

export function OwnerProfileReviewStatus({ owner, locale, href }: { owner: string | null; locale: Locale; href: string }) {
  const state = useProfileReview(owner);
  return <><OwnerProfileReview state={state} locale={locale} href={href} />
    {state.loaded && !state.review && !state.error && <OwnerTextCorrectionStatus owner={owner} locale={locale} href={href} />}</>;
}
