import { supabase } from './supabase';
import { PHOTO_STAGING_BUCKET, MAX_PHOTO_OUTPUT_BYTES, isPhotoType, isPhotoCrop, type PhotoCrop } from './photo-upload';
export const photos = supabase;
async function requirePhotoResponse(response: Response) {
  if (response.ok) return;
  const details: unknown = await response.json().catch(() => null);
  const error = typeof details === 'object' && details !== null && 'error' in details ? details.error : null;
  throw new Error(response.status === 409 ? 'stale' : response.status === 422 ? 'rejected' : error === 'precheck_failed' ? 'review' : error === 'crop_too_large' ? 'crop_too_large' : error === 'bio_too_long' ? 'bio_too_long' : 'upload');
}
export async function submitPhoto(file: File, revision: number, profile?: Record<string, unknown>, crop?: PhotoCrop, roundCrop?: PhotoCrop) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Session expired');
  const headers = { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
  const permission = await fetch('/api/profile-photo/upload', {
    method: 'POST', headers, body: JSON.stringify({ type: file.type, size: file.size, revision, profile, crop, roundCrop }),
  });
  await requirePhotoResponse(permission);
  const upload: { path: string; token: string; ticket: string } = await permission.json();
  const { error } = await supabase.storage.from(PHOTO_STAGING_BUCKET).uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
  if (error) throw new Error('upload');
  const response = await fetch('/api/profile-photo', { method: 'POST', headers, body: JSON.stringify({ ticket: upload.ticket }) });
  await requirePhotoResponse(response);
}

export async function recropPhoto(version: string, revision: number, crop: PhotoCrop, roundCrop?: PhotoCrop) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Session expired');
  await requirePhotoResponse(await fetch('/api/profile-photo', { method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ version, revision, crop, roundCrop }),
  }));
}
export async function loadPhotoSource(version: string, revision: number, signal?: AbortSignal) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Session expired');
  const response = await fetch(`/api/profile-photo/source?version=${encodeURIComponent(version)}&revision=${revision}`, {
    headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store', signal,
  });
  await requirePhotoResponse(response);
  const blob = await response.blob();
  if (!isPhotoType(blob.type) || !blob.size || blob.size > MAX_PHOTO_OUTPUT_BYTES) throw new Error("upload");
  const crop: unknown = JSON.parse(response.headers.get('X-Photo-Crop') ?? 'null');
  const roundCrop: unknown = JSON.parse(response.headers.get('X-Photo-Round-Crop') ?? 'null');
  return { file: new File([blob], 'photo', { type: blob.type }),
    crop: isPhotoCrop(crop) ? crop : undefined, roundCrop: isPhotoCrop(roundCrop) ? roundCrop : undefined,
    legacy: response.headers.get('X-Photo-Legacy') === 'true' };
}
