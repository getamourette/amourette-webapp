'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { parseOwnerReview, type OwnerReview } from './profile-review-data';
import { createParticipantRefresh, PARTICIPANT_EVENT, participantGeneration, invalidateParticipant } from './participant-refresh';
import { PHOTO_REFRESH_EVENT } from './usePhotoState';

export function useProfileReview(owner: string | null) {
  const [snapshot, setSnapshot] = useState<{ owner: string; review: OwnerReview | null } | null>(null);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [working, setWorking] = useState(false);
  const coordinator = useRef<ReturnType<typeof createParticipantRefresh> | null>(null);
  const busy = useRef(false);
  const ownerRef = useRef(owner);
  const latest = useRef<{ owner: string; review: OwnerReview | null } | null>(null);
  useEffect(() => { ownerRef.current = owner; }, [owner]);
  useEffect(() => {
    if (!owner) return;
    const refresh = createParticipantRefresh(async (signal, current) => {
      if (document.visibilityState !== 'visible') return true;
      const generation = participantGeneration();
      const result = await supabase.rpc('my_profile_review').abortSignal(signal);
      if (!current() || generation !== participantGeneration()) return false;
      // Safe WIP cutover: #236 remains usable until #294 is applied.
      if (result.error?.code === 'PGRST202') { latest.current = { owner, review: null }; setSnapshot(latest.current); setError(false); return true; }
      if (result.error) { setError(true); return false; }
      try { latest.current = { owner, review: parseOwnerReview(result.data, owner) }; setSnapshot(latest.current); setError(false); }
      catch { setError(true); return false; }
      return true;
    });
    coordinator.current = refresh;
    const changed = () => { void refresh.request(); };
    const foreground = () => { if (document.visibilityState === 'visible') void refresh.request(true); };
    void refresh.request(true);
    const timer = window.setInterval(changed, 15_000);
    window.addEventListener(PARTICIPANT_EVENT, changed);
    window.addEventListener(PHOTO_REFRESH_EVENT, changed);
    window.addEventListener('online', foreground);
    document.addEventListener('visibilitychange', foreground);
    return () => {
      refresh.dispose(); coordinator.current = null; window.clearInterval(timer);
      window.removeEventListener(PARTICIPANT_EVENT, changed);
      window.removeEventListener(PHOTO_REFRESH_EVENT, changed);
      window.removeEventListener('online', foreground);
      document.removeEventListener('visibilitychange', foreground);
    };
  }, [owner]);
  const review = snapshot?.owner === owner ? snapshot.review : null;
  const refresh = useCallback(() => coordinator.current?.request(true), []);
  const reconcile = useCallback(async () => {
    if (!await coordinator.current?.request(true)) return undefined;
    return latest.current?.owner === owner ? latest.current.review : undefined;
  }, [owner]);
  async function act(action: 'submit' | 'acknowledge') {
    if (!owner || !review || busy.current || (action === 'submit' && (!review.canSubmit || review.status !== 'awaiting_changes'))) return;
    busy.current = true; setWorking(true); setActionError(false);
    try {
      const result = action === 'submit' ? await supabase.rpc('submit_profile_review', { p_revision: review.revision }).abortSignal(AbortSignal.timeout(15_000))
        : await supabase.rpc('acknowledge_profile_correction', { p_request_id: review.requestId }).abortSignal(AbortSignal.timeout(15_000));
      if (ownerRef.current !== owner) return;
      if (result.error) setActionError(true);
      invalidateParticipant();
      const confirmed = await refresh();
      const current = latest.current?.owner === owner ? latest.current.review : undefined;
      if (confirmed && (current === null || (current?.requestId === review.requestId &&
        (action === 'acknowledge' ? !current.notification : current.status === 'needs_review' && current.revision === review.revision)))) setActionError(false);
    } catch { if (ownerRef.current === owner) setActionError(true); }
    finally { busy.current = false; setWorking(false); }
  }
  return { review, error: error || actionError, working, loaded: snapshot?.owner === owner, refresh, reconcile,
    submit: () => act('submit'), acknowledge: () => act('acknowledge') };
}
