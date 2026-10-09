'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { createParticipantRefresh, PARTICIPANT_EVENT, participantGeneration } from './participant-refresh';
import type { TextCorrection } from './text-moderation';

export function useTextCorrections(owner: string | null) {
  const [snapshot, setSnapshot] = useState<{ owner: string; rows: TextCorrection[] } | null>(null);
  const [error, setError] = useState(false);
  const coordinator = useRef<ReturnType<typeof createParticipantRefresh> | null>(null);
  useEffect(() => {
    if (!owner) return;
    const refresh = createParticipantRefresh(async (signal, current) => {
      if (document.visibilityState !== 'visible') return true;
      const generation = participantGeneration();
      const result = await supabase.rpc('my_text_corrections').abortSignal(signal);
      if (!current() || generation !== participantGeneration()) return false;
      if (result.error) { setError(true); return false; }
      setError(false);
      setSnapshot({ owner, rows: result.data });
      return true;
    });
    coordinator.current = refresh;
    const changed = () => { void refresh.request(); };
    const foreground = () => { if (document.visibilityState === 'visible') void refresh.request(true); };
    void refresh.request(true);
    window.addEventListener(PARTICIPANT_EVENT, changed);
    window.addEventListener('online', foreground);
    document.addEventListener('visibilitychange', foreground);
    const timer = window.setInterval(() => refresh.poll(), 15_000);
    return () => {
      refresh.dispose(); coordinator.current = null;
      window.clearInterval(timer);
      window.removeEventListener(PARTICIPANT_EVENT, changed);
      window.removeEventListener('online', foreground);
      document.removeEventListener('visibilitychange', foreground);
    };
  }, [owner]);
  const refresh = useCallback(() => coordinator.current?.request(true), []);
  return { rows: snapshot?.owner === owner ? snapshot.rows : [], error, refresh,
    loaded: snapshot?.owner === owner };
}
