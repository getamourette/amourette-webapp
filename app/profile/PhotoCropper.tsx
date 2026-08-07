"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper, { type Area, type Size } from "react-easy-crop";
import type { ProfileStrings } from "@/lib/strings";

// 1440 physical pixels covers current high-density phone viewports while
// avoiding files full of detail the room card can never display. The request
// budget stays below the API's 5 MB validation ceiling to leave multipart
// overhead and deployment-proxy headroom.
const MAX_OUTPUT_WIDTH = 1440;
const MAX_OUTPUT_HEIGHT = 2560;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const LOSSY_QUALITIES = [0.98, 0.96, 0.94, 0.92, 0.9, 0.88, 0.85];
const DEFAULT_PHONE_ASPECT = 9 / 19.5;

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
  const [aspect, setAspect] = useState(DEFAULT_PHONE_ASPECT);
  const [cropSize, setCropSize] = useState<Size | null>(null);
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
      onKeyDown={(event) => {
        trapFocus(event, dialogRef.current);
        if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          setZoom((current) => Math.min(3, current + 0.1));
        } else if (event.key === "-") {
          event.preventDefault();
          setZoom((current) => Math.max(1, current - 0.1));
        }
      }}
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
          aspect={aspect}
          minZoom={1}
          maxZoom={3}
          cropShape="rect"
          showGrid={false}
          objectFit="contain"
          onCropChange={setCrop}
          onCropComplete={rememberCrop}
          onZoomChange={setZoom}
          setCropSize={setCropSize}
          classes={{ cropAreaClassName: "paramour-crop-area" }}
          mediaProps={{ alt: strings.imageAlt }}
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
        <p id="photo-crop-help" className="text-center text-xs text-taupe">
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
  const stem = sanitizeFileStem(originalName);
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

function sanitizeFileStem(originalName: string) {
  const stem = originalName
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return stem || "profile-photo";
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
