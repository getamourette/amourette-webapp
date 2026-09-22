'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { nameNoticeKey, parseNameNotice, pruneNameNotices, shouldShowNameNotice } from './name-notice';
import type { Database } from './database.types';

export type ChatPartnerState = Database['public']['Functions']['chat_partner_state']['Returns'][number];

// The visit state is independent of partner refreshes. Receipts run in an effect
// after the notice has committed to the DOM, and only while the document is visible.
export function useChatNameNotice(matchId: string, ownerId: string | undefined, partner: ChatPartnerState | null, ready: boolean) {
  const [visit, setVisit] = useState<{ key: string; correctionId: string } | null>(null);
  const [visible, setVisible] = useState(false);
  const key = ownerId ? nameNoticeKey(ownerId, matchId) : '';
  useEffect(() => {
    const sync = () => {
      setVisible(document.visibilityState === 'visible');
      try { pruneNameNotices(localStorage); } catch { /* Storage can be disabled. */ }
    };
    sync(); document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);
  useEffect(() => {
    if (!ready || !visible || !key || !partner || Date.parse(partner.expires_at) <= Date.now()) return;
    let local: string | null = null;
    try { local = parseNameNotice(localStorage.getItem(key))?.correctionId ?? null; } catch { /* Server receipt remains authoritative. */ }
    if (shouldShowNameNotice(partner.correction_id, partner.seen_correction_id, local)) {
      // Schedule on the next visible frame; hidden refreshes never consume a notice.
      const frame = requestAnimationFrame(() => {
        if (document.visibilityState !== 'visible') return;
        setVisit(previous => previous?.key === key && previous.correctionId === partner.correction_id
          ? previous : { key, correctionId: partner.correction_id! });
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [key, partner, ready, visible]);
  const showing = ready && visit?.key === key;
  useEffect(() => {
    if (!showing || !visible || !visit || !partner || !ownerId || document.visibilityState !== 'visible') return;
    // Do not acknowledge a newer refresh until that version was rendered.
    if (visit.correctionId !== partner.correction_id || Date.parse(partner.expires_at) <= Date.now()) return;
    try {
      localStorage.setItem(key, JSON.stringify({ correctionId: visit.correctionId, expiresAt: Date.parse(partner.expires_at) }));
    } catch { /* Keep the visible notice even if local persistence is unavailable. */ }
    if (partner.seen_correction_id === visit.correctionId) return;
    void supabase.rpc('acknowledge_name_correction', { p_match_id: matchId, p_correction_id: visit.correctionId }).then(() => {});
  }, [key, matchId, ownerId, partner, showing, visible, visit]);
  useEffect(() => {
    if (!key || !partner) return;
    const remaining = Date.parse(partner.expires_at) - Date.now();
    const clear = () => { try { localStorage.removeItem(key); pruneNameNotices(localStorage); } catch { /* Storage unavailable. */ } };
    if (remaining <= 0) { clear(); return; }
    const timer = window.setTimeout(clear, Math.min(remaining, 2_147_483_647));
    return () => {
      window.clearTimeout(timer);
      if (Date.parse(partner.expires_at) <= Date.now()) clear();
    };
  }, [key, partner]);
  return showing;
}
