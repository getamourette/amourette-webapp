'use client';
import { useId } from 'react';
import { Dialog } from 'radix-ui';
import { MATCHING_CONSENT_WORDING } from '@/lib/matching-consent';
import { matchingConsentStrings } from '@/lib/matching-consent-strings';
import type { Locale } from '@/lib/strings';

export function MatchingConsentInfo({ locale }: { locale: Locale }) {
  const s = matchingConsentStrings[locale];
  return <Dialog.Root><Dialog.Trigger className="min-h-11 text-left text-sm text-taupe underline underline-offset-4">{s.info}</Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-velvet/85" />
      <Dialog.Content className="night-panel fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-3rem)] w-[calc(100%-3rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[2rem] p-6">
        <Dialog.Title className="font-display text-2xl italic text-cream">{s.title}</Dialog.Title>
        <Dialog.Description className="mt-4 text-sm leading-relaxed text-taupe">{s.purpose}</Dialog.Description>
        <p className="mt-4 text-sm leading-relaxed text-taupe">{s.retention}</p>
        <p className="mt-4 text-sm leading-relaxed text-taupe">{s.draft}</p>
        <a href="/privacy" target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center text-sm text-cream underline">{s.privacy}</a>
        <Dialog.Close className="night-button night-button-secondary mt-4 w-full px-5 py-3">{s.close}</Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
export function MatchingConsentField({ locale, checked, onChange, disabled = false }: {
  locale: Locale; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean;
}) {
  const id = useId();
  return <div>
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-relaxed text-cream">
      <input id={id} type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} disabled={disabled} className="mt-1 h-5 w-5 shrink-0 accent-wine" />
      <span>{MATCHING_CONSENT_WORDING[locale]}</span>
    </label>
    <MatchingConsentInfo locale={locale} />
  </div>;
}
