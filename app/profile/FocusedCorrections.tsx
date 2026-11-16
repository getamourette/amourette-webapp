'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, ChevronRight, Clock3, LoaderCircle } from 'lucide-react';
import { BrandLogo } from '@/app/BrandLogo';
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
import { PhotoPicker, PhotoPortrait, photoCaption } from './fields';
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

export function FocusedCorrections({ active, owner, state, textState, locale, firstName, bio, initialField, photo, previewUrl, refusedPhoto, submittedPhoto, photoError, onPhotoChange, onRecrop, onSavePhoto, onAccount, backHref }: {
  active: boolean; owner: string; state: ReturnType<typeof useProfileReview>; textState: ReturnType<typeof useTextCorrections>;
  locale: Locale; firstName: string; bio: string; initialField: ReviewField | null;
  photo: File | null; previewUrl: string; refusedPhoto?: string; submittedPhoto?: string; photoError: string;
  onPhotoChange: (event: React.ChangeEvent<HTMLInputElement>) => void; onRecrop: React.MouseEventHandler<HTMLButtonElement>; onSavePhoto: () => Promise<boolean>;
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
  const photoOnly = requested.length === 1 && requested[0] === 'photo';
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
      if (!await state.submit()) return;
      receipts.current = {};
    } catch {
      setError(true); invalidateParticipant(); void textState.refresh(); void state.refresh();
    } finally { busy.current = false; setWorking(false); }
  }

  if (!review) return null;
  function open() { setOpened(true); void state.acknowledge(); }
  return <section className={styles.shell} lang={locale} data-testid="focused-corrections" aria-busy={blocked}>
    <div className={styles.phone}>
      <header className={styles.header}>
        <Link href={backHref} aria-disabled={blocked} tabIndex={blocked ? -1 : undefined} onClick={event => { if (blocked) event.preventDefault(); }}
          className={`night-button night-button-secondary mb-6 inline-flex min-h-11 items-center gap-2 px-4 py-2 text-sm ${blocked ? 'pointer-events-none opacity-50' : ''}`}>
          <span aria-hidden="true">←</span>{s.return}
        </Link>
        <BrandLogo className="w-52" align="start" />
      </header>
      <div className={styles.main} hidden={notice}>
        {pending ? <div className={`night-panel ${styles.pending}`}>
          <Check size={26} aria-hidden="true" className="mb-5 text-cream" />
          <p className="night-kicker flex items-center gap-2 !tracking-[0.16em]"><Clock3 size={14} aria-hidden="true" />{s.waiting}</p>
          <h1 ref={heading} tabIndex={-1}>{s.sentTitle}</h1>
          <p className={styles.sub}>{s.sentCopy}</p>
          {requested.includes('photo') && submittedPhoto && <div className="mt-5 flex justify-center"><PhotoPortrait src={submittedPhoto} caption={s.sent} /></div>}
        </div> : <>
          <h1 ref={heading} tabIndex={-1}>{photoOnly ? s.photoHeading : s.heading}</h1>
          <p className={styles.sub}>{s.compactCopy}</p>
          <form onSubmit={event => { event.preventDefault(); void submit(); }}>
            {requested.map(field => {
              const item = review.fields.find(item => item.field === field)!;
              const reasonId = `correction-reason-${field}`;
              const id = `correction-${field}`;
              const value = field !== 'photo' ? draftText(field) : '';
              const fieldValid = field === 'photo' || Boolean(isValidText(value, field === 'first_name' ? 30 : 300, field === 'first_name'));
              return <div className={styles.field} key={field}>
                <label className={styles.label} htmlFor={field === 'photo' ? undefined : id}>{s.labels[field]}</label>
                <p className={styles.help} id={reasonId}>{correctionReason(item, locale)}</p>
                {field === 'photo' ? <div className="flex items-start justify-center gap-3">
                  {refusedPhoto && <>
                    <PhotoPortrait src={refusedPhoto} caption={s.refused} refused />
                    <ArrowRight size={22} aria-hidden="true" className="mt-20 shrink-0 text-taupe" />
                  </>}
                  <figure className="flex w-28 flex-col items-center">
                    <PhotoPicker inputId={id} previewUrl={previewUrl} currentPhoto={submittedPhoto} onChange={onPhotoChange}
                      label={t[locale].profile.addPhoto} size="sm" disabled={blocked} onRecrop={onRecrop} editLabel={t[locale].profile.crop.edit} />
                    {(previewUrl || submittedPhoto) && <figcaption className={`${photoCaption} text-cream`}>{s.unsent}</figcaption>}
                  </figure>
                </div> : <>
                  {field === 'first_name' ? <input id={id} className={`night-input ${styles.input}`} autoComplete="given-name" value={value} disabled={blocked || loadingText} aria-describedby={`${reasonId} ${id}-count`} aria-invalid={!fieldValid} onChange={event => { setDrafts(previous => ({ ...previous, first_name: event.target.value })); setError(false); }} /> :
                    <textarea id={id} className={`night-input ${styles.input}`} value={value} disabled={blocked || loadingText} aria-describedby={`${reasonId} ${id}-count`} aria-invalid={!fieldValid} onChange={event => { setDrafts(previous => ({ ...previous, bio: event.target.value })); setError(false); }} />}
                  <p className={styles.count} id={`${id}-count`}>{Array.from(value.trim()).length} / {field === 'first_name' ? 30 : 300}</p>
                  {!fieldValid && value.length > 0 && <p className={styles.error} role="alert">{field === 'first_name' ? nameCorrectionStrings[locale].invalid : bioValidation(value) === 'invalid' ? t[locale].profile.bioInvalid : t[locale].profile.bioTooLong}</p>}
                </>}
              </div>;
            })}
            {loadingText && !textState.error && <p className={styles.sub}>{s.loading}</p>}
            <button type="submit" className={`night-button night-button-primary ${styles.primary}`} disabled={blocked || !valid || loadingText}>{blocked ? <><LoaderCircle size={18} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />{s.saving}</> : <>{s.submit}<ChevronRight size={18} aria-hidden="true" /></>}</button>
          </form>
        </>}
        {state.confirming && <p role="status" className="mt-3 text-sm text-taupe">{s.confirming}</p>}
        {!blocked && (state.error || !pending && (error || textState.error || photoError && requested.includes('photo'))) && <p role="alert" className={styles.error}>
          {state.error || textState.error ? profileReviewStrings[locale].error : photoError && requested.includes('photo') ? localizedPhotoError(photoError, locale) : s.error}
          {state.error && <> <button type="button" className={styles.textAction} onClick={() => void state.refresh()}>{profileReviewStrings[locale].retry}</button></>}
          {!state.error && textState.error && <> <button type="button" className={styles.textAction} onClick={() => void textState.refresh()}>{s.retry}</button></>}
        </p>}
      </div>
      <footer className={styles.footer} hidden={notice}>
        <nav className={styles.navigation}><button type="button" className={styles.textAction} disabled={blocked} onClick={onAccount}>{s.account}</button></nav>
      </footer>
    </div>
    {notice && <ProfileCorrectionNotice fields={review.fields} locale={locale} working={blocked} onEdit={open} onClose={open} />}
  </section>;
}
