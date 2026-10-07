'use client';

// In-memory layout fixtures. The dedicated preview runner mounts these only in
// temporary development routes, with a loopback-only Supabase configuration.
import { useState } from 'react';
import { ProfileReview } from '@/app/admin/ProfileReview';
import { orderedReviews, reviewCounts, type ReviewCorrection, type ReviewFilter, type ReviewOutcome, type ReviewProfile } from '@/lib/profile-review';

const initial: ReviewProfile[] = [
  { id: 'camille', revision: 'camille-1', firstName: 'Camille', bio: 'New in town. Always up for live music, good food, and meeting new people.', photoPath: '/test-profiles/portrait-1.svg', status: 'needs_review', submittedAt: '2026-10-03T18:00:00Z', resubmission: false, changedFields: [], approvedFields: ['first_name'], correction: null },
  { id: 'jules', revision: 'jules-1', firstName: 'Jules', bio: null, photoPath: '/test-profiles/portrait-2.svg', status: 'needs_review', submittedAt: '2026-10-03T19:00:00Z', resubmission: false, changedFields: [], approvedFields: [], correction: null },
  { id: 'nora', revision: 'nora-1', firstName: 'Nora', bio: 'A new bio', photoPath: '/test-profiles/portrait-3.svg', status: 'awaiting_changes', submittedAt: '2026-10-03T19:00:00Z', resubmission: false, changedFields: ['bio'], approvedFields: ['first_name'], correction: { fields: [{ field: 'bio', reason: 'inappropriate' }, { field: 'photo', reason: 'multiple_people' }], original: { firstName: 'Nora', bio: 'Original text', photoPath: '/test-profiles/portrait-4.svg' } } },
  { id: 'ines', revision: 'ines-1', firstName: 'Ines', bio: 'Live music', photoPath: '/test-profiles/portrait-5.svg', status: 'approved', submittedAt: '2026-10-03T19:00:00Z', resubmission: false, changedFields: [], approvedFields: ['first_name', 'bio', 'photo'], correction: null },
];

export default function Fixture() {
  const [profiles, setProfiles] = useState(initial);
  const [venueId, setVenueId] = useState('crowded');
  const [loadedVenue, setLoadedVenue] = useState('crowded');
  const [filter, setFilter] = useState<ReviewFilter>('needs_review');
  const [index, setIndex] = useState(0);
  const [inspection, setInspection] = useState(0);
  const [fault, setFault] = useState<ReviewOutcome>('saved');
  const [error, setError] = useState<string | null>(null);
  const [lastCommand, setLastCommand] = useState('');
  const source = loadedVenue === 'empty' ? [] : profiles;
  const rows = orderedReviews(source, filter);
  const profile = rows[index] ?? null;
  async function decision(current: ReviewProfile, corrections?: ReviewCorrection[]): Promise<ReviewOutcome> {
    setLastCommand(JSON.stringify({ id: current.id, revision: current.revision, corrections }));
    await new Promise(resolve => setTimeout(resolve, 150));
    if (fault !== 'saved') return fault;
    setProfiles(previous => previous.map(row => row.id !== current.id ? row : {
      ...row, revision: `${row.revision}-decision`, status: corrections ? 'awaiting_changes' : 'approved',
      correction: corrections ? { fields: corrections, original: { firstName: row.firstName, bio: row.bio, photoPath: row.photoPath } } : row.correction,
      approvedFields: corrections ? row.approvedFields : ['first_name', 'bio', 'photo'],
    }));
    setIndex(0); setInspection(value => value + 1);
    return 'saved';
  }
  return <main className="admin-shell night-shell">
    <div className="night-content mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
      <header className="admin-page-header mb-8"><p className="night-kicker mb-2">Step 3 · Intervene</p><h2 className="text-3xl font-black">Moderation</h2><p className="mt-2 text-sm text-white/55">Review profiles and handle reports.</p></header>
      <ProfileReview venues={[{ id: 'crowded', name: 'Test Lab · Crowded' }, { id: 'empty', name: 'Test Lab · Empty' }]}
        venueId={venueId} filter={filter} queue={{ venueId: loadedVenue, filter, inspectionId: String(inspection), counts: reviewCounts(source), profile, position: index + 1, total: rows.length }}
        loading={false} error={error} onVenueChange={id => { setVenueId(id); setIndex(0); window.setTimeout(() => { setLoadedVenue(id); setInspection(value => value + 1); }, 400); }}
        onFilterChange={value => { setFilter(value); setIndex(0); setInspection(value => value + 1); }}
        onReload={() => { setFault('saved'); setError(null); setInspection(value => value + 1); }}
        onPrevious={() => { setIndex(value => Math.max(0, value - 1)); setInspection(value => value + 1); }}
        onNext={() => { setIndex(value => value + 1); setInspection(value => value + 1); }}
        onApprove={current => decision(current)} onRequestChanges={(current, corrections) => decision(current, corrections)} />
      <div className="admin-table-surface rounded-2xl border border-white/10 p-5"><h3 className="text-xl font-black">Active queue</h3><p className="mt-2 text-sm text-white/55">Report workflow stays independent.</p></div>
      <details className="mt-12"><summary>Local fixture controls</summary>
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" onClick={() => setFault('stale')}>Return stale decision</button>
          <button type="button" onClick={() => setFault('uncertain')}>Return uncertain decision</button>
          <button type="button" onClick={() => setError('Could not load profiles. Please try again.')}>Return read error</button>
          <button type="button" onClick={() => { setIndex(0); setInspection(value => value + 1); setProfiles(previous => previous.map(row => row.id !== 'nora' ? row : { ...row, status: 'needs_review', resubmission: true, changedFields: ['bio', 'photo'], revision: 'nora-resubmission' })); }}>Resubmit Nora</button>
          <button type="button" onClick={() => setProfiles(previous => previous.map(row => row.id !== profile?.id ? row : { ...row, firstName: 'A very long participant name', bio: 'Long localized content '.repeat(70), photoPath: null }))}>Long content and missing photo</button>
        </div><output id="last-command">{lastCommand}</output>
      </details>
    </div>
  </main>;
}
