import type { ReactNode } from 'react';
import { correctionStrings } from '@/lib/correction-strings';
import type { Locale } from '@/lib/strings';

export function RoomCorrectionState({ locale, photoOnly, pending, children, testId = 'room-correction-state' }: {
  locale: Locale; photoOnly: boolean; pending: boolean; children: ReactNode; testId?: string;
}) {
  const c = correctionStrings[locale];
  return <section className="flex h-full flex-col overflow-y-auto px-6 pb-12 pt-36 text-cream" data-testid={testId}>
    <div className="mx-auto my-auto w-full max-w-sm text-center">
      <h2 className="wordmark text-[2.75rem] leading-[1.02]">{c.roomHiddenTitle}</h2>
      <p className="mt-4 leading-relaxed text-taupe">{pending
        ? photoOnly ? c.roomPhotoPending : c.roomProfilePending
        : photoOnly ? c.roomPhotoCorrection : c.roomProfileCorrection}</p>
      {children}
    </div>
  </section>;
}
