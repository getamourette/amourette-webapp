export const PHOTO_REASONS = ['face_unclear', 'multiple_people', 'not_person', 'sexual', 'violent'] as const;
export type PhotoReason = typeof PHOTO_REASONS[number];
export type PhotoAction = 'submitted' | 'cancelled' | 'approved' | 'rejected';
export type PhotoState = {
  profile_id: string;
  displayed_id: string | null;
  pending_id: string | null;
  correction_required: boolean;
  reason: PhotoReason | null;
  last_action: PhotoAction | null;
  last_reason?: PhotoReason | null;
  revision: number;
  updated_at: string;
};
export type PhotoVersion = { id: string; profile_id: string; path: string; status: 'unverified' | 'approved' | 'rejected' | 'superseded'; created_at: string };
export type PhotoQueueRow = PhotoState & { first_name: string; displayed_path: string | null; displayed_status: PhotoVersion['status'] | null; pending_path: string | null; submitted_at: string | null };
export function photoQueuePriority(row: Pick<PhotoQueueRow, 'correction_required' | 'displayed_status'>) {
  return row.correction_required ? 0 : row.displayed_status === 'unverified' ? 1 : 2;
}
export function photoStoragePath(source: string): string | null {
  const marker = '/storage/v1/object/public/profile-photos/';
  if (source.includes(marker)) return decodeURIComponent(source.split(marker)[1]);
  return /^[0-9a-f-]{36}\/[0-9a-f-]+\.(jpg|png|webp)$/.test(source) ? source : null;
}
export function validPhotoBytes(bytes: Uint8Array, type: string): boolean {
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) return false;
  if (type === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === 'image/png') return [137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n);
  if (type === 'image/webp') return String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
  return false;
}
