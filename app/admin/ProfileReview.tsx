'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, ClipboardCheck } from 'lucide-react';
import { ProfilePhoto } from '@/components/ProfilePhoto';
import { PhotoReviewImages } from '@/components/PhotoReviewImages';
import { Modal } from '@/components/ui/modal';
import {
  REVIEW_FIELDS, REVIEW_FILTERS, REVIEW_LABELS, correctionMessage,
  reviewCorrection, reviewReasonOptions, type ReviewCorrection, type ReviewField,
  type ReviewFilter, type ReviewOutcome, type ReviewProfile, type ReviewQueue,
} from '@/lib/profile-review';
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
      onApprove={props.onApprove} onRequestChanges={props.onRequestChanges} />
    </PhotoReviewImages>}
  </section>;
}

function ReviewCard({ profile, position, total, workingChanged, onPrevious, onNext, onReload, onApprove, onRequestChanges }: {
  profile: ReviewProfile; position: number; total: number;
  workingChanged: (working: boolean) => void;
  onPrevious: () => void; onNext: () => void; onReload: () => void;
  onApprove: Props['onApprove']; onRequestChanges: Props['onRequestChanges'];
}) {
  const [correcting, setCorrecting] = useState(false);
  const [corrections, setCorrections] = useState<ReviewCorrection[]>([]);
  const [working, setWorking] = useState(false);
  const [outcome, setOutcome] = useState<ReviewOutcome | null>(null);
  const [enlarged, setEnlarged] = useState<{ path: string; original: boolean } | null>(null);
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
  async function act(action: 'approve' | 'correct') {
    if (busy.current || blocked || !actionable || (action === 'approve' && profile.status !== 'needs_review') || (action === 'correct' && !corrections.length)) return;
    busy.current = true; setWorking(true); workingChanged(true);
    try {
      setOutcome(await (action === 'approve' ? onApprove(profile) : onRequestChanges(profile, corrections)));
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

  return <article className={styles.card}>
    <header className={styles.cardHeader}>
      <div><h4>Profile {position} of {total}</h4><p className={styles.status}>{status}</p></div>
      <nav aria-label="Browse profiles" className={styles.navigation}>
        <button type="button" disabled={working || position <= 1} onClick={onPrevious}><ChevronLeft size={16} aria-hidden="true" />Previous</button>
        <button type="button" disabled={working || position >= total} onClick={onNext}>Next<ChevronRight size={16} aria-hidden="true" /></button>
      </nav>
    </header>
    <div className={styles.profile}>
      <figure className={`${styles.portrait} ${needsChanges('photo') ? styles.needsChanges : ''}`}>
        <button type="button" disabled={!profile.photoPath} aria-label="Enlarge profile picture" className={styles.enlarge} onClick={() => {
          if (profile.photoPath) setEnlarged({ path: profile.photoPath, original: false });
        }}><ProfilePhoto src={profile.photoPath} alt={`Profile picture of ${profile.firstName ?? 'this participant'}`} className={styles.photo} /></button>
        {badge('photo') && <figcaption className={`${styles.badge} ${needsChanges('photo') ? styles.dangerBadge : ''}`}>{badge('photo')}</figcaption>}
      </figure>
      <div className={styles.details}>
        {(['first_name', 'bio'] as const).map(field => <div key={field}>
          <div className={styles.fieldLabel}><h5>{REVIEW_LABELS[field]}</h5>{badge(field) && <span className={`${styles.badge} ${needsChanges(field) ? styles.dangerBadge : ''}`}>{badge(field)}</span>}</div>
          <p className={`${styles.fieldValue} ${field === 'bio' ? styles.bio : ''} ${needsChanges(field) ? styles.needsChanges : ''}`}>
            {field === 'first_name' ? profile.firstName ?? 'Name hidden pending correction' : profile.bio || 'No bio'}
          </p>
        </div>)}
        {profile.correction && <details className={styles.originalRequest} open={profile.resubmission}>
          <summary>Original correction request</summary>
          <ul>{profile.correction.fields.map(item => <li key={item.field}>
            <strong>{REVIEW_LABELS[item.field]}</strong> · {reviewReasonOptions(item.field).find(option => option.value === item.reason)?.label}
            {item.field === 'photo' ? <button type="button" disabled={!profile.correction!.original.photoPath} aria-label="Enlarge originally reviewed picture" onClick={() => {
              if (profile.correction?.original.photoPath) setEnlarged({ path: profile.correction.original.photoPath, original: true });
            }}><ProfilePhoto src={profile.correction!.original.photoPath} alt="Originally reviewed profile picture" className={styles.originalPhoto} /></button>
              : <p className={styles.originalText}>{item.field === 'first_name' ? profile.correction!.original.firstName : profile.correction!.original.bio || 'No bio'}</p>}
          </li>)}</ul>
        </details>}
        {profile.status === 'awaiting_changes' && <p className={styles.explanation}>This profile is hidden from discovery. It returns to Needs review after the participant updates all requested fields and submits again.</p>}
        {actionable && correcting && <form onSubmit={event => { event.preventDefault(); void act('correct'); }}>
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
        </form>}
        {actionable && !correcting && <div>
          <div className={styles.approval}><Check aria-hidden="true" size={18} /><p>Review the name, bio and profile picture together.</p></div>
          <div className={styles.actions}>
            {profile.status === 'needs_review' && <button type="button" disabled={blocked} className="night-button night-button-primary px-5 py-3" onClick={() => void act('approve')}>{working ? 'Approving…' : 'Approve & next'}<ChevronRight aria-hidden="true" size={16} /></button>}
            <button type="button" disabled={blocked} className="night-button night-button-secondary px-4 py-3" onClick={() => setCorrecting(true)}>Request changes</button>
          </div>
          <p className={styles.hint}>{profile.status === 'approved' ? 'This profile is approved. You can request changes if it needs another correction.' : 'Approve this submitted profile, then continue to the next review.'}</p>
        </div>}
        {outcome && <div id={`${id}-outcome`} className={styles.outcome} role={outcome === 'saved' ? 'status' : 'alert'}>
          <p>{outcome === 'stale' ? 'This profile changed while you were reviewing it. Reload and inspect the latest submission before deciding.'
            : outcome === 'uncertain' ? 'Could not confirm this decision. Reload the profile to check its status before deciding again.' : 'Decision saved.'}</p>
          {outcome !== 'saved' && <button type="button" onClick={onReload} className="night-button night-button-secondary mt-3 px-4 py-3">Reload profile</button>}
        </div>}
      </div>
    </div>
    {enlarged && <Modal onClose={() => setEnlarged(null)} labelledById={`${id}-photo`} closeLabel="Close enlarged photo" panelClassName="w-full max-w-3xl p-4">
      <h3 id={`${id}-photo`} className="mb-3 font-semibold">{enlarged.original ? 'Originally reviewed picture' : 'Submitted profile picture'}</h3>
      <ProfilePhoto src={enlarged.path} alt={enlarged.original ? 'Originally reviewed profile picture' : 'Submitted profile picture'} className="max-h-[75dvh] w-full object-contain" />
    </Modal>}
  </article>;
}
