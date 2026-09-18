export const PHOTO_REFRESH_EVENT = 'amourette-photo-refresh';
export const PHOTO_RESET_EVENT = 'amourette-photo-reset';
let generation = 0;
let retryRequested = false;
export function photoGeneration() { return generation; }
export function requestPhotoRetry() { retryRequested = true; }
export function retryPhotosIfNeeded() {
  if (retryRequested) invalidatePhotos();
}
export function invalidatePhotos() {
  // A refresh retries every mounted consumer. Failures can request another
  // attempt on PhotoSync's next visible recovery tick, even at the same revision.
  retryRequested = false;
  generation += 1;
  window.dispatchEvent(new Event(PHOTO_REFRESH_EVENT));
}
