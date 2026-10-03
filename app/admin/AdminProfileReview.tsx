'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { isUuid } from '@/lib/input-validation';
import { invalidatePhotos } from '@/lib/usePhotoState';
import { parseReviewPage } from '@/lib/profile-review-data';
import type { ReviewCorrection, ReviewFilter, ReviewOutcome, ReviewProfile, ReviewQueue } from '@/lib/profile-review';
import { ProfileReview } from './ProfileReview';
import { NameCorrectionQueue } from './NameCorrectionQueue';
import { TextCorrectionQueue } from './TextReview';
import { PhotoQueue } from './PhotoQueue';

export function AdminProfileReview() {
  const [venues, setVenues] = useState<{ id: string; name: string }[]>([]);
  const [venueId, setVenueId] = useState('');
  const [filter, setFilter] = useState<ReviewFilter>('needs_review');
  const [offset, setOffset] = useState(0);
  const [queue, setQueue] = useState<ReviewQueue | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingMigration, setPendingMigration] = useState(false);
  const sequence = useRef(0);
  const reading = useRef(false);
  const busy = useRef(false);
  const load = useCallback(async (target = offset, background = false) => {
    if (!isUuid(venueId)) return;
    if (background && reading.current) return;
    const request = ++sequence.current;
    reading.current = true;
    if (!background) { setLoading(true); setError(null); }
    try {
      const result = await supabase.rpc('admin_profile_reviews', { p_venue: venueId, p_filter: filter, p_offset: target, p_limit: 1 }).abortSignal(AbortSignal.timeout(15_000));
      if (request !== sequence.current) return;
      if (result.error?.code === 'PGRST202') { setPendingMigration(true); return; }
      if (result.error) throw new Error('read failed');
      const page = parseReviewPage(result.data, venueId, filter, target);
      setPendingMigration(false);
      const total = page.counts[filter];
      if (!page.profile && target > 0 && total > 0) { setOffset(Math.min(target, total - 1)); return; }
      setQueue(previous => background && previous?.venueId === venueId && previous.filter === filter && previous.profile
        ? { ...previous, counts: page.counts, total }
        : { venueId, filter, inspectionId: crypto.randomUUID(), counts: page.counts, profile: page.profile, position: page.profile ? target + 1 : 0, total });
    } catch { if (request === sequence.current) setError('Could not load profile review. Your report queue remains available below.'); }
    finally { if (request === sequence.current) { reading.current = false; if (!background) setLoading(false); } }
  }, [venueId, filter, offset]);
  const loadVenues = useCallback(async () => {
    const result = await supabase.from('venues').select('id,name').order('name').abortSignal(AbortSignal.timeout(15_000));
    if (result.error) { setError('Could not load venues for profile review.'); return; }
    setVenues(result.data ?? []);
    setVenueId(current => current || result.data?.[0]?.id || '');
  }, []);
  useEffect(() => { void (async () => { await loadVenues(); })(); }, [loadVenues]);
  useEffect(() => {
    void (async () => { await load(); })();
    const refresh = () => { if (!busy.current && document.visibilityState === 'visible') void load(offset, true); };
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    const requests = sequence;
    return () => { requests.current++; window.clearInterval(timer); window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [load, offset]);
  // An inspected snapshot never changes under the reviewer. Realtime changes
  // are checked by the exact revision in the write RPC, then explicitly reloaded.
  async function decide(profile: ReviewProfile, fields?: ReviewCorrection[]): Promise<ReviewOutcome> {
    if (busy.current || queue?.profile?.revision !== profile.revision || queue.venueId !== venueId || queue.filter !== filter) return 'stale';
    busy.current = true;
    try {
      const args = { p_profile: profile.id, p_venue: venueId, p_revision: profile.revision };
      const result = fields ? await supabase.rpc('request_profile_corrections', { ...args, p_fields: fields }).abortSignal(AbortSignal.timeout(15_000))
        : await supabase.rpc('approve_profile_review', args).abortSignal(AbortSignal.timeout(15_000));
      if (result.error) return result.error.code === 'PT409' ? 'stale' : 'uncertain';
      invalidatePhotos();
      // Filtered queues lose the reviewed item; All keeps it at this position.
      const next = filter === 'all' ? Math.min(offset + 1, queue.total - 1) : offset;
      if (next !== offset) setOffset(next); else await load(next);
      return 'saved';
    } catch { return 'uncertain'; }
    finally { busy.current = false; }
  }
  if (pendingMigration) return <>
    <p role="status" className="mb-6 text-sm text-white/55">Unified profile review is awaiting its database update. Current moderation remains available.</p>
    <NameCorrectionQueue /><TextCorrectionQueue /><PhotoQueue />
  </>;
  return <ProfileReview venues={venues} venueId={venueId} filter={filter} queue={queue} loading={loading} error={error}
    onVenueChange={id => { if (id !== venueId) { setQueue(null); setOffset(0); setVenueId(id); } }}
    onFilterChange={value => { if (value !== filter) { setQueue(null); setOffset(0); setFilter(value); } }}
    onReload={() => { if (venueId) void load(); else void loadVenues(); }}
    onPrevious={() => setOffset(value => Math.max(0, value - 1))}
    onNext={() => setOffset(value => value + 1)}
    onApprove={profile => decide(profile)} onRequestChanges={decide} />;
}
