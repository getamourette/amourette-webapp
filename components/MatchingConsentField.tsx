'use client';
import { Dialog } from 'radix-ui';
import { ConfirmationCheckbox } from './ConfirmationCheckbox';
import { MATCHING_CONSENT_WORDING } from '@/lib/matching-consent';
import { matchingConsentStrings } from '@/lib/matching-consent-strings';
import type { Locale } from '@/lib/strings';
import { privacyHref, privacyLabels } from '@/lib/privacy';

export function MatchingConsentInfo({ locale }: { locale: Locale }) {
  const s = matchingConsentStrings[locale];
  return <Dialog.Root><Dialog.Trigger className="min-h-11 text-left text-sm text-taupe underline underline-offset-4">{s.info}</Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-velvet/85" />
      <Dialog.Content className="night-panel fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-3rem)] w-[calc(100%-3rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[2rem] p-6">
        <Dialog.Title className="font-display text-2xl italic text-cream">{s.title}</Dialog.Title>
        <Dialog.Description className="mt-4 text-sm leading-relaxed text-taupe">{s.purpose}</Dialog.Description>
        <p className="mt-4 text-sm leading-relaxed text-taupe">{s.retention}</p>
        <p className="mt-4 text-sm leading-relaxed text-taupe">{s.draft}</p>
        <a href={privacyHref(locale)} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center text-sm text-cream underline">{privacyLabels[locale].title}</a>
        <Dialog.Close className="night-button night-button-secondary mt-4 w-full px-5 py-3">{s.close}</Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
export function MatchingConsentField({ locale, checked, onChange, disabled = false, compact = false }: {
  locale: Locale; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; compact?: boolean;
}) {
  return <div>
    <ConfirmationCheckbox checked={checked} onChange={onChange} disabled={disabled} compact={compact} label={MATCHING_CONSENT_WORDING[locale]} />
    <MatchingConsentInfo locale={locale} />
  </div>;
}
