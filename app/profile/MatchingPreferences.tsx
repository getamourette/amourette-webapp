'use client';
import { useEffect, useRef, useState } from 'react';
import { AlertDialog } from 'radix-ui';
import { supabase } from '@/lib/supabase';
import { useMatchingConsent } from '@/lib/useMatchingConsent';
import { MATCHING_CONSENT_VERSION, parseMatchingConsentState, type MatchingConsentState } from '@/lib/matching-consent';
import { matchingConsentStrings } from '@/lib/matching-consent-strings';
import { invalidatePhotos } from '@/lib/photo-refresh';
import { type Gender } from '@/lib/profile';
import { t, type Locale } from '@/lib/strings';
import { MatchingConsentField, MatchingConsentInfo } from '@/components/MatchingConsentField';
import { PreferencesEditor } from './PreferencesEditor';
import { Segmented, genderOptions } from './fields';

export function MatchingPreferences({ userId, locale, disabled, onDirtyChange, onBusyChange }: {
  userId: string; locale: Locale; disabled: boolean;
  onDirtyChange: (value: boolean) => void; onBusyChange: (value: boolean) => void;
}) {
  const consent = useMatchingConsent(userId);
  const s = matchingConsentStrings[locale];
  return <>
    {!consent.state && <section className="night-panel mt-4 rounded-[2rem] p-6" aria-live="polite">
      <p>{consent.loading ? s.loading : s.error}</p>
      {!consent.loading && <button className="night-button mt-4 px-4 py-3" onClick={() => void consent.refresh()}>{s.retry}</button>}
    </section>}
    {consent.state && <ConsentControls key={`${userId}:${consent.state.revision}`}
      state={consent.state} locale={locale} disabled={disabled} verified={consent.verified}
      loading={consent.loading} refresh={consent.refresh} adopt={consent.adopt} onDirtyChange={onDirtyChange} onBusyChange={onBusyChange} />}
  </>;
}

function ConsentControls({ state, locale, disabled, verified, loading, refresh, adopt, onDirtyChange, onBusyChange }: {
  state: MatchingConsentState; locale: Locale; disabled: boolean; verified: boolean; loading: boolean;
  refresh: () => Promise<void>; onDirtyChange: (value: boolean) => void; onBusyChange: (value: boolean) => void;
  adopt: (state: MatchingConsentState) => void;
}) {
  const s = matchingConsentStrings[locale];
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<'error' | 'stale' | null>(null);
  const [gender, setGender] = useState<Gender | ''>('');
  const [interests, setInterests] = useState<Gender[]>([]);
  const [agreementLocale, setAgreementLocale] = useState<Locale | null>(null);
  const checked = agreementLocale === locale;
  const requestId = useRef<string | null>(null);
  const busy = useRef(false);
  const [preferencesBusy, setPreferencesBusy] = useState(false);
  const unavailable = disabled || saving || !verified;
  const locked = state.available_at !== null && Date.parse(state.server_now) < Date.parse(state.available_at);
  useEffect(() => { onBusyChange(saving || preferencesBusy); }, [saving, preferencesBusy, onBusyChange]);
  useEffect(() => {
    if (!state.active) onDirtyChange(gender !== '' || interests.length > 0 || checked);
  }, [state.active, gender, interests, checked, onDirtyChange]);
  useEffect(() => () => { onDirtyChange(false); onBusyChange(false); }, [onDirtyChange, onBusyChange]);
  useEffect(() => {
    if (!locked || !state.available_at) return;
    const timer = window.setTimeout(() => void refresh(), Math.max(1, Date.parse(state.available_at) - Date.parse(state.server_now)));
    return () => window.clearTimeout(timer);
  }, [state.available_at, state.server_now, locked, refresh]);

  async function submit(withdraw: boolean) {
    if (busy.current || unavailable || (withdraw && !state.revision) || (!withdraw && (!checked || !gender || !interests.length || locked))) return;
    busy.current = true; setSaving(true); setNotice(null);
    try {
      const result = withdraw
        ? await supabase.rpc('withdraw_my_matching_consent', { p_expected_revision: state.revision! }).single()
        : await supabase.rpc('grant_my_matching_consent', {
          p_consent: checked, p_version: MATCHING_CONSENT_VERSION, p_locale: locale,
          p_gender: gender, p_interested_in: interests, p_expected_revision: state.revision,
          p_request_id: requestId.current ?? (requestId.current = crypto.randomUUID()),
        }).single();
      if (result.error) throw result.error;
      const next = parseMatchingConsentState(result.data);
      if (!['saved', 'unchanged', 'stale', 'cooldown'].includes(result.data.status)) throw new Error('Invalid consent result');
      adopt(next);
      if (result.data.status === 'stale') setNotice('stale');
      invalidatePhotos();
      await refresh();
    } catch { setNotice('error'); await refresh(); }
    finally { busy.current = false; setSaving(false); setConfirm(false); }
  }

  return <>
    {state.active && <PreferencesEditor locale={locale} disabled={disabled || saving || !verified}
      onDirtyChange={onDirtyChange} onBusyChange={setPreferencesBusy} />}
    <section className="night-panel mt-4 rounded-[2rem] p-6 sm:p-7" aria-labelledby="matching-consent-heading">
      <h2 id="matching-consent-heading" className="night-kicker">{s.title}</h2>
      <p className="mt-4 text-sm leading-relaxed text-taupe">{state.active ? s.active : s.inactive}</p>
      {state.active ? <>
        <MatchingConsentInfo locale={locale} />
        <button type="button" disabled={unavailable || preferencesBusy} onClick={() => setConfirm(true)}
          className="night-button night-button-secondary mt-3 w-full px-4 py-3 disabled:opacity-50">{s.withdraw}</button>
      </> : <>
        <p className="mt-4 text-sm leading-relaxed text-taupe">{s.choose}</p>
        {locked && state.available_at && <p role="status" className="mt-4 text-sm text-taupe">{s.cooldown} <time dateTime={state.available_at}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(state.available_at))}</time>.</p>}
        <p className="mt-4 text-sm text-taupe">{t[locale].profile.iAm}</p>
        <div className="mt-2"><Segmented layout="inline" options={genderOptions(t[locale].genders)} ariaLabel={t[locale].profile.iAm}
          isOn={value => value === gender} isDisabled={() => unavailable || locked} onToggle={setGender} /></div>
        <p className="mt-4 text-sm text-taupe">{t[locale].profile.iWantToMeet}</p>
        <div className="mt-2"><Segmented layout="inline" options={genderOptions(t[locale].genders)} ariaLabel={t[locale].profile.iWantToMeet}
          isOn={value => interests.includes(value)} isDisabled={() => unavailable || locked}
          onToggle={value => setInterests(current => current.includes(value) ? current.filter(g => g !== value) : [...current, value])} /></div>
        <div className="mt-5"><MatchingConsentField locale={locale} checked={checked} onChange={value => setAgreementLocale(value ? locale : null)} disabled={unavailable || locked} /></div>
        <button type="button" disabled={unavailable || locked || !checked || !gender || !interests.length} onClick={() => void submit(false)}
          className="night-button night-button-primary mt-4 w-full px-4 py-3 disabled:opacity-50">{saving ? s.saving : s.grant}</button>
      </>}
      {loading && <p role="status" className="mt-3 text-sm text-taupe">{s.loading}</p>}
      {(!verified && !loading || notice) && <p role="alert" className="mt-3 text-sm text-blush">{s[notice ?? 'error']}</p>}
      {!verified && !loading && <button className="night-button mt-3 px-4 py-3" onClick={() => void refresh()}>{s.retry}</button>}
      <AlertDialog.Root open={confirm} onOpenChange={setConfirm}><AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-velvet/85" />
        <AlertDialog.Content className="night-panel fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-3rem)] w-[calc(100%-3rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[2rem] p-6">
          <AlertDialog.Title className="font-display text-2xl italic text-cream">{s.confirm}</AlertDialog.Title>
          <AlertDialog.Description className="mt-4 text-sm leading-relaxed text-taupe">{s.effect}</AlertDialog.Description>
          <AlertDialog.Action disabled={unavailable} onClick={event => { event.preventDefault(); void submit(true); }} className="night-button night-button-primary mt-6 w-full px-4 py-3 disabled:opacity-50">{saving ? s.saving : s.withdraw}</AlertDialog.Action>
          <AlertDialog.Cancel disabled={saving} className="night-button night-button-secondary mt-3 w-full px-4 py-3">{s.cancel}</AlertDialog.Cancel>
        </AlertDialog.Content>
      </AlertDialog.Portal></AlertDialog.Root>
    </section>
  </>;
}
