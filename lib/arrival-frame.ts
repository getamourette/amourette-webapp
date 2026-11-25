// Which part of a door-camera video frame jsQR reads, and at what size (#484).
// `sx/sy/sw/sh` is the source rectangle in video pixels; `width/height` is the
// canvas it is drawn into before decoding.
export type ArrivalScanRegion = { sx: number; sy: number; sw: number; sh: number; width: number; height: number };

// The regions the camera cycles through, one per scan tick.
export function arrivalScanRegions(videoWidth: number, videoHeight: number): ArrivalScanRegion[] {
  const scale = Math.min(1, 800 / Math.max(videoWidth, videoHeight));
  return [{ sx: 0, sy: 0, sw: videoWidth, sh: videoHeight,
    width: Math.max(1, Math.round(videoWidth * scale)), height: Math.max(1, Math.round(videoHeight * scale)) }];
}
