'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlignLeft, ArrowLeft, ArrowRight, Camera, Check, Clock3, Heart, ImageUp, LockKeyhole, Send, UserRound } from 'lucide-react';
import { ProfilePhoto } from '@/components/ProfilePhoto';
import { supabase } from '@/lib/supabase';
import { bioValidation, isValidText } from '@/lib/input-validation';
import { nameCorrectionStrings } from '@/lib/name-correction-strings';
import { invalidateParticipant } from '@/lib/participant-refresh';
import { REVIEW_FIELDS, reviewReady, type ReviewField } from '@/lib/profile-review';
import { parseOwnerReview } from '@/lib/profile-review-data';
import { profileReviewStrings } from '@/lib/profile-review-strings';
import { correctionStrings } from '@/lib/correction-strings';
import { photoStrings } from '@/lib/photo-strings';
import { SUPPORTED_LOCALES, isLocale, t, type Locale } from '@/lib/strings';
import { setPreferredLocale } from '@/lib/useLocale';
import type { useProfileReview } from '@/lib/useProfileReview';
import type { useTextCorrections } from '@/lib/useTextCorrections';
import styles from './FocusedCorrections.module.css';

type TextField = 'first_name' | 'bio';

function localizedPhotoError(error: string, locale: Locale) {
  const keys = ['photoTooLarge', 'photoInvalidType', 'photoRejected', 'photoReviewFailed', 'photoCropTooLarge', 'photoUploadFailed'] as const;
  for (const source of SUPPORTED_LOCALES) {
    const key = keys.find(key => t[source].profile[key] === error);
    if (key) return t[locale].profile[key];
    if (t[source].profile.crop.stale === error) return t[locale].profile.crop.stale;
    if (t[source].profile.crop.sourceLoadFailed === error) return t[locale].profile.crop.sourceLoadFailed;
  }
  return error;
}

export function FocusedCorrections({ active, owner, state, textState, locale, firstName, bio, initialField, photo, previewUrl, currentPhoto, photoError, onPhotoChange, onSavePhoto, onAccount, backHref }: {
  active: boolean;
  owner: string; state: ReturnType<typeof useProfileReview>; textState: ReturnType<typeof useTextCorrections>;
  locale: Locale; firstName: string; bio: string; initialField: ReviewField | null;
  photo: File | null; previewUrl: string; currentPhoto?: string; photoError: string;
  onPhotoChange: (event: React.ChangeEvent<HTMLInputElement>) => void; onSavePhoto: () => Promise<boolean>;
  onAccount: () => void; backHref: string;
}) {
  const s = correctionStrings[locale];
  const review = state.review;
  const requested = REVIEW_FIELDS.filter(field => review?.fields.some(item => item.field === field));
  const ready = review ? reviewReady(review.fields, review.updatedFields, review.canSubmit) : false;
  const pending = review?.status === 'needs_review';
  const [selected, setSelected] = useState<ReviewField | null>(initialField);
  const [incomingField, setIncomingField] = useState(initialField);
  if (incomingField !== initialField) {
    setIncomingField(initialField);
    setSelected(initialField);
  }
  const [drafts, setDrafts] = useState<Partial<Record<TextField, string>>>({});
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(false);
  const busy = useRef(false);
  const receipt = useRef<{ cycle: string; field: TextField; text: string; id: string; revision: string } | null>(null);
  const acknowledged = useRef<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const field = !pending ? (selected && requested.includes(selected) ? selected : ready ? null : requested.find(item => !review?.updatedFields.includes(item)) ?? requested[0]) : null;
  const phase = pending ? 'pending' : field ?? 'ready';
  useEffect(() => { if (active) heading.current?.focus({ preventScroll: true }); }, [phase, active]);
  useEffect(() => {
    if (active && review?.notification && acknowledged.current !== review.requestId) {
      acknowledged.current = review.requestId;
      void state.acknowledge();
    }
  }, [active, review, state]);
  const rowFor = (item: TextField) => textState.rows.find(row => row.field === item && row.required);
  const savedText = (item: TextField) => rowFor(item)?.status === 'pending' ? rowFor(item)?.proposed_text ?? '' : item === 'first_name' ? firstName : bio;
  const draft = field && field !== 'photo' ? drafts[field] ?? savedText(field) : '';
  const valid = field === 'photo' ? Boolean(photo || review?.updatedFields.includes('photo')) : field ? isValidText(draft, field === 'first_name' ? 30 : 300, field === 'first_name') : false;
  const blocked = working || state.working;
  const loadingText = field !== 'photo' && (!textState.loaded || textState.error);
  function open(item: ReviewField) { if (!blocked) { setSelected(item); setError(false); } }

  async function save() {
    if (!active || !review || !field || busy.current || !valid || loadingText || pending) return;
    busy.current = true; setWorking(true); setError(false); setSelected(field);
    try {
      // Recheck the active cycle before replacing a saved proposal. The existing
      // RPCs retain ownership, revision and validation enforcement.
      const currentResult = await supabase.rpc('my_profile_review').abortSignal(AbortSignal.timeout(15_000));
      if (currentResult.error) throw currentResult.error;
      const current = parseOwnerReview(currentResult.data, owner);
      if (!current || current.requestId !== review.requestId || current.status !== 'awaiting_changes' || !current.fields.some(item => item.field === field)) throw new Error('Review changed');
      if (field === 'photo') {
        if (photo && !await onSavePhoto()) throw new Error('Photo save failed');
      } else {
        const text = draft.trim();
        let read = await supabase.rpc('my_text_corrections').abortSignal(AbortSignal.timeout(15_000));
        if (read.error) throw read.error;
        let correction = read.data.find(row => row.field === field && row.required);
        if (!correction) throw new Error('Correction changed');
        if (correction.status === 'pending' && (correction.proposed_text ?? '') !== text) {
          if (!correction.request_id) throw new Error('Missing request');
          const cancelled = await supabase.rpc(field === 'first_name' ? 'cancel_name_correction' : 'cancel_bio_correction', { p_request_id: correction.request_id }).abortSignal(AbortSignal.timeout(15_000));
          if (cancelled.error) throw cancelled.error;
          read = await supabase.rpc('my_text_corrections').abortSignal(AbortSignal.timeout(15_000));
          if (read.error) throw read.error;
          correction = read.data.find(row => row.field === field && row.required);
          if (!correction || correction.status === 'pending') throw new Error('Correction changed');
          receipt.current = null;
        }
        if (correction.status !== 'pending') {
          if (!receipt.current || receipt.current.cycle !== review.requestId || receipt.current.field !== field || receipt.current.text !== text) {
            receipt.current = { cycle: review.requestId, field, text, id: crypto.randomUUID(), revision: correction.revision };
          }
          const command = receipt.current;
          const result = field === 'first_name'
            ? await supabase.rpc('submit_name_correction', { p_request_id: command.id, p_proposed_name: text }).abortSignal(AbortSignal.timeout(15_000))
            : await supabase.rpc('submit_bio_correction', { p_request_id: command.id, p_proposed_text: text, p_revision: command.revision }).abortSignal(AbortSignal.timeout(15_000));
          if (result.error?.code === 'PT409') receipt.current = null;
          // A lost response may have committed. Confirm the exact saved value
          // before advancing, while retaining the receipt for a safe retry.
          const confirmed = await supabase.rpc('my_text_corrections').abortSignal(AbortSignal.timeout(15_000));
          if (confirmed.error || !confirmed.data.some(row => row.field === field && row.required && row.status === 'pending' && row.request_id === command.id && (row.proposed_text ?? '') === text)) throw new Error('Save unconfirmed');
        }
        setDrafts(previous => ({ ...previous, [field]: text }));
      }
      invalidateParticipant();
      await textState.refresh();
      const confirmed = await state.reconcile();
      if (!confirmed || confirmed.requestId !== review.requestId || !confirmed.updatedFields.includes(field)) throw new Error('Save unconfirmed');
      receipt.current = null;
      setSelected(null);
    } catch { setError(true); invalidateParticipant(); void textState.refresh(); void state.refresh(); }
    finally { busy.current = false; setWorking(false); }
  }

  if (!review) return null;
  const index = field ? requested.indexOf(field) : -1;
  const reason = review.fields.find(item => item.field === field);
  const reasonText = reason ? reason.field === 'photo' ? reason.reason === 'legacy_unknown' ? profileReviewStrings[locale].legacyPhotoReason : photoStrings[locale].reasons[reason.reason] : profileReviewStrings[locale].reasons[reason.reason] : '';
  return <section className={styles.shell} lang={locale} data-testid="focused-corrections" aria-busy={blocked}>
    <div className={styles.phone}>
      <header className={styles.header}>
        <Link href={backHref} className={styles.logo} aria-label="Amourette">AMOURETTE</Link>
        <select className={styles.language} aria-label={s.language} value={locale} onChange={event => { if (isLocale(event.target.value)) setPreferredLocale(event.target.value); }}>
          {SUPPORTED_LOCALES.map(item => <option key={item} value={item}>{item.toUpperCase()}</option>)}
        </select>
      </header>
      <div className={styles.main}>
        {pending ? <>
          <div className={styles.waitMark}><Heart size={24} aria-hidden="true" /></div>
          <p className={styles.status}><Clock3 size={16} aria-hidden="true" />{s.waiting}</p>
          <h1 ref={heading} tabIndex={-1}>{s.sentTitle}</h1>
          <p className={styles.sub}>{s.sentCopy}</p>
          <div className={styles.received}><Check size={16} aria-hidden="true" /><p>{s.received(requested.length)}</p></div>
        </> : field ? <>
          {requested.length > 1 && <div className={styles.step}><span>{s.step(index + 1, requested.length)}</span><div className={styles.track} aria-hidden="true">{requested.map(item => <span key={item} className={`${styles.dot} ${item === field ? styles.current : review.updatedFields.includes(item) ? styles.complete : ''}`} />)}</div></div>}
          <p className={styles.status}><Heart size={16} aria-hidden="true" />{s.status}</p>
          <h1 ref={heading} tabIndex={-1}>{s.titles[field]}</h1>
          {requested.length === 1 && <p className={styles.sub}>{s.one}</p>}
          <div className={styles.reason} id="correction-reason"><span className={styles.reasonLabel}>{s.why}</span>{reasonText}</div>
          <form onSubmit={event => { event.preventDefault(); void save(); }}>
            {field === 'photo' ? <>
              <div className={styles.photo}>{previewUrl || currentPhoto ? <ProfilePhoto src={previewUrl || currentPhoto} alt={s.newPhoto} /> : <><ImageUp size={24} aria-hidden="true" /><span>{s.newPhoto}</span></>}</div>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onPhotoChange} />
              <button className={styles.choose} type="button" disabled={blocked} onClick={() => fileInput.current?.click()}>{s.choose}</button>
            </> : <>
              <label className={styles.label} htmlFor="focused-correction-input">{s.labels[field]}</label>
              {field === 'first_name' ? <input id="focused-correction-input" className={styles.input} autoComplete="given-name" value={draft} disabled={blocked || loadingText} aria-describedby="correction-reason correction-count" aria-invalid={!valid} onChange={event => { setDrafts(previous => ({ ...previous, first_name: event.target.value })); setError(false); }} /> :
                <textarea id="focused-correction-input" className={styles.input} value={draft} disabled={blocked || loadingText} aria-describedby="correction-reason correction-count" aria-invalid={!valid} onChange={event => { setDrafts(previous => ({ ...previous, bio: event.target.value })); setError(false); }} />}
              <p className={styles.count} id="correction-count">{Array.from(draft.trim()).length} / {field === 'first_name' ? 30 : 300}</p>
              {!valid && draft.length > 0 && <p className={styles.error} role="alert">{field === 'first_name' ? nameCorrectionStrings[locale].invalid : bioValidation(draft) === 'invalid' ? t[locale].profile.bioInvalid : t[locale].profile.bioTooLong}</p>}
              {loadingText && <p className={styles.sub}>{textState.error ? profileReviewStrings[locale].error : s.loading}</p>}
              {textState.error && <button type="button" className={styles.textAction} onClick={() => void textState.refresh()}>{s.retry}</button>}
            </>}
            {(error || field === 'photo' && photoError) && <p role="alert" className={styles.error}>{field === 'photo' && photoError ? localizedPhotoError(photoError, locale) : s.error}</p>}
            <button type="submit" className={styles.primary} disabled={blocked || !valid || loadingText}>{working ? s.saving : error ? s.retry : requested.some(item => item !== field && !review.updatedFields.includes(item)) ? s.next : s.save[field]}<ArrowRight size={16} aria-hidden="true" /></button>
            <p className={styles.hint}>{s.hint}</p>
          </form>
          {index > 0 && <button type="button" className={styles.back} disabled={blocked} onClick={() => open(requested[index - 1])}><ArrowLeft size={16} aria-hidden="true" />{s.back}</button>}
        </> : <>
          <p className={`${styles.status} ${styles.saved}`}><Check size={16} aria-hidden="true" />{requested.length === 1 ? s.saved : s.savedMany}</p>
          <h1 ref={heading} tabIndex={-1}>{s.ready}</h1>
          <p className={styles.sub}>{requested.length === 1 ? s.readyCopy : s.readyMany}</p>
          <div className={styles.summary}>{requested.map(item => {
            const Icon = item === 'first_name' ? UserRound : item === 'bio' ? AlignLeft : Camera;
            return <div className={styles.row} key={item}><Icon size={16} aria-hidden="true" /><div className={styles.copy}><span className={styles.summaryLabel}>{s.labels[item]}</span><span className={styles.value}>{item === 'photo' ? s.photoSaved : textState.loaded && !textState.error ? savedText(item) || s.emptyBio : s.loading}</span></div><button type="button" className={styles.textAction} disabled={blocked} aria-label={`${s.edit} ${s.labels[item]}`} onClick={() => open(item)}>{s.edit}</button></div>;
          })}</div>
          <button type="button" className={styles.primary} disabled={blocked || !ready} onClick={() => void state.submit()}>{state.working ? profileReviewStrings[locale].submitting : s.submit}<Send size={16} aria-hidden="true" /></button>
          <p className={styles.hint}>{s.readyHint}</p>
          {textState.error && <p className={styles.error} role="alert">{profileReviewStrings[locale].error} <button type="button" className={styles.textAction} onClick={() => void textState.refresh()}>{s.retry}</button></p>}
        </>}
        {state.error && <p role="alert" className={styles.error}>{profileReviewStrings[locale].error} <button type="button" className={styles.textAction} disabled={blocked} onClick={() => { void state.refresh(); if (review.notification) void state.acknowledge(); }}>{profileReviewStrings[locale].retry}</button></p>}
      </div>
      <footer className={styles.footer}><p className={styles.access}><LockKeyhole size={14} aria-hidden="true" /><span>{s.access}</span></p><nav className={styles.navigation}><Link className={styles.textAction} href={backHref}>{s.return}</Link><button type="button" className={styles.textAction} disabled={blocked} onClick={onAccount}>{s.account}</button></nav></footer>
    </div>
  </section>;
}
