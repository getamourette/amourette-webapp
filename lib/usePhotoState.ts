'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { photos } from './photo-client';
import type { PhotoState, PhotoVersion } from './photo-moderation';
import { PHOTO_REFRESH_EVENT, requestPhotoRetry } from './photo-refresh';
export { PHOTO_REFRESH_EVENT, PHOTO_RESET_EVENT, photoGeneration, invalidatePhotos, requestPhotoRetry, retryPhotosIfNeeded } from './photo-refresh';
export function usePhotoState(userId: string | null) {
  const [state, setState] = useState<PhotoState | null>(null);
  const [versions, setVersions] = useState<PhotoVersion[]>([]);
  const [error, setError] = useState(false);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    if (!userId) return;
    const result = await photos.from('photo_state').select('profile_id, displayed_id, pending_id, correction_required, reason, last_action, last_reason, revision, updated_at').eq('profile_id', userId).maybeSingle().returns<PhotoState>();
    if (request !== sequence.current) return;
    if (result.error) {
      if (result.status === 0 || result.status === 408 || result.status === 429 || result.status >= 500) requestPhotoRetry();
      setError(true);
      return;
    }
    const ids = [result.data?.displayed_id, result.data?.pending_id].filter((id): id is string => Boolean(id));
    const files = ids.length ? await photos.from('photo_versions').select('id, profile_id, path, status, created_at, round_crop, round_path, round_source_crop').in('id', ids).returns<PhotoVersion[]>() : { data: [], error: null };
    if (request !== sequence.current) return;
    if (files.error && (files.status === 0 || files.status === 408 || files.status === 429 || files.status >= 500)) requestPhotoRetry();
    setError(Boolean(files.error));
    setState(result.data); setVersions(files.data ?? []);
  }, [userId]);
  useEffect(() => {
    void (async () => { await refresh(); })();
    window.addEventListener(PHOTO_REFRESH_EVENT, refresh);
    const requests = sequence;
    return () => { requests.current++; window.removeEventListener(PHOTO_REFRESH_EVENT, refresh); };
  }, [refresh]);
  return { state: state?.profile_id === userId ? state : null, versions: versions.filter(version => version.profile_id === userId), error, refresh };
}
