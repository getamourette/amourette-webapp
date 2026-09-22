"use client";

import { useCallback, useEffect, useRef, useState, type ComponentProps, type JSX } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { MAX_PHOTO_SOURCE_BYTES, PHOTO_ASPECT, photoCropPixels, centeredRoundCrop, fitPhotoCrop, squarePhotoCrop, samePhotoCrop, type PhotoCrop } from '@/lib/photo-upload';
import { FeedPhotoPreview } from '@/components/FeedPhotoPreview';
import { RoundPhoto } from '@/components/RoundPhoto';
import type { ProfileStrings } from '@/lib/strings';

export function PhotoCropper({ file, imageUrl, strings, onCancel, onConfirm, onChooseAnother, invalidType, tooLarge,
  initialCrop, initialRoundCrop, legacy, pending, firstName, bio }: {
  file: File; imageUrl: string; strings: ProfileStrings['crop'];
  onCancel: () => void;
  onConfirm: (file: File, crop: PhotoCrop, previewUrl: string, roundCrop: PhotoCrop, roundPreviewUrl: string) => void;
  onChooseAnother: (file: File) => void; invalidType: string; tooLarge: string;
  initialCrop?: PhotoCrop; initialRoundCrop?: PhotoCrop; legacy?: boolean; pending?: boolean; firstName: string; bio: string;
}) {
  const [mode, setMode] = useState<'portrait' | 'round' | 'preview'>('portrait');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<PhotoCrop | undefined>(initialCrop);
  const [roundCrop, setRoundCrop] = useState<PhotoCrop | undefined>(initialRoundCrop);
  const [roundPosition, setRoundPosition] = useState({ x: 0, y: 0 });
  const [roundZoom, setRoundZoom] = useState(1);
  const [preview, setPreview] = useState('');
  const [previewArea, setPreviewArea] = useState<PhotoCrop>();
  const [imageFailed, setImageFailed] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const [selectionError, setSelectionError] = useState('');
  const [confirming, setConfirming] = useState(false);
  // Each mounted mode must restore its coordinates before accepting gestures
  // or zoom; otherwise a late image load can overwrite a fast user change.
  const [editorReady, setEditorReady] = useState(false);
  const active = useRef(false);
  const [nativeSize, setNativeSize] = useState<{ width: number; height: number }>();
  const [reset, setReset] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const round = mode === 'round';
  const aspect = round ? 1 : PHOTO_ASPECT;
  const frameWidth = Math.max(0, Math.min(bounds.width - 24, (bounds.height - 16) * aspect));
  const size = { width: frameWidth, height: frameWidth / aspect };
  const currentZoom = round ? roundZoom : zoom;
  const changeZoom = round ? setRoundZoom : setZoom;
  const ready = Boolean(nativeSize && preview && area && previewArea && samePhotoCrop(area, previewArea) && !imageFailed && (mode === 'preview' || editorReady));

  function changeMode(next: typeof mode) {
    if (next === mode) return;
    setEditorReady(false);
    setMode(next);
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
    if (!area) return;
    let active = true; let url = '';
    void cropPreview(imageUrl, area).then(blob => {
      if (!active) return;
      url = URL.createObjectURL(blob); setPreview(url); setPreviewArea(area); setExportFailed(false);
    }).catch(() => { if (active) setExportFailed(true); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [imageUrl, area]);

  function chooseAnother(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0]; event.target.value = '';
    if (!next) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(next.type) || !next.size) return setSelectionError(invalidType);
    if (next.size > MAX_PHOTO_SOURCE_BYTES) return setSelectionError(tooLarge);
    onChooseAnother(next);
  }
  async function confirm() {
    if (!ready || !area || !nativeSize || confirming) return;
    setConfirming(true);
    // The caller owns this URL; the dialog owns and releases its live preview.
    try {
      const blob = await fetch(preview).then(response => response.blob());
      const selectedRound = roundCrop ?? centeredRoundCrop(nativeSize.width, nativeSize.height);
      const roundBlob = await cropPreview(imageUrl, selectedRound);
      if (active.current) onConfirm(file, area, URL.createObjectURL(blob), selectedRound, URL.createObjectURL(roundBlob));
    } catch { if (active.current) setExportFailed(true); }
    finally { if (active.current) setConfirming(false); }
  }
  function resetCrop() {
    setEditorReady(false);
    if (round) { setRoundCrop(nativeSize ? centeredRoundCrop(nativeSize.width, nativeSize.height) : undefined); setRoundPosition({ x: 0, y: 0 }); setRoundZoom(1); }
    else { setCrop({ x: 0, y: 0 }); setZoom(1); setArea(undefined); }
    setReset(value => value + 1);
  }
  return <dialog ref={dialogRef} aria-modal="true" aria-labelledby="photo-crop-title" aria-describedby="photo-crop-help"
    onCancel={event => { event.preventDefault(); onCancel(); }}
    onKeyDown={event => {
      if (mode === 'preview' || !editorReady) return;
      if (event.key === '+' || event.key === '=') { event.preventDefault(); changeZoom(value => Math.min(3, value + 0.1)); }
      if (event.key === '-') { event.preventDefault(); changeZoom(value => Math.max(1, value - 0.1)); }
    }}
    className="fixed inset-0 m-0 flex h-[100dvh] max-h-none w-full max-w-none flex-col overflow-y-auto border-0 bg-velvet p-0 text-cream">
    <header className="shrink-0 px-4 pb-2 pt-[max(.75rem,env(safe-area-inset-top))] text-center">
      <h2 id="photo-crop-title" className="font-display text-xl italic">{round ? strings.roundTitle : strings.title}</h2>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button type="button" autoFocus onClick={onCancel} className="night-button night-button-secondary min-h-11 px-3 text-xs">{strings.cancel}</button>
        <button type="button" disabled={!ready || confirming} onClick={() => void confirm()} className="night-button night-button-primary min-h-11 px-3 text-xs disabled:opacity-50">{confirming ? strings.processing : strings.usePhoto}</button>
      </div>
      {pending && <p className="mt-1 text-xs text-champagne">{strings.pending}</p>}
      {legacy && <p className="mt-1 text-xs text-taupe">{strings.legacy}</p>}
    </header>
    <div className="flex shrink-0 justify-center gap-3 text-xs">
      <button type="button" aria-pressed={mode === 'portrait'} onClick={() => changeMode('portrait')} className="min-h-11 px-2">{strings.portrait}</button>
      <button type="button" aria-pressed={mode === 'preview'} disabled={!ready} onClick={() => changeMode('preview')} className="min-h-11 px-2 disabled:opacity-50">{strings.preview}</button>
    </div>
    <div ref={stage} className="relative flex min-h-32 flex-1 items-center justify-center overflow-hidden bg-bordeaux-deep">
      <div className="relative shrink-0 overflow-hidden" style={size} inert={mode !== 'preview' && !editorReady}>
        {size.width > 0 && nativeSize && (mode === 'preview' ? <FeedPhotoPreview src={preview} firstName={firstName} bio={bio} likeLabel={strings.likePreview} /> : <StableCropper key={`${round}-${reset}`} image={imageUrl}
          onReady={() => setEditorReady(true)}
          crop={round ? roundPosition : crop} zoom={currentZoom} aspect={round ? 1 : PHOTO_ASPECT}
          cropSize={size} minZoom={1} maxZoom={3} objectFit={nativeSize.width / nativeSize.height < aspect ? "horizontal-cover" : "vertical-cover"} cropShape={round ? 'round' : 'rect'} showGrid={!round}
          initialCroppedAreaPercentages={round ? roundCrop : area}
          onCropChange={round ? setRoundPosition : setCrop} onZoomChange={changeZoom}
          onCropComplete={round ? next => {
            setRoundCrop(squarePhotoCrop(next, nativeSize.width, nativeSize.height));
          } : rememberCrop}
          classes={{ cropAreaClassName: 'paramour-crop-area' }}
          mediaProps={{ alt: strings.imageAlt, onError: () => setImageFailed(true) }} />)}
      </div>
    </div>
    <div className="shrink-0 border-t border-champagne/15 bg-bordeaux px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-2">
      {mode !== 'preview' && <div className="flex items-center gap-3">
        <label className="flex flex-1 items-center gap-2 text-xs">{strings.zoom}
          <input aria-label={strings.zoom} disabled={!editorReady} type="range" min="1" max="3" step="0.01" value={currentZoom} onChange={event => { changeZoom(Number(event.target.value)); }} className="min-h-11 min-w-0 flex-1 accent-blush" />
          <output className="w-9">×{currentZoom.toFixed(1)}</output>
        </label>
        <button type="button" disabled={!editorReady} onClick={resetCrop} className="min-h-11 px-2 text-xs underline">{strings.reset}</button>
      </div>}
      <div className="mx-auto flex max-w-sm items-center gap-3 py-2">
        {nativeSize && <RoundPhoto src={imageUrl} crop={roundCrop} className="h-14 w-14 shrink-0" />}
        <div className="min-w-0 text-left text-xs">
          <p className="text-taupe">{strings.roundLabel}</p>
          <button type="button" disabled={!ready} onClick={() => changeMode('round')} aria-pressed={round} className="min-h-11 font-medium underline underline-offset-4 disabled:opacity-50">{strings.adjust}</button>
        </div>
      </div>
      <label className="mx-auto flex min-h-11 w-fit cursor-pointer items-center text-xs underline">
        {strings.chooseAnother}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={chooseAnother} />
      </label>
      <p id="photo-crop-help" role={selectionError || exportFailed || imageFailed ? 'alert' : undefined} className="text-center text-xs text-taupe">
        {selectionError || (imageFailed ? strings.loadFailed : exportFailed ? strings.exportFailed : !nativeSize ? strings.processing : round ? strings.roundHelp : strings.help)}
      </p>
    </div>
  </dialog>;
}
// react-easy-crop emits once before applying initial percentages. Do not let
// that transient centered area overwrite a restored selection or its round crop.
function StableCropper({ onReady, ...props }: JSX.LibraryManagedAttributes<typeof Cropper, ComponentProps<typeof Cropper>> & { onReady: () => void }) {
  const [initial] = useState(props.initialCroppedAreaPercentages);
  const loaded = useRef(false);
  const restored = useRef(!initial);
  const pending = useRef<Parameters<NonNullable<typeof props.onCropComplete>> | null>(null);
  return <Cropper {...props} initialCroppedAreaPercentages={initial}
    onCropComplete={(...args) => {
      pending.current = args;
      if (!loaded.current) return;
      if (!restored.current && initial) {
        // Restoration derives zoom from width; reject intermediate layout sizes.
        if (Math.abs(args[0].width - initial.width) > .0001) return;
        restored.current = true;
      }
      props.onCropComplete?.(...args);
      onReady();
    }}
    onMediaLoaded={media => {
      props.onMediaLoaded?.(media);
      loaded.current = true;
      if (!initial && pending.current) { props.onCropComplete?.(...pending.current); onReady(); }
    }} />;
}

// This small bitmap is only a local display preview. Upload the original file
// and crop coordinates; the server extracts native pixels and stores losslessly.
export async function cropPreview(imageUrl: string, area: PhotoCrop) {
  const image = await loadImage(imageUrl);
  const source = photoCropPixels(area, image.naturalWidth, image.naturalHeight);
  const scale = Math.min(1, 1440 / source.width, 2560 / source.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  context.drawImage(image, source.left, source.top, source.width, source.height, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    blob => blob ? resolve(blob) : reject(new Error("Preview failed")), "image/png"
  ));
}

export async function roundPreview(imageUrl: string, crop?: PhotoCrop) {
  const image = await loadImage(imageUrl);
  const area = crop ?? centeredRoundCrop(image.naturalWidth, image.naturalHeight);
  return { crop: area, blob: await cropPreview(imageUrl, area) };
}

async function loadImage(src: string) {
  const image = new Image();
  image.src = src;
  // Wait for usable pixels, retaining the image across the await. Reopening a
  // cached original must not depend on a detached image's load notification.
  await image.decode();
  if (!image.naturalWidth || !image.naturalHeight) throw new Error("Photo could not be loaded");
  return image;
}
