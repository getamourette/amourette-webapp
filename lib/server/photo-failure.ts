// Maps a photo processing failure to the HTTP answer both photo routes give.
// Request body errors keep their own status in the route.
const REPORTED = ['crop_too_large', 'bio_too_long', 'unsupported_heic', 'heic_too_large'];

export function photoFailure(error: unknown): { status: number; error: string } {
  const message = error instanceof Error ? error.message : '';
  if (message === 'stale') return { status: 409, error: 'invalid_photo' };
  return { status: 400, error: REPORTED.includes(message) ? message : 'invalid_photo' };
}
