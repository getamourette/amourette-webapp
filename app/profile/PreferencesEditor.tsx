"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertDialog } from 'radix-ui';
import { supabase } from '@/lib/supabase';
import { t, type Locale } from '@/lib/strings';
import { profileEditStrings } from '@/lib/profile-edit-strings';
import { cooldownActive, parsePreferenceResult, parseProfileEditState, restrictedPreferenceChange,
  samePreferences, type PreferenceValues, type ProfileEditState } from '@/lib/profile-edit';
import { Segmented, genderOptions } from './fields';

type EditorState = {
  server: ProfileEditState | null;
  baseline: ProfileEditState | null;
  draft: PreferenceValues | null;
  verified: boolean;
  notice: 'saved' | 'cooldown' | 'error' | null;
};

export function PreferencesEditor({ locale, disabled, onDirtyChange, onBusyChange }: {
  locale: Locale; disabled: boolean;
  onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void;
}) {
  const s = profileEditStrings[locale];
  const labels = t[locale].genders;
  const [editor, setEditor] = useState<EditorState>({ server: null, baseline: null, draft: null, verified: false, notice: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState<number | null>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const receivedAt = useRef(0);
  const busy = useRef(false);
  const mounted = useRef(false);
  const uncertain = useRef<PreferenceValues | null>(null);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_my_profile_edit_state').single();
      if (error) throw error;
      const server = parseProfileEditState(data);
      receivedAt.current = performance.now();
      if (!mounted.current) return;
      const recovered = uncertain.current && samePreferences(server, uncertain.current);
      uncertain.current = null;
      setEditor(previous => ({
        server, baseline: recovered || !previous.baseline ? server : previous.baseline,
        draft: previous.draft ?? server, verified: true, notice: recovered ? 'saved' : null,
      }));
    } catch {
      if (mounted.current) setEditor(previous => ({ ...previous, verified: false, notice: 'error' }));
    } finally {
      busy.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const foreground = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', foreground);
    window.addEventListener('online', foreground);
    document.addEventListener('visibilitychange', foreground);
    return () => {
      mounted.current = false;
      window.removeEventListener('focus', foreground);
      window.removeEventListener('online', foreground);
      document.removeEventListener('visibilitychange', foreground);
    };
  }, [refresh]);

  useEffect(() => {
    const server = editor.server;
    if (!server || !cooldownActive(server)) return;
    // Unlock only after a fresh server response, never on the device clock alone.
    const timer = window.setTimeout(() => void refresh(), Math.max(1,
      Date.parse(server.available_at!) - Date.parse(server.server_now)));
    return () => window.clearTimeout(timer);
  }, [editor.server, refresh]);

  const { server, baseline, draft, verified, notice } = editor;
  const dirty = Boolean(draft && baseline && !samePreferences(draft, baseline));
  const conflict = Boolean(server && baseline && server.version !== baseline.version);
  const locked = Boolean(server && cooldownActive(server));
  const unavailable = disabled || loading || saving || !verified || conflict;
  const restricted = Boolean(server && draft && restrictedPreferenceChange(server, draft));
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => onBusyChange(saving), [saving, onBusyChange]);

  const date = (value: string | number) => new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value));

  async function save() {
    if (!server || !baseline || !draft || unavailable || busy.current || (locked && restricted)) return;
    const target = draft;
    busy.current = true;
    setSaving(true);
    setEditor(previous => ({ ...previous, notice: null }));
    try {
      const { data, error } = await supabase.rpc('update_my_profile_preferences', {
        p_gender: target.gender, p_interested_in: target.interested_in, p_expected_version: baseline.version,
      }).single();
      if (error) throw error;
      const result = parsePreferenceResult(data);
      receivedAt.current = performance.now();
      if (!mounted.current) return;
      const accepted = result.status === 'saved' || result.status === 'unchanged';
      setEditor(previous => ({ ...previous, server: result.state, verified: true,
        baseline: accepted ? result.state : previous.baseline,
        notice: accepted ? 'saved' : result.status === 'cooldown' ? 'cooldown' : null,
      }));
    } catch {
      uncertain.current = target;
      if (mounted.current) setEditor(previous => ({ ...previous, verified: false, notice: 'error' }));
    } finally {
      busy.current = false;
      if (mounted.current) {
        setSaving(false);
        if (uncertain.current) await refresh();
      }
    }
  }

  return <section className="night-panel mt-4 rounded-[2rem] p-6 sm:p-7" aria-labelledby="profile-preferences-heading">
    <h2 ref={heading} tabIndex={-1} id="profile-preferences-heading" className="night-kicker">{s.preferences}</h2>
    {draft && <>
      <p className="mt-5 text-sm text-taupe">{t[locale].profile.iAm}</p>
      <div className="mt-2"><Segmented layout="inline" options={genderOptions(labels)}
        ariaLabel={t[locale].profile.iAm} isOn={gender => draft.gender === gender}
        isDisabled={gender => unavailable || (locked && gender !== server?.gender)}
        onToggle={gender => setEditor(previous => ({ ...previous, draft: { ...draft, gender }, notice: null }))} /></div>
      <p className="mt-5 text-sm text-taupe">{t[locale].profile.iWantToMeet}</p>
      <div className="mt-2"><Segmented layout="inline" options={genderOptions(labels)}
        ariaLabel={t[locale].profile.iWantToMeet} isOn={gender => draft.interested_in.includes(gender)}
        isDisabled={gender => unavailable ||
          (draft.interested_in.includes(gender) ? draft.interested_in.length === 1 : locked && !server?.interested_in.includes(gender))}
        onToggle={gender => setEditor(previous => ({ ...previous, notice: null, draft: { ...draft,
          interested_in: draft.interested_in.includes(gender) ? draft.interested_in.filter(item => item !== gender) : [...draft.interested_in, gender],
        } }))} /></div>
    </>}
    <div aria-live="polite" aria-atomic="true" className="mt-4 space-y-3 text-sm leading-relaxed text-taupe">
      {loading && <p>{s.loading}</p>}
      {locked && server?.available_at && <p>{s.until} <time dateTime={server.available_at}>{date(server.available_at)}</time>. {s.narrowing}</p>}
      {conflict && <p>{s.conflict}</p>}
      {notice && <p role={notice === 'error' || notice === 'cooldown' ? 'alert' : 'status'}>{s[notice]}</p>}
    </div>
    {conflict && <button type="button" disabled={loading || saving || !verified} className="night-button night-button-secondary mt-4 w-full px-4 py-3 disabled:opacity-50"
      onClick={() => {
        setEditor(previous => ({ ...previous, baseline: previous.server, draft: previous.server, notice: null }));
        heading.current?.focus();
      }}>{s.adopt}</button>}
    {!verified && !loading && <button type="button" onClick={() => void refresh()} className="night-button night-button-secondary mt-4 w-full px-4 py-3">{s.retry}</button>}
    <button ref={saveButton} type="button" disabled={unavailable || !dirty || (locked && restricted)}
      className="night-button night-button-primary mt-5 w-full px-5 py-4 disabled:cursor-not-allowed disabled:opacity-50"
      onClick={() => restricted ? setConfirmation(Date.parse(server!.server_now) + performance.now() - receivedAt.current + 12 * 60 * 60 * 1000) : void save()}>{saving ? s.saving : s.save}</button>

    <AlertDialog.Root open={confirmation !== null} onOpenChange={open => { if (!open) setConfirmation(null); }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-velvet/85" />
        <AlertDialog.Content className="night-panel fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-3rem)] w-[calc(100%-3rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[2rem] p-6"
          onCloseAutoFocus={event => {
            event.preventDefault();
            if (saveButton.current?.disabled) heading.current?.focus();
            else saveButton.current?.focus();
          }}>
          <AlertDialog.Title className="font-display text-2xl italic text-cream">{s.confirm}</AlertDialog.Title>
          <AlertDialog.Description className="mt-3 text-sm leading-relaxed text-taupe">{s.warning}</AlertDialog.Description>
          {draft && <p className="mt-4 text-sm text-cream">{t[locale].profile.iAm}: {labels[draft.gender]}<br />
            {t[locale].profile.iWantToMeet}: {draft.interested_in.map(gender => labels[gender]).join(', ')}</p>}
          <p className="mt-4 text-sm text-taupe">{s.indicative} {confirmation !== null && date(confirmation)}.</p>
          {conflict && <p role="alert" className="mt-4 text-sm text-blush">{s.conflict}</p>}
          {!verified && <p role="alert" className="mt-4 text-sm text-blush">{s.error}</p>}
          <div className="mt-6 flex flex-col gap-3">
            <AlertDialog.Action disabled={unavailable || (locked && restricted)} onClick={() => void save()} className="night-button night-button-primary px-5 py-4 disabled:opacity-50">{s.save}</AlertDialog.Action>
            <AlertDialog.Cancel className="night-button night-button-secondary px-5 py-4">{s.cancel}</AlertDialog.Cancel>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  </section>;
}
