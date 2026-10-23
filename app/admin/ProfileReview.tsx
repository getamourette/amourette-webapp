'use client';

import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, ChevronRight, ClipboardCheck } from 'lucide-react';
import { ProfilePhoto } from '@/components/ProfilePhoto';
import { PhotoReviewImages } from '@/components/PhotoReviewImages';
import { Modal } from '@/components/ui/modal';
import {
  REVIEW_FIELDS, REVIEW_FILTERS, REVIEW_LABELS, correctionMessage,
  reviewCorrection, reviewReasonOptions, type ReviewCorrection, type ReviewField,
  type ReviewFilter, type ReviewOutcome, type ReviewProfile, type ReviewQueue,
} from '@/lib/profile-review';
import { PHOTO_REASONS, type PhotoReason } from '@/lib/photo-moderation';
import styles from './ProfileReview.module.css';

type Props = {
  venues: { id: string; name: string }[];
  venueId: string;
  filter: ReviewFilter;
  queue: ReviewQueue | null;
  loading: boolean;
  error: string | null;
  onVenueChange: (id: string) => void;
  onFilterChange: (filter: ReviewFilter) => void;
  onReload: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onRejectReplacement: (profile: ReviewProfile, reason: PhotoReason) => Promise<ReviewOutcome>;
  onApprove: (profile: ReviewProfile) => Promise<ReviewOutcome>;
  onRequestChanges: (profile: ReviewProfile, fields: ReviewCorrection[]) => Promise<ReviewOutcome>;
};

// A view over an authorized, inspected snapshot. The integration owns loading,
// transactions and advancement; this component never calls moderation RPCs.
export function ProfileReview(props: Props) {
  const [working, setWorking] = useState(false);
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const previousProfile = useRef<string | null>(null);
  const queue = props.queue?.venueId === props.venueId && props.queue.filter === props.filter
    ? props.queue : null;
  const profile = queue?.profile;
  useEffect(() => {
    if (previousProfile.current && previousProfile.current !== profile?.id) heading.current?.focus();
    previousProfile.current = profile?.id ?? null;
  }, [profile?.id]);
  const unavailable = props.loading || !queue;
  const filterLabel = REVIEW_FILTERS.find(item => item.value === props.filter)?.label;

  return <section className={styles.review} aria-labelledby={headingId} aria-busy={props.loading || working} data-testid="admin-profile-review">
    <div className={styles.toolbar}>
      <h3 id={headingId} ref={heading} tabIndex={-1}>Profile review</h3>
      <label className={styles.venue}>Venue
        <select value={props.venueId} disabled={working} onChange={event => {
          if (props.venues.some(venue => venue.id === event.target.value)) props.onVenueChange(event.target.value);
        }}>
          {!props.venueId && <option value="">Select a venue</option>}
          {props.venues.map(venue => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
        </select>
      </label>
    </div>
    <div className={styles.filters} role="group" aria-label="Profile status">
      {REVIEW_FILTERS.map(item => <button type="button" key={item.value} aria-pressed={item.value === props.filter}
        disabled={working || !props.venueId} onClick={() => props.onFilterChange(item.value)}>
        {item.label}<span aria-label={unavailable ? 'Updating count' : `${queue.counts[item.value]} profiles`}>
          {unavailable ? '…' : queue.counts[item.value]}
        </span>
      </button>)}
    </div>
    {props.error ? <div className={styles.empty} role="alert"><p>{props.error}</p>
      <button type="button" className="night-button night-button-secondary px-4 py-3" disabled={working} onClick={props.onReload}>Retry profile review</button>
    </div> : unavailable ? <div className={styles.empty} role="status">
      <p>{props.venueId ? 'Loading profiles…' : 'Select a venue to review its profiles.'}</p>
    </div> : !profile ? <div className={styles.empty} role="status">
      <ClipboardCheck aria-hidden="true" size={32} />
      <h4>{props.filter === 'needs_review' ? 'You’re all caught up' : `No ${props.filter === 'all' ? 'profiles' : filterLabel?.toLowerCase()} here`}</h4>
      <p>{props.filter === 'needs_review' ? 'No profiles need review at this venue. Profiles awaiting changes will return after resubmission.' : 'Choose another filter or venue to continue.'}</p>
    </div> : <PhotoReviewImages><ReviewCard key={`${props.venueId}:${props.filter}:${queue.inspectionId}:${profile.id}:${profile.revision}`}
      profile={profile} position={queue.position} total={queue.total} workingChanged={setWorking}
      onPrevious={props.onPrevious} onNext={props.onNext} onReload={props.onReload}
      onApprove={props.onApprove} onRequestChanges={props.onRequestChanges} onRejectReplacement={props.onRejectReplacement} />
    </PhotoReviewImages>}
  </section>;
}

function ReviewCard({ profile, position, total, workingChanged, onPrevious, onNext, onReload, onApprove, onRequestChanges, onRejectReplacement }: {
  profile: ReviewProfile; position: number; total: number;
  workingChanged: (working: boolean) => void;
  onPrevious: () => void; onNext: () => void; onReload: () => void;
  onApprove: Props['onApprove']; onRequestChanges: Props['onRequestChanges']; onRejectReplacement: Props['onRejectReplacement'];
}) {
  const [correcting, setCorrecting] = useState(false);
  const [replacementReason, setReplacementReason] = useState<PhotoReason>('face_unclear');
  const [corrections, setCorrections] = useState<ReviewCorrection[]>([]);
  const [working, setWorking] = useState(false);
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null);
  const [enlarged, setEnlarged] = useState<{ path: string; label: string } | null>(null);
  const busy = useRef(false);
  const id = useId();
  const correctionHeading = useRef<HTMLLegendElement>(null);
  const blocked = working || outcome !== null;
  const actionable = profile.status !== 'awaiting_changes';
  useEffect(() => { if (correcting) correctionHeading.current?.focus(); }, [correcting]);

  function toggle(field: ReviewField) {
    setCorrections(current => {
      if (current.some(item => item.field === field)) return current.filter(item => item.field !== field);
      const correction = reviewCorrection(field, reviewReasonOptions(field)[0].value);
      return correction ? [...current, correction] : current;
    });
  }
  async function act(action: 'approve' | 'correct' | 'rejectReplacement') {
    if (busy.current || blocked || !actionable || (action === 'approve' && profile.status !== 'needs_review') || (action === 'correct' && !corrections.length) || (action === 'rejectReplacement' && (!profile.photoReplacement || profile.status !== 'needs_review'))) return;
    busy.current = true; setWorking(true); workingChanged(true);
    try {
      setOutcome(await (action === 'approve' ? onApprove(profile) : action === 'rejectReplacement' ? onRejectReplacement(profile, replacementReason) : onRequestChanges(profile, corrections)));
    } catch { setOutcome('uncertain'); }
    finally { busy.current = false; setWorking(false); workingChanged(false); }
  }
  const selected = (field: ReviewField) => corrections.find(item => item.field === field);
  const needsChanges = (field: ReviewField) => Boolean(selected(field)) ||
    (profile.status === 'awaiting_changes' && !profile.changedFields.includes(field) &&
      Boolean(profile.correction?.fields.some(item => item.field === field)));
  const badge = (field: ReviewField) => needsChanges(field) ? 'Needs changes'
    : profile.changedFields.includes(field) ? 'Updated'
    : profile.approvedFields.includes(field) ? 'Approved' : null;
  const status = profile.status === 'awaiting_changes' ? 'Awaiting changes'
    : profile.status === 'approved' ? 'Approved' : profile.resubmission ? 'Resubmitted · review changes' : 'Needs review';

  const textFields = ['first_name', 'bio'] as const;
  const needsTextReview = textFields.some(field => !profile.approvedFields.includes(field));
  const replacementField = (field: typeof textFields[number]) => <div key={field} className={styles.replacementField}>
    <div className={styles.fieldLabel}><h5>{field === 'first_name' ? 'First name' : 'Bio'}</h5>
      <span className={`${styles.badge} ${profile.approvedFields.includes(field) ? '' : styles.reviewBadge}`}>
        {profile.approvedFields.includes(field) ? 'Approved' : 'Needs review'}
      </span>
    </div>
    <p className={styles.replacementValue}>{field === 'first_name' ? profile.firstName ?? 'Name hidden pending correction' : profile.bio || 'No bio'}</p>
  </div>;
  const correctionHistory = profile.correction && <details className={styles.originalRequest} open={profile.resubmission}>
    <summary>Original correction request</summary>
    <ul>{profile.correction.fields.map(item => <li key={item.field}>
      <strong>{REVIEW_LABELS[item.field]}</strong> · {item.reason === 'legacy_unknown' ? 'Original correction reason unavailable' : reviewReasonOptions(item.field).find(option => option.value === item.reason)?.label}
      {item.field === 'photo' ? <button type="button" disabled={!profile.correction!.original.photoPath} aria-label="Enlarge originally reviewed picture" onClick={() => {
        if (profile.correction?.original.photoPath) setEnlarged({ path: profile.correction.original.photoPath, label: 'Originally reviewed picture' });
      }}><ProfilePhoto src={profile.correction!.original.photoPath} alt="Originally reviewed profile picture" className={styles.originalPhoto} /></button>
        : <p className={styles.originalText}>{item.field === 'first_name' ? profile.correction!.original.firstName : profile.correction!.original.bio || 'No bio'}</p>}
    </li>)}</ul>
  </details>;
  const correctionForm = actionable && correcting && <form onSubmit={event => { event.preventDefault(); void act('correct'); }}>
    <fieldset disabled={blocked} className={styles.corrections}>
      <legend ref={correctionHeading} tabIndex={-1}>What needs a correction?</legend>
      <div className={styles.choices}>{REVIEW_FIELDS.map(field => <label key={field} className={selected(field) ? styles.selectedChoice : ''}>
        <input type="checkbox" checked={Boolean(selected(field))} onChange={() => toggle(field)} />{REVIEW_LABELS[field]}
      </label>)}</div>
      <div className={styles.reasons}>{REVIEW_FIELDS.filter(field => selected(field)).map(field => <label className={styles.reason} key={field}>
        {REVIEW_LABELS[field]} reason<select value={selected(field)?.reason} onChange={event => {
          const correction = reviewCorrection(field, event.target.value);
          if (correction) setCorrections(current => current.map(item => item.field === field ? correction : item));
        }}>{reviewReasonOptions(field).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      </label>)}</div>
    </fieldset>
    {profile.photoReplacement && selected('photo') && <p className={styles.message} role="status">Requesting a photo correction removes both the current approved photo and the proposed replacement, and hides the profile until a new photo is approved. To keep the current photo, cancel and choose “Reject new photo”.</p>}
    {corrections.length > 0 && <div className={styles.message} aria-live="polite">
      <h5>Message to user</h5><p>{correctionMessage(corrections)}</p>
      <ul>{REVIEW_FIELDS.map(field => selected(field)).filter(item => item !== undefined).map(item => <li key={item.field}>
        {REVIEW_LABELS[item.field]}: {reviewReasonOptions(item.field).find(option => option.value === item.reason)?.label}
      </li>)}</ul>
    </div>}
    <div className={styles.actions}>
      <button type="submit" disabled={blocked || !corrections.length} className="night-button night-button-danger px-5 py-3">{working ? 'Sending request…' : 'Request changes & next'}<ChevronRight aria-hidden="true" size={16} /></button>
      <button type="button" disabled={blocked} className={styles.cancel} onClick={() => { setCorrecting(false); setCorrections([]); }}>Cancel</button>
    </div>
    <p className={styles.hint}>One request for all selected fields. The user is notified once and stays hidden until approval.</p>
  </form>;

  const outcomeNotice = outcome && <div id={`${id}-outcome`} className={styles.outcome} role={outcome === 'saved' ? 'status' : 'alert'}>
    <p>{outcome === 'stale' ? 'This profile changed while you were reviewing it. Reload and inspect the latest submission before deciding.'
      : outcome === 'uncertain' ? 'Could not confirm this decision. Reload the profile to check its status before deciding again.' : 'Decision saved.'}</p>
    {outcome !== 'saved' && <button type="button" onClick={onReload} className="night-button night-button-secondary mt-3 px-4 py-3">Reload profile</button>}
  </div>;

  return <article className={styles.card}>
    <header className={styles.cardHeader}>
      <div><h4>Profile {position} of {total}</h4><p className={styles.status}>{status}</p></div>
      <nav aria-label="Browse profiles" className={styles.navigation}>
        <button type="button" disabled={working || position <= 1} onClick={onPrevious}><ChevronLeft size={16} aria-hidden="true" />Previous</button>
        <button type="button" disabled={working || position >= total} onClick={onNext}>Next<ChevronRight size={16} aria-hidden="true" /></button>
      </nav>
    </header>
    {profile.photoReplacement ? <div className={styles.replacementLayout}>
      <section className={styles.decisionZone} aria-labelledby={`${id}-decide`}>
        <h5 id={`${id}-decide`} className={styles.zoneHeading}>To decide · Photo replacement</h5>
        <div className={styles.photoComparison}>
          {[
            { path: profile.currentPhotoPath, label: 'Current photo', hint: 'Approved · visible to others' },
            { path: profile.photoPath, label: 'New photo', hint: 'Waiting for your decision' },
          ].map((photo, index) => <Fragment key={photo.label}>
            {index === 1 && <ArrowRight aria-hidden="true" className={styles.comparisonArrow} size={28} />}
            <figure className={styles.replacementPortrait}>
              <button type="button" disabled={!photo.path} aria-label={`Enlarge ${photo.label.toLowerCase()}`}
                className={`${styles.enlarge} ${index === 1 ? styles.proposedPhoto : ''}`} onClick={() => {
                  if (photo.path) setEnlarged({ path: photo.path, label: photo.label });
                }}><ProfilePhoto src={photo.path} alt={photo.label} className={styles.photo} /></button>
              <figcaption className={styles.photoCaption}><strong>{photo.label}</strong><span>{photo.hint}</span></figcaption>
            </figure>
          </Fragment>)}
        </div>
        {profile.status === 'needs_review' && !correcting && <form className={styles.replacement} onSubmit={event => { event.preventDefault(); void act('rejectReplacement'); }}>
          <button type="button" disabled={blocked} className="night-button night-button-primary px-5 py-3" onClick={() => void act('approve')}>
            {working ? 'Saving decision…' : needsTextReview ? 'Approve profile & new photo' : 'Approve new photo'}
          </button>
          <label className={styles.reason}>Rejection reason<select disabled={blocked} value={replacementReason} onChange={event => {
            const reason = PHOTO_REASONS.find(reason => reason === event.target.value);
            if (reason) setReplacementReason(reason);
          }}>{reviewReasonOptions('photo').map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <button type="submit" disabled={blocked} className="night-button night-button-secondary px-4 py-3">Reject new photo</button>
          <p className={styles.explanation}>Rejecting keeps the current photo. The profile stays visible and the participant is told why.</p>
        </form>}
        {textFields.filter(field => !profile.approvedFields.includes(field)).map(replacementField)}
        {correctionHistory}
      </section>
      <aside className={styles.details} aria-labelledby={`${id}-approved`}>
        <h5 id={`${id}-approved`} className={styles.zoneHeading}>Already approved</h5>
        {textFields.filter(field => profile.approvedFields.includes(field)).map(replacementField)}
      </aside>
      {actionable && <details className={styles.otherActions}>
        <summary>Other actions</summary>
        <p className={styles.explanation}>Asks the participant to fix fields. Both photos are removed and the profile is hidden until approval.</p>
        {!correcting && <button type="button" disabled={blocked} className={styles.dangerOutline} onClick={() => setCorrecting(true)}>Request profile changes…</button>}
        {correctionForm}
      </details>}
    </div> : <div className={styles.profile}>
      <div>
        <figure className={`${styles.portrait} ${needsChanges('photo') ? styles.needsChanges : ''}`}>
          <button type="button" disabled={!profile.photoPath} aria-label="Enlarge profile picture" className={styles.enlarge} onClick={() => {
            if (profile.photoPath) setEnlarged({ path: profile.photoPath, label: 'Submitted profile picture' });
          }}><ProfilePhoto src={profile.photoPath} alt={`Profile picture of ${profile.firstName ?? 'this participant'}`} className={styles.photo} /></button>
          {badge('photo') && <figcaption className={`${styles.badge} ${needsChanges('photo') ? styles.dangerBadge : ''}`}>{badge('photo')}</figcaption>}
        </figure>
      </div>
      <div className={styles.details}>
        {(['first_name', 'bio'] as const).map(field => <div key={field}>
          <div className={styles.fieldLabel}><h5>{REVIEW_LABELS[field]}</h5>{badge(field) && <span className={`${styles.badge} ${needsChanges(field) ? styles.dangerBadge : ''}`}>{badge(field)}</span>}</div>
          <p className={`${styles.fieldValue} ${field === 'bio' ? styles.bio : ''} ${needsChanges(field) ? styles.needsChanges : ''}`}>
            {field === 'first_name' ? profile.firstName ?? 'Name hidden pending correction' : profile.bio || 'No bio'}
          </p>
        </div>)}
        {correctionHistory}
        {profile.status === 'awaiting_changes' && <p className={styles.explanation}>This profile is hidden from discovery. It returns to Needs review after the participant updates all requested fields and submits again.</p>}
        {correctionForm}
        {actionable && !correcting && <div>
          <div className={styles.approval}><Check aria-hidden="true" size={18} /><p>Review the name, bio and profile picture together.</p></div>
          <div className={styles.actions}>
            {profile.status === 'needs_review' && <button type="button" disabled={blocked} className="night-button night-button-primary px-5 py-3" onClick={() => void act('approve')}>{working ? 'Saving decision…' : 'Approve & next'}<ChevronRight aria-hidden="true" size={16} /></button>}
            <button type="button" disabled={blocked} className="night-button night-button-secondary px-4 py-3" onClick={() => setCorrecting(true)}>Request changes</button>
          </div>
          <p className={styles.hint}>{profile.status === 'approved' ? 'This profile is approved. You can request changes if it needs another correction.' : 'Approve this submitted profile, then continue to the next review.'}</p>
        </div>}
        {outcomeNotice}
      </div>
    </div>}
    {profile.photoReplacement && outcomeNotice}
    {enlarged && <Modal onClose={() => setEnlarged(null)} labelledById={`${id}-photo`} closeLabel="Close enlarged photo" panelClassName="w-full max-w-3xl p-4">
      <h3 id={`${id}-photo`} className="mb-3 font-semibold">{enlarged.label}</h3>
      <ProfilePhoto src={enlarged.path} alt={enlarged.label} className="max-h-[75dvh] w-full object-contain" />
    </Modal>}
  </article>;
}
