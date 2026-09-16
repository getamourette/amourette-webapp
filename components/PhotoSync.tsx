'use client';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { invalidatePhotos, PHOTO_RESET_EVENT } from '@/lib/usePhotoState';
export function PhotoSync() {
  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let owner: string | null = null;
    let seenRevision: number | null = null;
    let checkSequence = 0;
    async function checkRevision(id: string) {
      const request = ++checkSequence;
      const { data, error } = await supabase.from('photo_invalidation').select('revision').eq('profile_id', id).maybeSingle();
      if (!active || owner !== id || request !== checkSequence) return;
      if (error) { invalidatePhotos(); return; }
      if (!data) return;
      if (typeof data.revision !== 'number' || !Number.isSafeInteger(data.revision) || data.revision < 0) {
        invalidatePhotos();
        return;
      }
      if (seenRevision !== null && seenRevision !== data.revision) invalidatePhotos();
      seenRevision = data.revision;
    }
    function subscribe(id: string | null) {
      if (!active || id === owner) return;
      owner = id;
      checkSequence++;
      seenRevision = null;
      if (channel) void supabase.removeChannel(channel);
      channel = null;
      window.dispatchEvent(new Event(PHOTO_RESET_EVENT));
      invalidatePhotos();
      if (!id) return;
      void checkRevision(id);
      channel = supabase.channel(`photo-sync-${id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'photo_invalidation', filter: `profile_id=eq.${id}` }, () => {
          invalidatePhotos();
          void checkRevision(id);
        })
        .subscribe(status => { if (status === 'SUBSCRIBED') void checkRevision(id); });
    }
    void supabase.auth.getSession().then(({ data }) => subscribe(data.session?.user.id ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => subscribe(session?.user.id ?? null));
    const visible = () => {
      if (document.visibilityState !== 'visible') return;
      invalidatePhotos();
      if (owner) void checkRevision(owner);
    };
    const recover = () => { if (document.visibilityState === 'visible' && owner) void checkRevision(owner); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', visible);
    // Recovery for dropped events; no photo or reason travels in realtime.
    const timer = setInterval(recover, 30000);
    return () => { active = false; subscription.unsubscribe(); if (channel) void supabase.removeChannel(channel); clearInterval(timer); document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', visible); };
  }, []);
  return null;
}
