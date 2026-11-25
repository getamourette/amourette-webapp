// Which part of a door-camera video frame jsQR reads, and at what size (#484).
// `sx/sy/sw/sh` is the source rectangle in video pixels; `width/height` is the
// canvas it is drawn into before decoding.
export type ArrivalScanRegion = { sx: number; sy: number; sw: number; sh: number; width: number; height: number };

// The regions the camera cycles through, one per scan tick:
// - the whole frame shrunk to 800 px on its long side, which finds a QR anywhere
//   in view and copes best with a slightly blurred image;
// - the centred square at full resolution (capped at 1080 px), which keeps every
//   sensor pixel of a small or distant QR. Shrinking alone leaves a 33 mm email QR
//   at about 2.7 px per module, where jsQR starts to fail.
export function arrivalScanRegions(videoWidth: number, videoHeight: number): ArrivalScanRegion[] {
  const scale = Math.min(1, 800 / Math.max(videoWidth, videoHeight));
  const whole = { sx: 0, sy: 0, sw: videoWidth, sh: videoHeight,
    width: Math.max(1, Math.round(videoWidth * scale)), height: Math.max(1, Math.round(videoHeight * scale)) };
  const side = Math.min(videoWidth, videoHeight), target = Math.max(1, Math.min(side, 1080));
  if (videoWidth === videoHeight && scale === 1) return [whole];
  const centre = { sx: Math.floor((videoWidth - side) / 2), sy: Math.floor((videoHeight - side) / 2), sw: side, sh: side, width: target, height: target };
  return [whole, centre];
}
