'use client';
import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { photos } from '@/lib/photo-client';
import { supabase } from '@/lib/supabase';
import { photoStoragePath } from '@/lib/photo-moderation';
import { PHOTO_REFRESH_EVENT, photoGeneration } from '@/lib/usePhotoState';
// A fresh cache nonce re-checks Storage RLS even after an earlier authorized
// download was cached by the CDN. Pending versions never use public or signed URLs.
export function ProfilePhoto({ src, profileId, alt = '', ...props }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src?: string | null; profileId?: string }) {
  const [loaded, setLoaded] = useState<{ source: string | null | undefined; url: string; epoch: number; profileId?: string } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const ownedBlob = useRef<string | null>(null);
  useEffect(() => () => { if (ownedBlob.current) URL.revokeObjectURL(ownedBlob.current); }, []);
  const element = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(props.loading !== 'lazy');
  useEffect(() => {
    if (inView || !element.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setInView(true); observer.disconnect(); }
    }, { rootMargin: '300px' });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [inView]);
  const [epoch, setEpoch] = useState(photoGeneration);
  useEffect(() => {
    const changed = () => setEpoch(photoGeneration());
    window.addEventListener(PHOTO_REFRESH_EVENT, changed);
    return () => window.removeEventListener(PHOTO_REFRESH_EVENT, changed);
  }, []);
  useEffect(() => {
    if (!inView) return;
    let active = true;
    let blobUrl: string | null = null;
    void (async () => {
      let source = src;
      if (profileId) {
        const { data, error } = await photos.rpc('profile_photo_source', { p_profile: profileId });
        source = error ? null : data;
      }
      if (!source) { if (active) setLoaded(null); return; }
      const path = photoStoragePath(source);
      let url = source;
      if (path) {
        const { data, error } = await supabase.storage.from('profile-photos').download(path, { cacheNonce: crypto.randomUUID() }, { cache: 'no-store' });
        if (!active) return;
        if (error) { setLoaded(null); return; }
        blobUrl = URL.createObjectURL(data); url = blobUrl;
      }
      if (active) {
        const previousBlob = ownedBlob.current;
        ownedBlob.current = blobUrl;
        setLoaded({ source: src, url, epoch, profileId });
        if (previousBlob) URL.revokeObjectURL(previousBlob);
      }
    })();
    return () => { active = false; };
  }, [src, profileId, epoch, inView]);
  // Owners/founders inspect immutable versions: retain their current image while
  // checking access again. Public surfaces clear immediately on invalidation.
  const url = loaded?.source === src && (!profileId || loaded?.epoch === epoch) && loaded?.profileId === profileId && loaded?.url !== failedUrl ? loaded?.url : null;
  if (!url) return <span ref={node => { element.current = node; }} role="img" aria-label={alt || 'Profile photo unavailable'} className={`inline-flex shrink-0 items-center justify-center bg-taupe/20 text-taupe ${props.className ?? ''}`} style={props.style}><svg viewBox="0 0 24 24" className="h-2/3 max-h-24 w-2/3" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3Z"/></svg></span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} ref={node => { element.current = node; }} src={url} alt={alt} onError={() => setFailedUrl(url)} />;
}
