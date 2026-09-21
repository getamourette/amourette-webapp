import type { PhotoCrop } from '@/lib/photo-upload';
// Coordinates are relative to the already cropped portrait. No second asset.
export function roundPhotoStyle(crop: PhotoCrop) {
  return { position: 'absolute' as const, maxWidth: 'none', width: `${10000 / crop.width}%`, height: `${10000 / crop.height}%`, left: `${-100 * crop.x / crop.width}%`, top: `${-100 * crop.y / crop.height}%`, objectFit: 'fill' as const };
}
export function RoundPhoto({ src, crop, className = 'h-12 w-12', alt = '' }: { src: string; crop?: PhotoCrop; className?: string; alt?: string }) {
  return <span className={`relative inline-block shrink-0 overflow-hidden rounded-full ${className}`}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={src} alt={alt} className="h-full w-full object-cover" style={crop ? roundPhotoStyle(crop) : undefined} />
  </span>;
}
