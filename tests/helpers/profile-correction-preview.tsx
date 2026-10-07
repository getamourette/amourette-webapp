'use client';

// In-memory owner layout fixtures; no edits, notifications or submissions leave
// this mounted component. See scripts/preview-profile-review.mjs.
import { useState } from 'react';
import { ProfileCorrectionPrompt } from '@/components/ProfileCorrectionPrompt';
import type { ReviewField } from '@/lib/profile-review';
import type { Locale } from '@/lib/strings';

export default function Fixture() {
  const [locale, setLocale] = useState<Locale>('en');
  const [updated, setUpdated] = useState<ReviewField[]>([]);
  const [pending, setPending] = useState(false);
  const [opened, setOpened] = useState<ReviewField | null>(null);
  const [canSubmit, setCanSubmit] = useState(true);
  return <main className="night-shell text-cream"><div className="mx-auto w-full max-w-md px-4 py-5">
    <ProfileCorrectionPrompt fields={[{ field: 'first_name', reason: 'misleading_identity' }, { field: 'bio', reason: 'harassment' }, { field: 'photo', reason: 'multiple_people' }]}
      updatedFields={updated} pending={pending} canSubmit={canSubmit} working={false} error={null} locale={locale}
      onEdit={setOpened} />
    <output aria-label="Opened field">{opened}</output>
    <details><summary>Local fixture controls</summary><div className="mt-4 flex flex-wrap gap-3">
      <button type="button" onClick={() => setLocale('en')}>English</button>
      <button type="button" onClick={() => setLocale('fr')}>French</button>
      <button type="button" onClick={() => setLocale('es')}>Spanish</button>
      <button type="button" onClick={() => setCanSubmit(false)}>Server not ready</button>
      <button type="button" onClick={() => setUpdated(['first_name'])}>Save first name</button>
      <button type="button" onClick={() => setUpdated(['first_name', 'bio', 'photo'])}>Save all fields</button>
      <button type="button" onClick={() => setPending(true)}>Submit saved changes</button>
    </div></details>
  </div></main>;
}
