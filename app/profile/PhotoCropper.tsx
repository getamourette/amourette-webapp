"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area, type Size } from "react-easy-crop";
import { MAX_PHOTO_SOURCE_BYTES, photoCropPixels, type PhotoCrop } from "@/lib/photo-upload";
import type { ProfileStrings } from "@/lib/strings";

const DEFAULT_PHONE_ASPECT = 9 / 19.5;

export function PhotoCropper({
  file,
  imageUrl,
  strings,
  onCancel,
  onConfirm,
  onChooseAnother,
  invalidType,
  tooLarge,
}: {
  file: File;
  imageUrl: string;
  strings: ProfileStrings["crop"];
  onCancel: () => void;
  onConfirm: (file: File, crop: PhotoCrop, previewUrl: string) => void;
  onChooseAnother: (file: File) => void;
  invalidType: string;
  tooLarge: string;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState(DEFAULT_PHONE_ASPECT);
  const [cropSize, setCropSize] = useState<Size | null>(null);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const active = useRef(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [selectionError, setSelectionError] = useState("");

  function chooseAnother(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0];
    event.target.value = "";
    if (!next) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(next.type) || next.size === 0) {
      setSelectionError(invalidType);
      return;
    }
    if (next.size > MAX_PHOTO_SOURCE_BYTES) {
      setSelectionError(tooLarge);
      return;
    }
    onChooseAnother(next);
  }

  // Percentages retain the cropper's sub-pixel precision. croppedAreaPixels is
  // rounded and can shift an edge by a source pixel on high-resolution photos.
  const rememberCrop = useCallback((area: Area) => {
    setCroppedArea(area);
  }, []);

  useEffect(() => {
    active.current = true;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => {
      active.current = false;
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    function matchRoomViewport() {
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      // Profiles are designed for the live portrait room. On a phone, preview
      // its exact visible viewport; desktop keeps a representative modern-phone
      // ratio rather than producing a landscape profile image.
      setAspect(width < height ? width / height : DEFAULT_PHONE_ASPECT);
    }
    matchRoomViewport();
    // Do not follow visualViewport resize: Safari's address bar changes that
    // height while a person is touching the photo, which would move the crop
    // underneath their fingers. Re-evaluate only for a true orientation change.
    const orientation = window.screen.orientation;
    orientation?.addEventListener("change", matchRoomViewport);
    window.addEventListener("orientationchange", matchRoomViewport);
    return () => {
      orientation?.removeEventListener("change", matchRoomViewport);
      window.removeEventListener("orientationchange", matchRoomViewport);
    };
  }, []);

  async function confirm() {
    if (!croppedArea || processing || imageFailed) return;
    setProcessing(true);
    setExportFailed(false);
    try {
      const preview = await cropPreview(imageUrl, croppedArea);
      if (active.current) onConfirm(file, croppedArea, URL.createObjectURL(preview));
    } catch (error) {
      console.error(error);
      if (active.current) setExportFailed(true);
    } finally {
      if (active.current) setProcessing(false);
    }
  }

  return (
    <dialog
      aria-modal="true"
      aria-labelledby="photo-crop-title"
      aria-describedby="photo-crop-help"
      aria-busy={processing}
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        if (!processing) onCancel();
      }}
      onKeyDown={(event) => {
        if (processing || imageFailed) return;
        if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          setZoom((current) => Math.min(3, current + 0.1));
        } else if (event.key === "-") {
          event.preventDefault();
          setZoom((current) => Math.max(1, current - 0.1));
        }
      }}
      className="fixed inset-0 m-0 flex h-[100dvh] max-h-none w-full max-w-none flex-col overflow-hidden border-0 bg-velvet p-0 text-cream"
    >
      <header className="relative z-20 grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 gap-y-3 px-5 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onCancel}
          disabled={processing}
          autoFocus
          className="night-button night-button-secondary col-start-1 row-start-2 min-h-11 justify-self-start whitespace-nowrap px-4 py-2.5 text-xs"
        >
          {strings.cancel}
        </button>
        <div className="col-span-3 col-start-1 row-start-1 text-center">
          <p className="night-kicker">{strings.kicker}</p>
          <h2 id="photo-crop-title" className="font-display mt-1 text-xl italic">
            {strings.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={confirm}
          disabled={!croppedArea || processing || imageFailed}
          className="night-button night-button-primary col-start-3 row-start-2 min-h-11 justify-self-end whitespace-nowrap px-4 py-2.5 text-xs disabled:opacity-50"
        >
          {processing ? strings.processing : strings.usePhoto}
        </button>
      </header>

      <div className={`relative min-h-0 flex-1 bg-bordeaux-deep ${processing ? "pointer-events-none" : ""}`}>
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          minZoom={1}
          maxZoom={3}
          cropShape="rect"
          showGrid={false}
          objectFit="vertical-cover"
          onCropChange={setCrop}
          onCropComplete={rememberCrop}
          onZoomChange={setZoom}
          setCropSize={setCropSize}
          classes={{ cropAreaClassName: "paramour-crop-area" }}
          mediaProps={{ alt: strings.imageAlt, onError: () => setImageFailed(true) }}
        />

        {cropSize && (
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 z-10 overflow-hidden border border-champagne/80"
            style={{
              width: cropSize.width,
              height: cropSize.height,
              transform: "translate(-50%, -50%)",
            }}
          >
            {/* A restrained thirds grid gives familiar crop precision without
                prescribing where a face must sit. */}
            <div className="absolute inset-y-0 left-1/3 border-l border-cream/20" />
            <div className="absolute inset-y-0 left-2/3 border-l border-cream/20" />
            <div className="absolute inset-x-0 top-1/3 border-t border-cream/20" />
            <div className="absolute inset-x-0 top-2/3 border-t border-cream/20" />
          </div>
        )}
      </div>

      <div className="relative z-20 border-t border-champagne/15 bg-bordeaux px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        <label className={`night-button night-button-secondary mx-auto flex min-h-11 w-fit cursor-pointer items-center px-4 py-2.5 text-xs ${processing ? "pointer-events-none opacity-50" : ""}`}>
          {strings.chooseAnother}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={processing} onChange={chooseAnother} />
        </label>
        <p id="photo-crop-help" role={selectionError || exportFailed || imageFailed ? "alert" : undefined} className="mt-3 text-center text-xs text-taupe">
          {selectionError || (imageFailed ? strings.loadFailed : exportFailed ? strings.exportFailed : strings.help)}
        </p>
      </div>
    </dialog>
  );
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

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Photo could not be loaded"));
    image.src = src;
  });
}
