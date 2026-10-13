'use client';

import { useEffect, useId, useRef } from 'react';
import { ChevronRight } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { correctionStrings } from '@/lib/correction-strings';
import { profileReviewStrings } from '@/lib/profile-review-strings';
import { photoStrings } from '@/lib/photo-strings';
import { REVIEW_FIELDS, type ReviewCorrection } from '@/lib/profile-review';
import type { Locale } from '@/lib/strings';

export function correctionReason(item: ReviewCorrection, locale: Locale) {
  return item.field === 'photo'
    ? item.reason === 'legacy_unknown' ? profileReviewStrings[locale].legacyPhotoReason : photoStrings[locale].reasons[item.reason]
    : profileReviewStrings[locale].reasons[item.reason];
}

export function ProfileCorrectionNotice({ fields, locale, working, onEdit, onClose }: {
  fields: ReviewCorrection[]; locale: Locale; working: boolean; onEdit: () => void; onClose: () => void;
}) {
  const s = correctionStrings[locale];
  const titleId = useId();
  const action = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    action.current?.focus({ preventScroll: true });
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <Modal onClose={onClose} dismissable={!working} showClose={false} labelledById={titleId}
    overlayClassName="overflow-y-auto py-6" panelClassName="my-auto max-w-sm">
    <div lang={locale} onKeyDown={event => {
      if (event.key === 'Tab') { event.preventDefault(); action.current?.focus(); }
    }}>
      <p className="night-kicker mb-3 !tracking-[0.16em]">{s.reviewed}</p>
      <h2 id={titleId} className="font-display text-3xl leading-tight text-cream">{s.rejected}</h2>
      <p className="mt-3 text-sm leading-6 text-taupe">{s.notice}</p>
      <div className="mt-5">{REVIEW_FIELDS.flatMap(field => fields.filter(item => item.field === field)).map(item =>
        <div key={item.field} className="border-t border-champagne/20 py-3">
          <p className="text-sm text-cream">{s.labels[item.field]}</p>
          <p className="mt-1 text-[13px] leading-5 text-taupe">{correctionReason(item, locale)}</p>
        </div>)}</div>
      <p className="my-4 text-xs leading-5 text-taupe">{s.readyHint}</p>
      <button ref={action} type="button" disabled={working} onClick={onEdit}
        className="night-button night-button-secondary flex min-h-12 w-full items-center justify-center gap-3 px-4 py-3 text-xs focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blush">
        {s.modify}<ChevronRight size={18} aria-hidden="true" />
      </button>
    </div>
  </Modal>;
}
