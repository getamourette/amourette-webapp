"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import type { ProfileStrings } from "@/lib/strings";

// 1440 physical pixels covers current high-density phone viewports while
// avoiding files full of detail the room card can never display. The request
// budget stays below the API's 5 MB validation ceiling to leave multipart
// overhead and deployment-proxy headroom.
const MAX_OUTPUT_WIDTH = 1440;
const MAX_OUTPUT_HEIGHT = 2560;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const LOSSY_QUALITIES = [0.98, 0.96, 0.94, 0.92, 0.9, 0.88, 0.85];

export function PhotoCropper({
  file,
  imageUrl,
  strings,
  onCancel,
  onConfirm,
  onError,
}: {
  file: File;
  imageUrl: string;
  strings: ProfileStrings["crop"];
  onCancel: () => void;
  onConfirm: (file: File, previewUrl: string) => void;
  onError: () => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Percentages retain the cropper's sub-pixel precision. croppedAreaPixels is
  // rounded and can shift an edge by a source pixel on high-resolution photos.
  const rememberCrop = useCallback((area: Area) => {
    setCroppedArea(area);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !processing) onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel, processing]);

  async function confirm() {
    if (!croppedArea || processing) return;
    setProcessing(true);
    setExportFailed(false);
    try {
      const cropped = await cropPhoto(
        imageUrl,
        croppedArea,
        file.name,
        file.type
      );
      onConfirm(cropped, URL.createObjectURL(cropped));
    } catch (error) {
      console.error(error);
      setExportFailed(true);
      onError();
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="photo-crop-title"
      aria-describedby="photo-crop-help"
      aria-busy={processing}
      ref={dialogRef}
      onKeyDown={(event) => trapFocus(event, dialogRef.current)}
      className="fixed inset-0 z-[100] flex min-h-[100dvh] flex-col overflow-hidden bg-velvet text-cream"
    >
      <header className="relative z-20 flex items-center justify-between px-5 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onCancel}
          disabled={processing}
          autoFocus
          className="night-button night-button-secondary min-w-20 px-4 py-2.5 text-xs"
        >
          {strings.cancel}
        </button>
        <div className="text-center">
          <p className="night-kicker">{strings.kicker}</p>
          <h2 id="photo-crop-title" className="font-display mt-1 text-xl italic">
            {strings.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={confirm}
          disabled={!croppedArea || processing}
          className="night-button night-button-primary min-w-20 px-4 py-2.5 text-xs disabled:opacity-50"
        >
          {processing ? strings.processing : strings.usePhoto}
        </button>
      </header>

      <div className={`relative min-h-0 flex-1 bg-bordeaux-deep ${processing ? "pointer-events-none" : ""}`}>
        <Cropper
          image={imageUrl}
          crop={crop}
          zoom={zoom}
          aspect={9 / 16}
          minZoom={1}
          maxZoom={3}
          cropShape="rect"
          showGrid={false}
          objectFit="contain"
          onCropChange={setCrop}
          onCropComplete={rememberCrop}
          onZoomChange={setZoom}
          classes={{ cropAreaClassName: "paramour-crop-area" }}
          mediaProps={{ alt: strings.imageAlt }}
        />

        <div className="pointer-events-none absolute left-1/2 top-[24%] z-10 -translate-x-1/2 text-center">
          <div className="mx-auto h-16 w-16 rounded-full border border-dashed border-champagne/45" />
          <p className="font-label mt-2 whitespace-nowrap text-[9px] uppercase tracking-[0.2em] text-cream/70">
            {strings.faceGuide}
          </p>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[32%] bg-gradient-to-t from-velvet/65 to-transparent" />
        <p className="pointer-events-none absolute inset-x-8 bottom-7 z-10 text-center text-xs leading-relaxed text-cream/75">
          {strings.safeArea}
        </p>
      </div>

      <div className="relative z-20 border-t border-champagne/15 bg-bordeaux px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
        <div className="flex items-center gap-4">
          <span className="text-lg text-champagne" aria-hidden>−</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            disabled={processing}
            aria-label={strings.zoom}
            className="paramour-crop-zoom min-w-0 flex-1"
          />
          <span className="text-lg text-champagne" aria-hidden>+</span>
        </div>
        <p id="photo-crop-help" className="mt-3 text-center text-xs text-taupe">
          {exportFailed ? strings.exportFailed : strings.help}
        </p>
      </div>
    </div>
  );
}

async function cropPhoto(
  imageUrl: string,
  area: Area,
  originalName: string,
  originalType: string
) {
  const image = await loadImage(imageUrl);
  const sourceX = image.naturalWidth * area.x / 100;
  const sourceY = image.naturalHeight * area.y / 100;
  const sourceWidth = image.naturalWidth * area.width / 100;
  const sourceHeight = image.naturalHeight * area.height / 100;
  const scale = Math.min(
    1,
    MAX_OUTPUT_WIDTH / sourceWidth,
    MAX_OUTPUT_HEIGHT / sourceHeight
  );
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    width,
    height
  );

  const blob = await exportWithinBudget(canvas, originalType);
  const stem = originalName.replace(/\.[^.]+$/, "") || "profile-photo";
  const extension = blob.type === "image/png"
    ? "png"
    : blob.type === "image/webp"
      ? "webp"
      : "jpg";
  return new File([blob], `${stem}-cropped.${extension}`, {
    type: blob.type,
    lastModified: Date.now(),
  });
}

async function exportWithinBudget(canvas: HTMLCanvasElement, originalType: string) {
  // Keep genuinely lossless sources lossless when the result remains practical.
  if (originalType === "image/png") {
    const png = await canvasToBlob(canvas, "image/png");
    if (png.size <= MAX_OUTPUT_BYTES) return png;
  }

  // Keep WebP as WebP when possible; JPEG is the safe fallback for oversized
  // PNGs. Try visually lossless settings first, then reduce dimensions only in
  // the pathological case where 1440 px still cannot meet the request budget.
  const lossyType = originalType === "image/webp" ? "image/webp" : "image/jpeg";
  let exportCanvas = canvas;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    for (const quality of LOSSY_QUALITIES) {
      const candidate = await canvasToBlob(exportCanvas, lossyType, quality);
      if (candidate.size <= MAX_OUTPUT_BYTES) return candidate;
    }
    exportCanvas = downscaleCanvas(exportCanvas, 0.85);
  }

  throw new Error("Photo could not be exported within the upload limit");
}

function downscaleCanvas(source: HTMLCanvasElement, scale: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error("Photo export failed")),
      type,
      quality
    );
  });
}

function trapFocus(event: React.KeyboardEvent, dialog: HTMLDivElement | null) {
  if (event.key !== "Tab" || !dialog) return;
  const controls = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled)"
    )
  );
  const first = controls[0];
  const last = controls.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Photo could not be loaded"));
    image.src = src;
  });
}
