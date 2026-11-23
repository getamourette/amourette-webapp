'use client';
import { useContext, useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { PHOTO_ROUND_BUCKET, isPhotoCrop, samePhotoCrop, type PhotoCrop } from '@/lib/photo-upload';
import { roundPhotoStyle } from './RoundPhoto';
import { photos } from '@/lib/photo-client';
import { downloadPhoto, PhotoReviewDownloads } from './PhotoReviewImages';
import { photoStoragePath } from '@/lib/photo-moderation';
import { PHOTO_REFRESH_EVENT, PHOTO_RESET_EVENT, photoGeneration, requestPhotoRetry } from '@/lib/usePhotoState';
export function ProfilePhoto({ src, profileId, ownProfileSource = false, circular = false, roundCrop, roundPath, alt = '', ...props }: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src?: string | null; profileId?: string; ownProfileSource?: boolean; circular?: boolean; roundCrop?: PhotoCrop; roundPath?: string }) {
  const reviewDownload = useContext(PhotoReviewDownloads);
  type LoadedPhoto = { source: string | null | undefined; assetKey: string | null; url: string; blobUrl: string | null; roundCrop?: PhotoCrop; profileId?: string };
  const [loaded, setLoaded] = useState<LoadedPhoto | null>(null);
  const cached = useRef<LoadedPhoto | null>(null);
  const transfer = useRef<AbortController | null>(null);
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
    const reset = () => {
      transfer.current?.abort();
      cached.current = null;
      setLoaded(null);
    };
    window.addEventListener(PHOTO_REFRESH_EVENT, changed);
    window.addEventListener(PHOTO_RESET_EVENT, reset);
    return () => {
      window.removeEventListener(PHOTO_REFRESH_EVENT, changed);
      window.removeEventListener(PHOTO_RESET_EVENT, reset);
    };
  }, []);
  useEffect(() => {
    if (!inView) return;
    const controller = new AbortController();
    transfer.current = controller;
    const isCurrent = () => !controller.signal.aborted && epoch === photoGeneration();
    const commit = (photo: LoadedPhoto | null) => {
      cached.current = photo;
      setLoaded(photo);
    };
    const usesPresentation = Boolean(profileId && (!ownProfileSource || circular));
    let blobUrl: string | null = null;
    void (async () => {
      try {
        let deniedSource: string | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          let source = src;
          let crop = roundCrop;
          let roundSource = circular ? roundPath : undefined;
          // The owner's profile query already returned this path. Storage still
          // checks authorization on every private download.
          if (profileId && usesPresentation) {
            const readPresentation = async () => {
              if (!deniedSource) return photos.rpc('profile_photo_presentation', { p_profile: profileId }).abortSignal(controller.signal);
              const recheck = new AbortController();
              const abort = () => recheck.abort();
              controller.signal.addEventListener('abort', abort, { once: true });
              const timeout = setTimeout(abort, 5000);
              try {
                return await photos.rpc('profile_photo_presentation', { p_profile: profileId }).abortSignal(recheck.signal);
              } finally {
                clearTimeout(timeout);
                controller.signal.removeEventListener('abort', abort);
              }
            };
            const { data, error, status } = await readPresentation();
            if (!isCurrent()) return;
            if (error && (status === 0 || status === 408 || status === 429 || status >= 500)) {
              requestPhotoRetry();
              if (deniedSource) commit(null);
              return;
            }
            const presentation = !error && data && typeof data === 'object' && !Array.isArray(data) ? data : null;
            source = typeof presentation?.source === 'string' ? presentation.source : null;
            crop = isPhotoCrop(presentation?.roundCrop) ? presentation.roundCrop : undefined;
            roundSource = circular && typeof presentation?.roundSource === 'string' ? presentation.roundSource : undefined;
          }
          if (!source) { if (isCurrent()) commit(null); return; }
          if (roundSource) { source = roundSource; crop = undefined; }
          // A refused old path may have been superseded between projection and
          // download. Only a fresh, different authorized path can replace it.
          if (source === deniedSource) { commit(null); return; }
          const path = photoStoragePath(source);
          const bucket = roundSource ? PHOTO_ROUND_BUCKET : 'profile-photos';
          const assetKey = path ? `${bucket}/${path}` : null;
          const previous = cached.current;
          // The RPC just authorized this immutable path for this profile. Keep
          // bytes only in this mount and still check the projection on refresh.
          if (usesPresentation && assetKey && previous?.assetKey === assetKey && previous.profileId === profileId) {
            if (previous.source !== src || (crop && previous.roundCrop ? !samePhotoCrop(crop, previous.roundCrop) : crop !== previous.roundCrop)) {
              commit({ ...previous, source: src, roundCrop: crop });
            }
            return;
          }
          let url = source;
          if (path) {
            const data = await (reviewDownload && !profileId && !roundSource
              ? reviewDownload(path, epoch)
              : downloadPhoto(path, bucket, controller.signal)).catch(() => undefined);
            if (!isCurrent()) return;
            if (data === undefined) {
              requestPhotoRetry();
              if (!profileId || deniedSource) commit(null);
              return;
            }
            if (!data) {
              if (attempt === 0 && usesPresentation) {
                deniedSource = source;
                continue;
              }
              commit(null); return;
            }
            blobUrl = URL.createObjectURL(data); url = blobUrl;
          }
          // Decode off-screen so a changed source never replaces a ready image
          // with an image whose bytes have not been decoded yet.
          const image = new Image();
          image.src = url;
          await image.decode();
          if (isCurrent()) {
            commit({ source: src, assetKey, url, blobUrl, profileId, roundCrop: crop });
            blobUrl = null; // The committed state now owns this URL.
          }
          return;
        }
      } catch {
        if (isCurrent()) commit(null);
      } finally {
        // A superseded/unmounted request must not leak or publish its bytes.
        if (blobUrl) URL.revokeObjectURL(blobUrl);
      }
    })();
    return () => controller.abort();
  }, [src, profileId, ownProfileSource, circular, roundCrop, roundPath, epoch, inView, reviewDownload]);
  // A refresh is a request to check access, not evidence that access was revoked.
  // Retain only this profile's image; explicit removal still clears immediately.
  const sameSource = profileId ? src !== null : loaded?.source === src;
  const url = sameSource && loaded?.profileId === profileId && loaded?.url !== failedUrl ? loaded?.url : null;
  if (!url) return <span ref={node => { element.current = node; }} role="img" aria-label={alt || 'Profile photo unavailable'} className={`inline-flex shrink-0 items-center justify-center bg-taupe/20 text-taupe ${props.className ?? ''}`} style={props.style}><svg viewBox="0 0 24 24" className="h-2/3 max-h-24 w-2/3" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3Z"/></svg></span>;
  const failed = () => {
    if (cached.current?.url === url) cached.current = null;
    setFailedUrl(url);
  };
  if (circular && loaded?.roundCrop) return <span ref={node => { element.current = node; }} className={`relative inline-block shrink-0 overflow-hidden rounded-full ${props.className ?? ''}`} style={props.style}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img {...props} className="" style={roundPhotoStyle(loaded.roundCrop)} src={url} alt={alt} onError={failed} />
  </span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} ref={node => { element.current = node; }} src={url} alt={alt} onError={failed} />;
}
