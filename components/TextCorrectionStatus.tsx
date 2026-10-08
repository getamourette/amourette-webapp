'use client';
import Link from 'next/link';
import type { Locale } from '@/lib/strings';
import type { TextCorrection } from '@/lib/text-moderation';
import { textModerationStrings } from '@/lib/text-moderation-strings';
import { useTextCorrections } from '@/lib/useTextCorrections';

export function TextCorrectionStatus({ rows, locale, href, editor = false }: { rows: TextCorrection[]; locale: Locale; href?: string; editor?: boolean }) {
  const s = textModerationStrings[locale];
  const active = rows.filter(row => row.required || (editor && row.field === 'bio' && row.status === 'approved'));
  if (!active.length) return null;
  return <section role="status" aria-label={s.title} className="night-panel my-4 rounded-2xl p-4" data-testid="text-correction-status">
    {active.map(row => <div key={row.field} className="mb-3 last:mb-0">
      <h2 className="font-semibold">{s[row.field]}</h2>
      {row.required && <p className="mt-1 text-sm">{row.field === 'first_name' ? s.nameHidden : s.bioHidden}</p>}
      {row.reason && <p className="mt-2 text-sm text-champagne">{s.reasons[row.reason]}</p>}
      {row.status && <p className="mt-2 text-sm">{s[row.status]}</p>}
    </div>)}
    {href && <Link href={href} className="night-button night-button-secondary mt-3 inline-flex min-h-11 items-center px-4 py-3">{s.correct}</Link>}
  </section>;
}

export function OwnerTextCorrectionStatus({ owner, locale, href }: { owner: string | null; locale: Locale; href: string }) {
  const corrections = useTextCorrections(owner);
  return <TextCorrectionStatus rows={corrections.rows} locale={locale} href={href} />;
}
