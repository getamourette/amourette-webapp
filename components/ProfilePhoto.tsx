'use client';
import { useContext, useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { photos } from '@/lib/photo-client';
import { downloadPhoto, PhotoReviewDownloads } from './PhotoReviewImages';
import { photoStoragePath } from '@/lib/photo-moderation';
import { PHOTO_REFRESH_EVENT, PHOTO_RESET_EVENT, photoGeneration } from '@/lib/usePhotoState';
// A fresh cache nonce re-checks Storage RLS even after an earlier authorized
// download was cached by the CDN. Pending versions never use public or signed URLs.
export function ProfilePhoto({ src, profileId, alt = '', ...props }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src?: string | null; profileId?: string }) {
  const reviewDownload = useContext(PhotoReviewDownloads);
  const [loaded, setLoaded] = useState<{ source: string | null | undefined; url: string; blobUrl: string | null; profileId?: string } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  // Release the previous bytes after React has committed their replacement.
  const displayedBlob = loaded?.blobUrl;
  useEffect(() => () => { if (displayedBlob) URL.revokeObjectURL(displayedBlob); }, [displayedBlob]);
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
    const reset = () => setLoaded(null);
    window.addEventListener(PHOTO_REFRESH_EVENT, changed);
    window.addEventListener(PHOTO_RESET_EVENT, reset);
    return () => {
      window.removeEventListener(PHOTO_REFRESH_EVENT, changed);
      window.removeEventListener(PHOTO_RESET_EVENT, reset);
    };
  }, []);
  useEffect(() => {
    if (!inView) return;
    let active = true;
    const generation = photoGeneration();
    const isCurrent = () => active && generation === photoGeneration();
    let blobUrl: string | null = null;
    void (async () => {
      try {
        let source = src;
        if (profileId) {
          const { data, error, status } = await photos.rpc('profile_photo_source', { p_profile: profileId });
          if (!isCurrent()) return;
          if (error && (status === 0 || status === 408 || status === 429 || status >= 500)) return;
          source = error ? null : data;
        }
        if (!source) { if (isCurrent()) setLoaded(null); return; }
        const path = photoStoragePath(source);
        let url = source;
        if (path) {
          const data = await (reviewDownload && !profileId ? reviewDownload(path, epoch) : downloadPhoto(path)).catch(() => undefined);
          if (!isCurrent()) return;
          if (data === undefined && profileId) return;
          if (!data) { setLoaded(null); return; }
          blobUrl = URL.createObjectURL(data); url = blobUrl;
        }
        // Decode off-screen so a changed source never replaces a ready image
        // with an image whose bytes have not been decoded yet.
        const image = new Image();
        image.src = url;
        await image.decode();
        if (isCurrent()) {
          setLoaded({ source: src, url, blobUrl, profileId });
          blobUrl = null; // The committed state now owns this URL.
        }
      } catch {
        if (isCurrent()) setLoaded(null);
      } finally {
        // A superseded/unmounted request must not leak or publish its bytes.
        if (blobUrl) URL.revokeObjectURL(blobUrl);
      }
    })();
    return () => { active = false; };
  }, [src, profileId, epoch, inView, reviewDownload]);
  // A refresh is a request to check access, not evidence that access was revoked.
  // Retain only this profile's image; explicit removal still clears immediately.
  const sameSource = profileId ? src !== null : loaded?.source === src;
  const url = sameSource && loaded?.profileId === profileId && loaded?.url !== failedUrl ? loaded?.url : null;
  if (!url) return <span ref={node => { element.current = node; }} role="img" aria-label={alt || 'Profile photo unavailable'} className={`inline-flex shrink-0 items-center justify-center bg-taupe/20 text-taupe ${props.className ?? ''}`} style={props.style}><svg viewBox="0 0 24 24" className="h-2/3 max-h-24 w-2/3" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3Z"/></svg></span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} ref={node => { element.current = node; }} src={url} alt={alt} onError={() => setFailedUrl(url)} />;
}
