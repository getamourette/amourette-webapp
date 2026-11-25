// Maps a photo processing failure to the HTTP answer both photo routes give.
// Request body errors keep their own status in the route.
const REPORTED = ['crop_too_large', 'bio_too_long', 'unsupported_heic', 'heic_too_large'];
// A saturated, stalled or crashed HEIC converter says nothing about the photo:
// the client may retry the same staged upload after a pause (#485).
const TEMPORARY = ['decoder_busy', 'conversion_timeout', 'decoder_unavailable'];

export function isTemporaryPhotoFailure(error: unknown) {
  return error instanceof Error && TEMPORARY.includes(error.message);
}

export function photoFailure(error: unknown): { status: number; error: string } {
  const message = error instanceof Error ? error.message : '';
  if (isTemporaryPhotoFailure(error)) return { status: 503, error: 'converter_busy' };
  if (message === 'stale') return { status: 409, error: 'invalid_photo' };
  return { status: 400, error: REPORTED.includes(message) ? message : 'invalid_photo' };
}
