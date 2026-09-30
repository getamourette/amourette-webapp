'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { PHOTO_REFRESH_EVENT } from '@/lib/photo-refresh';
import { parseMatchingConsentState, type MatchingConsentState } from '@/lib/matching-consent';

export function useMatchingConsent(userId: string | null) {
  const [state, setState] = useState<MatchingConsentState | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const request = useRef<AbortController | null>(null);
  const adopt = useCallback((next: MatchingConsentState) => {
    // Supersede any read started before this confirmed mutation.
    request.current?.abort();
    setState(next); setVerified(true); setLoading(false);
  }, []);
  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setVerified(false); setLoading(true);
    if (!userId) { setState(null); setLoading(false); return; }
    const transport = new AbortController();
    const cancel = () => transport.abort();
    controller.signal.addEventListener('abort', cancel, { once: true });
    const timeout = window.setTimeout(cancel, 15_000);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (controller.signal.aborted) return;
      if (session?.user.id !== userId) { setState(null); throw new Error('Session changed'); }
      const { data, error } = await supabase.rpc('get_my_matching_consent')
        .abortSignal(transport.signal).single();
      if (transport.signal.aborted) throw new Error('Consent read cancelled');
      if (error) throw error;
      const next = parseMatchingConsentState(data);
      if (controller.signal.aborted) return;
      setState(next); setVerified(true);
    } catch {
      // Retain the last confirmed display, but disable commands until verified.
      if (!controller.signal.aborted) setVerified(false);
    } finally {
      window.clearTimeout(timeout);
      controller.signal.removeEventListener('abort', cancel);
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [userId]);
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== userId) {
        request.current?.abort(); setState(null); setVerified(false); setLoading(false);
      }
    });
    const recover = () => { if (document.visibilityState === 'visible') void refresh(); };
    // #282's participant sync also emits PHOTO_REFRESH_EVENT for compatibility.
    window.addEventListener(PHOTO_REFRESH_EVENT, recover);
    window.addEventListener('focus', recover); window.addEventListener('online', recover);
    document.addEventListener('visibilitychange', recover);
    const poll = window.setInterval(recover, 30_000);
    return () => {
      request.current?.abort(); subscription.unsubscribe(); window.clearTimeout(initial); window.clearInterval(poll);
      window.removeEventListener(PHOTO_REFRESH_EVENT, recover);
      window.removeEventListener('focus', recover); window.removeEventListener('online', recover);
      document.removeEventListener('visibilitychange', recover);
    };
  }, [refresh, userId]);
  return { state, verified, loading, refresh, adopt };
}
