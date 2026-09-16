import { supabase } from './supabase';
import { PHOTO_STAGING_BUCKET, type PhotoCrop } from './photo-upload';
export const photos = supabase;
async function requirePhotoResponse(response: Response) {
  if (response.ok) return;
  const details: unknown = await response.json().catch(() => null);
  const error = typeof details === 'object' && details !== null && 'error' in details ? details.error : null;
  throw new Error(response.status === 409 ? 'stale' : response.status === 422 ? 'rejected' : error === 'precheck_failed' ? 'review' : error === 'crop_too_large' ? 'crop_too_large' : error === 'bio_too_long' ? 'bio_too_long' : 'upload');
}
export async function submitPhoto(file: File, revision: number, profile?: Record<string, unknown>, crop?: PhotoCrop) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Session expired');
  const headers = { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
  const permission = await fetch('/api/profile-photo/upload', {
    method: 'POST', headers, body: JSON.stringify({ type: file.type, size: file.size, revision, profile, crop }),
  });
  await requirePhotoResponse(permission);
  const upload: { path: string; token: string; ticket: string } = await permission.json();
  const { error } = await supabase.storage.from(PHOTO_STAGING_BUCKET).uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
  if (error) throw new Error('upload');
  const response = await fetch('/api/profile-photo', { method: 'POST', headers, body: JSON.stringify({ ticket: upload.ticket }) });
  await requirePhotoResponse(response);
}
