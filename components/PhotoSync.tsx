'use client';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { invalidatePhotos, PHOTO_RESET_EVENT, retryPhotosIfNeeded } from '@/lib/usePhotoState';
import {
  createParticipantRefresh, invalidateParticipant, isParticipantSignal, markParticipantStale, parseParticipantRevision,
  PARTICIPANT_POLL_MS, PARTICIPANT_SIGNAL, PARTICIPANT_TOPIC, setParticipantSyncAvailable,
} from '@/lib/participant-refresh';
import { purgeStoredMatchingAnswers } from '@/lib/matching-consent';
export function PhotoSync() {
  useEffect(() => {
    purgeStoredMatchingAnswers();
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let owner: string | null = null;
    let stop: (() => void) | null = null;
    let authObserved = false;
    function subscribe(id: string | null) {
      if (!active || id === owner) return;
      owner = id;
      stop?.(); stop = null;
      setParticipantSyncAvailable(false);
      if (channel) void supabase.removeChannel(channel);
      channel = null;
      window.dispatchEvent(new Event(PHOTO_RESET_EVENT));
      markParticipantStale();
      invalidatePhotos();
      if (!id) return;
      let known: string | null | undefined;
      let force = true;
      const refresh = createParticipantRefresh(async (signal, current) => {
        if (document.visibilityState !== 'visible') return true;
        const forced = force; force = false;
        const { data, error } = await supabase.rpc('my_participant_revision').abortSignal(signal);
        // A timed-out read is a failure and must retry. Superseded/disposed reads
        // are already handled by the coordinator's trailing-read/cleanup paths.
        if (!current()) { force ||= forced; return false; }
        if (error) {
          force ||= forced;
          // A preview may precede the approved migration. Preserve legacy recovery
          // until the new RPC is present; other failures also retry the authorized views.
          invalidatePhotos(); invalidateParticipant();
          return error.code === 'PGRST202';
        }
        let revision: string | null;
        try { revision = parseParticipantRevision(data); }
        catch { force ||= forced; return false; }
        setParticipantSyncAvailable(true);
        if (forced || known !== revision) {
          invalidatePhotos(); invalidateParticipant();
        }
        known = revision;
        return true;
      });
      const request = (forced: boolean, immediate = false) => {
        if (!active || owner !== id) return;
        force ||= forced;
        void refresh.request(immediate);
      };
      channel = supabase.channel(`${PARTICIPANT_TOPIC}${id}`, { config: { private: true } })
        .on('broadcast', { event: PARTICIPANT_SIGNAL }, (event: { payload: unknown }) => {
          if (active && owner === id && isParticipantSignal(event.payload)) { markParticipantStale(); request(true); }
        })
        .subscribe(status => { if (status === 'SUBSCRIBED') request(true, true); });
      const recover = () => { if (document.visibilityState === 'visible') request(true, true); };
      const poll = setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        // Transient photo failures need a retry even at an unchanged revision.
        retryPhotosIfNeeded();
        request(false);
      }, PARTICIPANT_POLL_MS);
      document.addEventListener('visibilitychange', recover);
      window.addEventListener('online', recover);
      window.addEventListener('focus', recover);
      void refresh.request(true);
      stop = () => {
        refresh.dispose(); clearInterval(poll);
        document.removeEventListener('visibilitychange', recover);
        window.removeEventListener('online', recover);
        window.removeEventListener('focus', recover);
      };
    }
    void supabase.auth.getSession().then(({ data }) => { if (!authObserved) subscribe(data.session?.user.id ?? null); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authObserved = true; subscribe(session?.user.id ?? null);
    });
    return () => {
      active = false; stop?.(); subscription.unsubscribe();
      setParticipantSyncAvailable(false);
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);
  return null;
}
