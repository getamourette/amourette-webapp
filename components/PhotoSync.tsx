'use client';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { invalidatePhotos } from '@/lib/usePhotoState';
export function PhotoSync() {
  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let owner: string | null = null;
    function subscribe(id: string | null) {
      if (!active || id === owner) return;
      owner = id;
      if (channel) void supabase.removeChannel(channel);
      channel = null;
      invalidatePhotos();
      if (!id) return;
      channel = supabase.channel(`photo-sync-${id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'photo_invalidation', filter: `profile_id=eq.${id}` }, invalidatePhotos)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'venue_night_public_state' }, invalidatePhotos)
        .subscribe(status => { if (status === 'SUBSCRIBED') invalidatePhotos(); });
    }
    void supabase.auth.getSession().then(({ data }) => subscribe(data.session?.user.id ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => subscribe(session?.user.id ?? null));
    const visible = () => { if (document.visibilityState === 'visible') invalidatePhotos(); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', invalidatePhotos);
    // Recovery for dropped events; no photo or reason travels in realtime.
    const timer = setInterval(visible, 30000);
    return () => { active = false; subscription.unsubscribe(); if (channel) void supabase.removeChannel(channel); clearInterval(timer); document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', invalidatePhotos); };
  }, []);
  return null;
}
