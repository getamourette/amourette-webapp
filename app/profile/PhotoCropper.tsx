"use client";

import { useCallback, useEffect, useRef, useState, type ComponentProps, type JSX, type RefObject } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { MAX_PHOTO_SOURCE_BYTES, PHOTO_ASPECT, photoCropPixels, centeredRoundCrop, fitPhotoCrop, squarePhotoCrop, samePhotoCrop, type PhotoCrop } from '@/lib/photo-upload';
import { RoundPhoto } from '@/components/RoundPhoto';
import type { ProfileStrings } from '@/lib/strings';
import { PHOTO_ACCEPT } from '@/lib/heic';
import { photoMeasure } from '@/lib/photo-performance';

export function PhotoCropper({ file, imageUrl, strings, onCancel, onConfirm, onChooseAnother, invalidType, tooLarge,
  initialCrop, initialRoundCrop, legacy, pending, validating, preparationError, firstName }: {
  file: File; imageUrl: string; strings: ProfileStrings['crop'];
  onCancel: () => void;
  onConfirm: (file: File, crop: PhotoCrop, previewUrl: string, roundCrop: PhotoCrop, roundPreviewUrl: string, unchanged: boolean) => void;
  onChooseAnother: (file: File) => Promise<string | undefined>; invalidType: string; tooLarge: string;
  initialCrop?: PhotoCrop; initialRoundCrop?: PhotoCrop; legacy?: boolean; pending?: boolean; validating?: boolean; preparationError?: string; firstName: string;
}) {
  const [mode, setMode] = useState<'portrait' | 'round'>('portrait');
  const [mountedAt] = useState(() => performance.now());
  const measuredReady = useRef(false);
  const measuredInteractive = useRef(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<PhotoCrop | undefined>(initialCrop);
  const [roundCrop, setRoundCrop] = useState<PhotoCrop | undefined>(initialRoundCrop);
  const [roundPosition, setRoundPosition] = useState({ x: 0, y: 0 });
  const [roundZoom, setRoundZoom] = useState(1);
  const [rendered, setRendered] = useState<{ url: string; source: string; area: PhotoCrop }>();
  const preview = rendered?.url ?? '';
  const [imageFailed, setImageFailed] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const [selectionError, setSelectionError] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Each mounted mode must restore its coordinates before accepting gestures
  // or zoom; otherwise a late image load can overwrite a fast user change.
  const [editorReady, setEditorReady] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const interactionFrame = useRef<number | null>(null);
  // The library re-derives a restored crop from the rendered media with float
  // and pixel rounding. Until the user moves this mode, keep the exact restored
  // selection so reopening and confirming never drifts the stored crops.
  const touched = useRef(false);
  const active = useRef(false);
  const [nativeSize, setNativeSize] = useState<{ width: number; height: number }>();
  const headerAction = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const round = mode === 'round';
  const aspect = round ? 1 : PHOTO_ASPECT;
  const frameWidth = Math.max(0, Math.min(bounds.width - 24, (bounds.height - 16) * aspect));
  const size = { width: frameWidth, height: frameWidth / aspect };
  const currentZoom = round ? roundZoom : zoom;
  const changeZoom = round ? setRoundZoom : setZoom;
  const ready = Boolean(!interacting && nativeSize && area && rendered?.source === imageUrl && samePhotoCrop(area, rendered.area) && !imageFailed && editorReady);
  useEffect(() => {
    if (ready && !measuredInteractive.current) {
      measuredInteractive.current = true;
      photoMeasure('crop.interactive', mountedAt);
    }
  }, [ready, mountedAt]);
  useEffect(() => {
    if (ready && !validating && !measuredReady.current) {
      measuredReady.current = true;
      photoMeasure('crop.ready', mountedAt);
    }
  }, [ready, validating, mountedAt]);

  const startInteraction = useCallback(() => {
    if (interactionFrame.current !== null) cancelAnimationFrame(interactionFrame.current);
    interactionFrame.current = null;
    touched.current = true;
    setInteracting(true);
    setExportFailed(false);
  }, []);
  const endInteraction = useCallback(() => {
    if (interactionFrame.current !== null) cancelAnimationFrame(interactionFrame.current);
    // The crop library can still have a final drag/pinch frame queued at release.
    // Let that frame and its React update finish before exporting the latest area.
    interactionFrame.current = requestAnimationFrame(() => {
      interactionFrame.current = requestAnimationFrame(() => {
        interactionFrame.current = null;
        setInteracting(false);
      });
    });
  }, []);

  function changeMode(next: typeof mode) {
    if (next === mode) return;
    endInteraction();
    touched.current = false;
    setEditorReady(false);
    setMode(next);
    headerAction.current?.focus();
  }

  const rememberCrop = useCallback((next: Area) => {
    setArea(current => current && samePhotoCrop(current, next) ? current : next);
  }, []);

  useEffect(() => {
    active.current = true;
    const dialog = dialogRef.current;
    const focus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; dialog?.showModal();
    return () => { active.current = false; dialog?.close(); document.body.style.overflow = overflow; if (focus instanceof HTMLElement) focus.focus(); };
  }, []);
  useEffect(() => {
    const surface = stage.current;
    const keyReleased = (event: KeyboardEvent) => {
      if (['+', '=', '-', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) endInteraction();
    };
    // Safari trackpad gestures do not emit the library's interaction callbacks.
    surface?.addEventListener('gesturestart', startInteraction);
    document.addEventListener('gestureend', endInteraction);
    // Also finish gestures released outside the control, cancelled
    // touches, and interactions interrupted by leaving the browser window.
    document.addEventListener('pointerup', endInteraction);
    document.addEventListener('pointercancel', endInteraction);
    document.addEventListener('touchcancel', endInteraction);
    document.addEventListener('keyup', keyReleased);
    window.addEventListener('blur', endInteraction);
    return () => {
      surface?.removeEventListener('gesturestart', startInteraction);
      document.removeEventListener('gestureend', endInteraction);
      document.removeEventListener('pointerup', endInteraction);
      document.removeEventListener('pointercancel', endInteraction);
      document.removeEventListener('touchcancel', endInteraction);
      document.removeEventListener('keyup', keyReleased);
      window.removeEventListener('blur', endInteraction);
      if (interactionFrame.current !== null) cancelAnimationFrame(interactionFrame.current);
    };
  }, [startInteraction, endInteraction]);
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setBounds({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(stage.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    void loadImage(imageUrl).then(image => {
      if (!active) return;
      const width = image.naturalWidth, height = image.naturalHeight;
      const normalized = initialCrop ? fitPhotoCrop(initialCrop, width, height, PHOTO_ASPECT) : undefined;
      setArea(normalized);
      setRoundCrop(initialRoundCrop ? fitPhotoCrop(initialRoundCrop, width, height, 1) : centeredRoundCrop(width, height));
      setNativeSize({ width, height });
    }).catch(() => { if (active) setImageFailed(true); });
    return () => { active = false; };
  }, [imageUrl, initialCrop, initialRoundCrop]);
  useEffect(() => {
    if (!area || interacting) return;
    if (rendered?.source === imageUrl && samePhotoCrop(area, rendered.area)) return;
    let active = true;
    void cropPreview(imageUrl, area).then(blob => {
      if (!active) return;
      setRendered({ url: URL.createObjectURL(blob), source: imageUrl, area }); setExportFailed(false);
    }).catch(() => { if (active) setExportFailed(true); });
    return () => { active = false; };
  }, [imageUrl, area, interacting, rendered]);
  // Keep the accepted preview alive across gestures that need no new export
  // (including round-only edits); release it only on replacement or unmount.
  useEffect(() => () => { if (rendered) URL.revokeObjectURL(rendered.url); }, [rendered]);

  async function chooseAnother(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0]; event.target.value = '';
    if (!next || selecting) return;
    if (!next.size) return setSelectionError(invalidType);
    if (next.size > MAX_PHOTO_SOURCE_BYTES) return setSelectionError(tooLarge);
    setSelecting(true);
    try { const error = await onChooseAnother(next); if (active.current && error) setSelectionError(error); }
    finally { if (active.current) setSelecting(false); }
  }
  async function confirm() {
    if (!round || !ready || validating || !area || !nativeSize || confirming) return;
    setConfirming(true);
    // The caller owns this URL; the dialog owns and releases its live preview.
    try {
      const blob = await fetch(preview).then(response => response.blob());
      const selectedRound = roundCrop ?? centeredRoundCrop(nativeSize.width, nativeSize.height);
      const roundBlob = await cropPreview(imageUrl, selectedRound);
      // Both modes still match the restored crops: the caller can treat this as a no-op.
      const unchanged = Boolean(initialCrop && initialRoundCrop
        && samePhotoCrop(area, fitPhotoCrop(initialCrop, nativeSize.width, nativeSize.height, PHOTO_ASPECT))
        && samePhotoCrop(selectedRound, fitPhotoCrop(initialRoundCrop, nativeSize.width, nativeSize.height, 1)));
      if (active.current) onConfirm(file, area, URL.createObjectURL(blob), selectedRound, URL.createObjectURL(roundBlob), unchanged);
    } catch { if (active.current) setExportFailed(true); }
    finally { if (active.current) setConfirming(false); }
  }
  return <dialog ref={dialogRef} aria-modal="true" aria-labelledby="photo-crop-title" aria-describedby="photo-crop-help"
    onCancel={event => { event.preventDefault(); onCancel(); }}
    onKeyDown={event => {
      if (!editorReady || confirming) return;
      if (event.key === 'Tab') endInteraction();
      if (event.key === '+' || event.key === '=') { event.preventDefault(); startInteraction(); changeZoom(value => Math.min(3, value + 0.1)); }
      if (event.key === '-') { event.preventDefault(); startInteraction(); changeZoom(value => Math.max(1, value - 0.1)); }
    }}
    className="fixed inset-0 m-0 flex h-[100dvh] max-h-none w-full max-w-none flex-col overflow-y-auto border-0 bg-velvet p-0 text-cream">
    <header className="shrink-0 px-4 pb-4 pt-[max(.75rem,env(safe-area-inset-top))] text-center">
      <div className="relative px-11">
        <button ref={headerAction} type="button" autoFocus aria-label={round ? strings.back : strings.cancel}
          disabled={confirming} onClick={() => round ? changeMode('portrait') : onCancel()}
          className="absolute left-0 top-0 flex min-h-11 min-w-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-champagne">
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d={round ? 'm15 6-6 6 6 6' : 'm6 6 12 12M18 6 6 18'} />
          </svg>
        </button>
        <p className="night-kicker text-taupe">{round ? strings.roundKicker : strings.kicker}</p>
        <h2 id="photo-crop-title" className="mt-2 font-display text-2xl italic leading-tight">{round ? strings.roundTitle : strings.title}</h2>
      </div>
      {pending && <p className="mt-2 text-xs text-champagne">{strings.pending}</p>}
      {legacy && <p className="mx-auto mt-2 max-w-sm text-xs text-taupe">{strings.legacy}</p>}
    </header>
    <div ref={stage} className="relative flex min-h-32 flex-1 items-center justify-center overflow-hidden bg-bordeaux-deep">
      {/* Wheel zoom reports its interaction start only after emitting the new
          area, so mark the mode as touched before the library sees the event. */}
      <div className="relative shrink-0 overflow-hidden" style={size} inert={!editorReady || confirming}
        onWheelCapture={() => { touched.current = true; }}>
        {size.width > 0 && nativeSize && <StableCropper key={mode} image={imageUrl} touched={touched}
          onReady={() => setEditorReady(true)}
          crop={round ? roundPosition : crop} zoom={currentZoom} aspect={round ? 1 : PHOTO_ASPECT}
          cropSize={size} minZoom={1} maxZoom={3} objectFit={nativeSize.width / nativeSize.height < aspect ? "horizontal-cover" : "vertical-cover"} cropShape={round ? 'round' : 'rect'} showGrid={!round}
          initialCroppedAreaPercentages={round ? roundCrop : area}
          onCropChange={round ? setRoundPosition : setCrop} onZoomChange={changeZoom}
          onInteractionStart={startInteraction} onInteractionEnd={endInteraction}
          onCropComplete={round ? next => {
            setRoundCrop(squarePhotoCrop(next, nativeSize.width, nativeSize.height));
          } : rememberCrop}
          classes={{ cropAreaClassName: 'paramour-crop-area' }}
          mediaProps={{ alt: strings.imageAlt, onError: () => setImageFailed(true) }} />}
      </div>
      {round && nativeSize && <div className="pointer-events-none absolute inset-x-4 bottom-3 mx-auto flex max-w-sm items-center gap-3 rounded-2xl border border-champagne/15 bg-velvet/95 p-3">
        <RoundPhoto src={imageUrl} crop={roundCrop} className="h-12 w-12" />
        <div className="min-w-0">
          <p className="truncate font-display text-lg italic">{firstName}</p>
          <p className="text-xs leading-relaxed text-taupe">{strings.context}</p>
        </div>
      </div>}
    </div>
    <div className="shrink-0 bg-bordeaux px-5 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-4">
      <p id="photo-crop-help" role={preparationError || selectionError || exportFailed || imageFailed ? 'alert' : validating || !ready && !interacting ? 'status' : undefined} className="text-center text-xs text-taupe">
        {preparationError || selectionError || (imageFailed ? strings.loadFailed : exportFailed ? strings.exportFailed : validating || !ready && !interacting ? strings.processing : round ? strings.roundHelp : strings.help)}
      </p>
      <button type="button" disabled={!ready || validating || confirming || selecting}
        onClick={() => round ? void confirm() : changeMode('round')}
        className="night-button night-button-primary mt-4 min-h-12 w-full px-5 py-3 disabled:opacity-50">
        {confirming ? strings.processing : round ? strings.usePhoto : strings.next}
      </button>
      {!round && <label className="relative mx-auto mt-1 flex min-h-11 w-fit cursor-pointer items-center text-xs underline underline-offset-4 focus-within:outline-2 focus-within:outline-champagne">
        {strings.chooseAnother}<input type="file" disabled={selecting || validating || confirming} accept={PHOTO_ACCEPT} className="sr-only" onChange={chooseAnother} />
      </label>}
    </div>
  </dialog>;
}
// react-easy-crop emits before applying initial percentages, and its restored
// area is re-derived with rounding. A restored mode therefore reports areas only
// once the user moves it; a fresh selection reports the library's area directly.
// setInitialCrop dispatches the restored crop and zoom before onMediaLoaded, so
// readiness commits with them and no gesture can start from stale coordinates.
function StableCropper({ onReady, touched, ...props }: JSX.LibraryManagedAttributes<typeof Cropper, ComponentProps<typeof Cropper>> & { onReady: () => void; touched: RefObject<boolean> }) {
  const [initial] = useState(props.initialCroppedAreaPercentages);
  const loaded = useRef(false);
  const pending = useRef<Parameters<NonNullable<typeof props.onCropComplete>> | null>(null);
  return <Cropper {...props} initialCroppedAreaPercentages={initial}
    onCropComplete={(...args) => {
      pending.current = args;
      if (loaded.current && (!initial || touched.current)) props.onCropComplete?.(...args);
    }}
    onMediaLoaded={media => {
      props.onMediaLoaded?.(media);
      loaded.current = true;
      if (!initial && pending.current) props.onCropComplete?.(...pending.current);
      onReady();
    }} />;
}

// This small bitmap is only a local display preview. Upload the original file
// and crop coordinates; the server extracts native pixels and stores losslessly.
export async function cropPreview(imageUrl: string, area: PhotoCrop) {
  const image = await loadImage(imageUrl);
  const started = performance.now();
  const source = photoCropPixels(area, image.naturalWidth, image.naturalHeight);
  const cached = previewCache.get(image) ?? [];
  const existing = cached.find(entry => entry.source.left === source.left && entry.source.top === source.top && entry.source.width === source.width && entry.source.height === source.height);
  if (existing) return existing.blob;
  const scale = Math.min(1, 1440 / source.width, 2560 / source.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  context.drawImage(image, source.left, source.top, source.width, source.height, 0, 0, canvas.width, canvas.height);
  const blob = new Promise<Blob>((resolve, reject) => canvas.toBlob(
    blob => { photoMeasure('crop.preview', started); if (blob) resolve(blob); else reject(new Error("Preview failed")); }, "image/png"
  ));
  // Retain only two display previews (normally portrait and round), including
  // in-flight work. Gesture histories must not accumulate bitmap allocations.
  const entry = { source, blob };
  previewCache.set(image, [...cached.slice(-1), entry]);
  void blob.catch(() => previewCache.set(image, (previewCache.get(image) ?? []).filter(current => current !== entry)));
  return blob;
}

export async function roundPreview(imageUrl: string, crop?: PhotoCrop) {
  const image = await loadImage(imageUrl);
  const area = crop ?? centeredRoundCrop(image.naturalWidth, image.naturalHeight);
  return { crop: area, blob: await cropPreview(imageUrl, area) };
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();
const previewCache = new WeakMap<HTMLImageElement, { source: ReturnType<typeof photoCropPixels>; blob: Promise<Blob> }[]>();

// The mounted profile page owns source URLs and releases them on replacement,
// account/revision changes and unmount. A candidate never replaces its accepted cache.
export function releasePhotoPreview(src: string) {
  imageCache.delete(src);
  URL.revokeObjectURL(src);
}

// Try actual decoder capability, never a user-agent guess. The original remains
// unchanged and the server still validates it before crop confirmation. Share
// this loaded image with the cropper instead of decoding a second object URL.
export async function nativePhotoPreview(file: File, signal: AbortSignal) {
  signal.throwIfAborted();
  const url = URL.createObjectURL(file);
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    const loading = loadNativeImage(url);
    imageCache.set(url, loading);
    const image = await Promise.race([loading, new Promise<never>((_, reject) => {
      abort = () => reject(new Error('cancelled'));
      signal.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => reject(new Error('native_load_timeout')), 2500);
    })]);
    signal.throwIfAborted();
    if (image.naturalWidth * image.naturalHeight > 25_000_000) throw new Error('invalid_photo');
    photoMeasure('prepare.native-load', started);
    return { url, width: image.naturalWidth, height: image.naturalHeight };
  } catch {
    releasePhotoPreview(url);
    signal.throwIfAborted();
    return undefined;
  } finally {
    clearTimeout(timer);
    if (abort) signal.removeEventListener('abort', abort);
  }
}

function loadNativeImage(src: string): Promise<HTMLImageElement> {
  const started = performance.now();
  const image = new Image();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      image.removeEventListener('load', loaded);
      image.removeEventListener('error', failed);
    };
    const failed = () => { cleanup(); reject(new Error('Photo could not be loaded')); };
    const loaded = () => {
      cleanup();
      if (!image.naturalWidth || !image.naturalHeight) return failed();
      photoMeasure('crop.load', started, { width: image.naturalWidth, height: image.naturalHeight });
      resolve(image);
    };
    image.addEventListener('load', loaded);
    image.addEventListener('error', failed);
    image.src = src;
    // On the reporting iPhone load fires in 11 ms, while explicit decode() takes
    // 3.43 s. Let native display/canvas choose their decoding path. Cached sources
    // reuse this image; PNG/saved-source loading retains its decode() fallback.
    if (image.complete) { if (image.naturalWidth) loaded(); else failed(); }
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return cached;
  const loading = decodeImage(src);
  imageCache.set(src, loading);
  void loading.catch(() => { if (imageCache.get(src) === loading) imageCache.delete(src); });
  return loading;
}

async function decodeImage(src: string) {
  const started = performance.now();
  const image = new Image();
  image.src = src;
  // Wait for usable pixels, retaining the image across the await. Reopening a
  // cached original must not depend on a detached image's load notification.
  await image.decode();
  photoMeasure('crop.decode', started, { width: image.naturalWidth, height: image.naturalHeight });
  if (!image.naturalWidth || !image.naturalHeight) throw new Error("Photo could not be loaded");
  return image;
}
