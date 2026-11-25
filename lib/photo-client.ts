import { supabase } from './supabase';
import { PHOTO_STAGING_BUCKET, MAX_PHOTO_OUTPUT_BYTES, isPhotoType, isPhotoCrop, type PhotoCrop } from './photo-upload';
import { isHeicType } from './heic';
import { photoMeasure } from './photo-performance';
import { optimizePhotoUpload } from './optimize-photo-upload';
export const photos = supabase;
async function requirePhotoResponse(response: Response) {
  if (response.ok) return;
  const details: unknown = await response.json().catch(() => null);
  const error = typeof details === 'object' && details !== null && 'error' in details ? details.error : null;
  throw new Error(response.status === 409 ? 'stale' : error === 'source_missing' ? 'source_missing' : response.status === 503 && error === 'converter_busy' ? 'busy' : response.status === 422 ? 'rejected' : error === 'precheck_failed' ? 'review' : error === 'crop_too_large' ? 'crop_too_large' : error === 'bio_too_long' ? 'bio_too_long' : error === 'unsupported_heic' ? 'unsupported_heic' : error === 'heic_too_large' ? 'heic_too_large' : 'upload');
}

// #278: the server's stored conversion of each HEIC selection, by original file.
const convertedSources = new WeakMap<File, { ticket: string; usableUntil: number }>();

export async function preparePhotoPreview(file: File, signal?: AbortSignal, nativeSize?: { width: number; height: number }): Promise<Blob> {
  if (!isHeicType(file.type)) return file;
  const started = performance.now();
  const { data: { session } } = await supabase.auth.getSession();
  signal?.throwIfAborted();
  if (!session) throw new Error('Session expired');
  const headers = { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
  const permission = await fetch('/api/profile-photo/prepare', {
    method: 'POST', headers, signal, body: JSON.stringify({ type: file.type, size: file.size }),
  });
  await requirePhotoResponse(permission);
  const upload: { path: string; token: string; ticket: string } = await permission.json();
  photoMeasure('prepare.permission', started);
  signal?.throwIfAborted();
  const uploadStarted = performance.now();
  const { error } = await supabase.storage.from(PHOTO_STAGING_BUCKET).uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type });
  // An in-flight Storage upload may finish after cancellation. Its private
  // abandoned object expires through the existing staging collector.
  signal?.throwIfAborted();
  if (error) throw new Error('upload');
  photoMeasure('prepare.upload', uploadStarted, { bytes: file.size });
  const conversionStarted = performance.now();
  const response = await fetch('/api/profile-photo/prepare', { method: 'POST', headers, signal, body: JSON.stringify({ ticket: upload.ticket }) });
  photoMeasure('prepare.headers', conversionStarted, { serverTiming: response.headers.get('Server-Timing') ?? '', firstProcessRequest: response.headers.get('X-Photo-Process-First-Request') ?? '' });
  await requirePhotoResponse(response);
  if (response.headers.get('content-type') !== 'image/png' || !response.body) throw new Error('upload');
  const sourceTicket = response.headers.get('X-Photo-Source-Ticket');
  // Kept briefly under the server's 10-minute limit, so a save never races it.
  if (sourceTicket) convertedSources.set(file, { ticket: sourceTicket, usableUntil: Date.now() + 8 * 60_000 });
  // A native HEIC preview is display-only. Wait for the same strict server
  // conversion before accepting it, and require matching oriented dimensions.
  // Older servers or different native orientation fall back to the full PNG.
  if (nativeSize && response.headers.get('X-Photo-Width') === String(nativeSize.width) &&
      response.headers.get('X-Photo-Height') === String(nativeSize.height)) {
    await response.body.cancel();
    signal?.throwIfAborted();
    photoMeasure('prepare.native-validation', started);
    return file;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0;
  const downloadStarted = performance.now();
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PHOTO_OUTPUT_BYTES) throw new Error('heic_too_large');
      chunks.push(new Uint8Array(value));
    }
    if (!size) throw new Error('upload');
    photoMeasure('prepare.download', downloadStarted, { bytes: size });
    const blobStarted = performance.now();
    const blob = new Blob(chunks, { type: 'image/png' });
    photoMeasure('prepare.blob', blobStarted);
    return blob;
  } finally { await reader.cancel().catch(() => undefined); }
}
// Pauses before each new attempt when the server's photo converter is busy.
// The staged upload stays on the server, so a retry sends only the ticket (#485).
export const BUSY_RETRY_DELAYS_MS = [2000, 4000, 8000];

export async function submitPhoto(file: File, revision: number, profile?: Record<string, unknown>, crop?: PhotoCrop, roundSourceCrop?: PhotoCrop,
  onBusyRetry?: () => void) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Session expired');
  const headers = { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' };
  const converted = convertedSources.get(file);
  if (converted && converted.usableUntil > Date.now()) {
    // A HEIC already converted at selection: send only the reference (#278).
    const body = JSON.stringify({ source: converted.ticket, revision, profile, crop, roundSourceCrop });
    try {
      return await postWithBusyRetry(headers, body, onBusyRetry);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'source_missing') throw error;
      convertedSources.delete(file);
    }
  }
  const optimized = await optimizePhotoUpload(file, roundSourceCrop);
  const permission = await fetch('/api/profile-photo/upload', {
    method: 'POST', headers, body: JSON.stringify({ type: optimized.file.type, size: optimized.file.size, revision, profile, crop, roundSourceCrop: optimized.roundSourceCrop }),
  });
  await requirePhotoResponse(permission);
  const upload: { path: string; token: string; ticket: string } = await permission.json();
  const { error } = await supabase.storage.from(PHOTO_STAGING_BUCKET).uploadToSignedUrl(upload.path, upload.token, optimized.file, { contentType: optimized.file.type });
  if (error) throw new Error('upload');
  await postWithBusyRetry(headers, JSON.stringify({ ticket: upload.ticket }), onBusyRetry);
}

async function postWithBusyRetry(headers: Record<string, string>, body: string, onBusyRetry?: () => void) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch('/api/profile-photo', { method: 'POST', headers, body });
    try {
      return await requirePhotoResponse(response);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'busy' || attempt >= BUSY_RETRY_DELAYS_MS.length) throw error;
      onBusyRetry?.();
      await new Promise(resolve => setTimeout(resolve, BUSY_RETRY_DELAYS_MS[attempt]));
    }
  }
}

export async function recropPhoto(version: string, revision: number, crop: PhotoCrop, roundSourceCrop?: PhotoCrop) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Session expired');
  await requirePhotoResponse(await fetch('/api/profile-photo', { method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ version, revision, crop, roundSourceCrop }),
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
  const roundCrop: unknown = JSON.parse(response.headers.get('X-Photo-Round-Source-Crop') ?? 'null');
  return { file: new File([blob], 'photo', { type: blob.type }),
    crop: isPhotoCrop(crop) ? crop : undefined, roundCrop: isPhotoCrop(roundCrop) ? roundCrop : undefined,
    legacy: response.headers.get('X-Photo-Legacy') === 'true' };
}
