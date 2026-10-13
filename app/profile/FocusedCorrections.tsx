'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronRight, Clock3, ImageUp, LockKeyhole } from 'lucide-react';
import { BrandLogo } from '@/app/BrandLogo';
import { ProfilePhoto } from '@/components/ProfilePhoto';
import { ProfileCorrectionNotice, correctionReason } from '@/components/ProfileCorrectionNotice';
import { supabase } from '@/lib/supabase';
import { bioValidation, isValidText } from '@/lib/input-validation';
import { nameCorrectionStrings } from '@/lib/name-correction-strings';
import { invalidateParticipant } from '@/lib/participant-refresh';
import { REVIEW_FIELDS, reviewReady, type ReviewField } from '@/lib/profile-review';
import { parseOwnerReview } from '@/lib/profile-review-data';
import { profileReviewStrings } from '@/lib/profile-review-strings';
import { correctionStrings } from '@/lib/correction-strings';
import { SUPPORTED_LOCALES, t, type Locale } from '@/lib/strings';
import { PHOTO_ACCEPT } from '@/lib/heic';
import type { useProfileReview } from '@/lib/useProfileReview';
import type { useTextCorrections } from '@/lib/useTextCorrections';
import styles from './FocusedCorrections.module.css';

type TextField = 'first_name' | 'bio';
type Receipt = { text: string; id: string; revision: string };

function localizedPhotoError(error: string, locale: Locale) {
  const keys = ['photoTooLarge', 'photoInvalidType', 'photoRejected', 'photoReviewFailed', 'photoCropTooLarge', 'photoUploadFailed', 'photoHeicUnsupported', 'photoHeicTooLarge', 'photoPrepareFailed'] as const;
  for (const source of SUPPORTED_LOCALES) {
    const key = keys.find(key => t[source].profile[key] === error);
    if (key) return t[locale].profile[key];
    if (t[source].profile.crop.stale === error) return t[locale].profile.crop.stale;
    if (t[source].profile.crop.sourceLoadFailed === error) return t[locale].profile.crop.sourceLoadFailed;
  }
  return error;
}

export function FocusedCorrections({ active, owner, state, textState, locale, firstName, bio, initialField, photo, previewUrl, currentPhoto, photoError, onPhotoChange, onSavePhoto, onAccount, backHref }: {
  active: boolean; owner: string; state: ReturnType<typeof useProfileReview>; textState: ReturnType<typeof useTextCorrections>;
  locale: Locale; firstName: string; bio: string; initialField: ReviewField | null;
  photo: File | null; previewUrl: string; currentPhoto?: string; photoError: string;
  onPhotoChange: (event: React.ChangeEvent<HTMLInputElement>) => void; onSavePhoto: () => Promise<boolean>;
  onAccount: () => void; backHref: string;
}) {
  const s = correctionStrings[locale];
  const review = state.review;
  const requested = REVIEW_FIELDS.filter(field => review?.fields.some(item => item.field === field));
  const pending = review?.status === 'needs_review';
  const [opened, setOpened] = useState(false);
  const [drafts, setDrafts] = useState<Partial<Record<TextField, string>>>({});
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(false);
  const busy = useRef(false);
  const receipts = useRef<Partial<Record<TextField, Receipt>>>({});
  const heading = useRef<HTMLHeadingElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const notice = active && !pending && Boolean(review?.notification) && !opened;
  const blocked = working || state.working;
  const loadingText = requested.some(field => field !== 'photo') && (!textState.loaded || textState.error);
  const savedText = (field: TextField) => {
    const row = textState.rows.find(row => row.field === field && row.required);
    return row?.status === 'pending' ? row.proposed_text ?? '' : field === 'first_name' ? firstName : bio;
  };
  const draftText = (field: TextField) => drafts[field] ?? savedText(field);
  const valid = requested.every(field => field === 'photo' ? Boolean(photo || review?.updatedFields.includes('photo')) :
    isValidText(draftText(field), field === 'first_name' ? 30 : 300, field === 'first_name'));
  useEffect(() => {
    if (active && !notice) {
      const field = !pending && initialField ? document.getElementById(`correction-${initialField}`) : null;
      (field ?? heading.current)?.focus({ preventScroll: true });
    }
  }, [active, pending, notice, initialField]);

  async function submit() {
    if (!active || !review || pending || busy.current || !valid || loadingText) return;
    busy.current = true; setWorking(true); setError(false);
    try {
      // Stage only the requested proposals. Nothing is sent to the review queue
      // until all fields are confirmed and the final revision RPC succeeds.
      for (const field of requested) {
        const currentResult = await supabase.rpc('my_profile_review').abortSignal(AbortSignal.timeout(15_000));
        if (currentResult.error) throw currentResult.error;
        const current = parseOwnerReview(currentResult.data, owner);
        if (!current || current.requestId !== review.requestId || current.status !== 'awaiting_changes' || !current.fields.some(item => item.field === field)) throw new Error('Review changed');
        if (field === 'photo') {
          if (photo && !await onSavePhoto()) throw new Error('Photo save failed');
        } else {
          const text = draftText(field).trim();
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
            delete receipts.current[field];
          }
          if (correction.status !== 'pending') {
            if (receipts.current[field]?.text !== text) receipts.current[field] = { text, id: crypto.randomUUID(), revision: correction.revision };
            const command = receipts.current[field]!;
            const result = field === 'first_name'
              ? await supabase.rpc('submit_name_correction', { p_request_id: command.id, p_proposed_name: text }).abortSignal(AbortSignal.timeout(15_000))
              : await supabase.rpc('submit_bio_correction', { p_request_id: command.id, p_proposed_text: text, p_revision: command.revision }).abortSignal(AbortSignal.timeout(15_000));
            if (result.error?.code === 'PT409') delete receipts.current[field];
            const confirmed = await supabase.rpc('my_text_corrections').abortSignal(AbortSignal.timeout(15_000));
            if (confirmed.error || !confirmed.data.some(row => row.field === field && row.required && row.status === 'pending' && row.request_id === command.id && (row.proposed_text ?? '') === text)) throw new Error('Save unconfirmed');
          }
        }
      }
      invalidateParticipant();
      await textState.refresh();
      const confirmed = await state.reconcile();
      if (!confirmed || confirmed.requestId !== review.requestId || !reviewReady(confirmed.fields, confirmed.updatedFields, confirmed.canSubmit)) throw new Error('Save unconfirmed');
      if (!await state.submit()) throw new Error('Submission unconfirmed');
      receipts.current = {};
    } catch {
      setError(true); invalidateParticipant(); void textState.refresh(); void state.refresh();
    } finally { busy.current = false; setWorking(false); }
  }

  if (!review) return null;
  function open() { setOpened(true); void state.acknowledge(); }
  return <section className={styles.shell} lang={locale} data-testid="focused-corrections" aria-busy={blocked}>
    <div className={styles.phone}>
      <header className={styles.header}><Link href={backHref} aria-label="Amourette"><BrandLogo className="w-52" align="start" /></Link></header>
      <div className={styles.main} hidden={notice}>
        {pending ? <div className={`night-panel ${styles.pending}`}>
          <Check size={26} aria-hidden="true" className="mb-5 text-cream" />
          <p className="night-kicker flex items-center gap-2 !tracking-[0.16em]"><Clock3 size={14} aria-hidden="true" />{s.waiting}</p>
          <h1 ref={heading} tabIndex={-1}>{s.sentTitle}</h1>
          <p className={styles.sub}>{s.sentCopy}</p>
          <p role="status" className="mt-3 text-sm leading-6 text-cream">{s.received(requested.length)}</p>
          <p className="mt-4 text-xs leading-5 text-taupe">{s.access}</p>
        </div> : <>
          <h1 ref={heading} tabIndex={-1}>{s.modify}</h1>
          <p className={styles.sub}>{s.compactCopy}</p>
          <form onSubmit={event => { event.preventDefault(); void submit(); }}>
            {review.fields.map(item => {
              const field = item.field;
              const reasonId = `correction-reason-${field}`;
              const id = `correction-${field}`;
              const value = field !== 'photo' ? draftText(field) : '';
              const fieldValid = field === 'photo' || Boolean(isValidText(value, field === 'first_name' ? 30 : 300, field === 'first_name'));
              return <div className={styles.field} key={field}>
                <label className={styles.label} htmlFor={field === 'photo' ? undefined : id}>{s.labels[field]}</label>
                <p className={styles.help} id={reasonId}>{correctionReason(item, locale)}</p>
                {field === 'photo' ? <div className={styles.photoRow}>
                  <div className={styles.photo}>{previewUrl || currentPhoto ? <ProfilePhoto src={previewUrl || currentPhoto} alt={s.newPhoto} /> : <ImageUp size={24} aria-hidden="true" />}</div>
                  <input ref={fileInput} type="file" accept={PHOTO_ACCEPT} hidden onChange={onPhotoChange} />
                  <button className={`night-button night-button-secondary ${styles.choose}`} type="button" disabled={blocked} onClick={() => fileInput.current?.click()}>{s.choose}</button>
                </div> : <>
                  {field === 'first_name' ? <input id={id} className={`night-input ${styles.input}`} autoComplete="given-name" value={value} disabled={blocked || loadingText} aria-describedby={`${reasonId} ${id}-count`} aria-invalid={!fieldValid} onChange={event => { setDrafts(previous => ({ ...previous, first_name: event.target.value })); setError(false); }} /> :
                    <textarea id={id} className={`night-input ${styles.input}`} value={value} disabled={blocked || loadingText} aria-describedby={`${reasonId} ${id}-count`} aria-invalid={!fieldValid} onChange={event => { setDrafts(previous => ({ ...previous, bio: event.target.value })); setError(false); }} />}
                  <p className={styles.count} id={`${id}-count`}>{Array.from(value.trim()).length} / {field === 'first_name' ? 30 : 300}</p>
                  {!fieldValid && value.length > 0 && <p className={styles.error} role="alert">{field === 'first_name' ? nameCorrectionStrings[locale].invalid : bioValidation(value) === 'invalid' ? t[locale].profile.bioInvalid : t[locale].profile.bioTooLong}</p>}
                </>}
              </div>;
            })}
            {loadingText && <p className={styles.sub}>{textState.error ? profileReviewStrings[locale].error : s.loading}</p>}
            {textState.error && <button type="button" className={styles.textAction} onClick={() => void textState.refresh()}>{s.retry}</button>}
            {(error || photoError && requested.includes('photo')) && <p role="alert" className={styles.error}>{photoError && requested.includes('photo') ? localizedPhotoError(photoError, locale) : s.error}</p>}
            <button type="submit" className={`night-button night-button-secondary ${styles.primary}`} disabled={blocked || !valid || loadingText}>{blocked ? s.saving : s.submit}<ChevronRight size={18} aria-hidden="true" /></button>
          </form>
        </>}
        {state.error && <p role="alert" className={styles.error}>{profileReviewStrings[locale].error} <button type="button" className={styles.textAction} disabled={blocked} onClick={() => void state.refresh()}>{profileReviewStrings[locale].retry}</button></p>}
      </div>
      <footer className={styles.footer} hidden={notice}>
        {!pending && <p className={styles.access}><LockKeyhole size={14} aria-hidden="true" /><span>{s.access}</span></p>}
        <nav className={styles.navigation}><Link className={styles.textAction} href={backHref}>{s.return}</Link><button type="button" className={styles.textAction} disabled={blocked} onClick={onAccount}>{s.account}</button></nav>
      </footer>
    </div>
    {notice && <ProfileCorrectionNotice fields={review.fields} locale={locale} working={blocked} onEdit={open} onClose={open} />}
  </section>;
}
