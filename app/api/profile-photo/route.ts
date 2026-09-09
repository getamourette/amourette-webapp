import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import type { Database } from '@/lib/database.types';
import type { Json } from '@/lib/database.types';
import { validPhotoBytes } from '@/lib/photo-moderation';
import { POST as precheck } from './review/route';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return Response.json({}, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const auth = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await auth.auth.getUser(token);
  if (error || !user) return Response.json({}, { status: 401 });
  try {
    if (Number(request.headers.get('content-length')) > 6 * 1024 * 1024) return Response.json({}, { status: 413 });
    const form = await request.formData();
    const file = form.get('photo');
    const rawRevision = form.get('revision');
    if (typeof rawRevision !== 'string' || !/^\d+$/.test(rawRevision)) return Response.json({}, { status: 400 });
    const revision = Number(rawRevision);
    if (!(file instanceof File) || !Number.isSafeInteger(revision) || revision < 0 || file.size > 5 * 1024 * 1024) return Response.json({}, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!validPhotoBytes(bytes, file.type)) return Response.json({}, { status: 400 });
    // Decode and re-encode the entire image: reject corrupt payloads and strip
    // EXIF/GPS metadata before either review or storage. Bound decoded pixels.
    const normalized = await sharp(bytes, { limitInputPixels: 25000000 }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    if (process.env.PROFILE_PHOTO_REVIEW_ENABLED === 'true') {
      const reviewBody = new FormData(); reviewBody.set('photo', new Blob([new Uint8Array(normalized)], { type: 'image/jpeg' }), 'photo.jpg');
      const review = await precheck(new Request(request.url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: reviewBody }));
      const result: unknown = await review.json();
      if (!review.ok || typeof result !== 'object' || !result || !('approved' in result)) return Response.json({ error: 'precheck_failed' }, { status: 503 });
      if (result.approved !== true) return Response.json({}, { status: 422 });
    }
    const service = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const profile = form.get('profile');
    const profileData: Json | undefined = typeof profile === 'string' ? JSON.parse(profile) : undefined;
    const path = `${user.id}/${randomUUID()}.jpg`;
    const upload = await service.storage.from('profile-photos').upload(path, normalized, { contentType: 'image/jpeg', upsert: false, cacheControl: '0' });
    if (upload.error) return Response.json({}, { status: 502 });
    const result = await service.rpc('submit_profile_photo', { p_owner: user.id, p_path: path, p_expected_revision: revision, p_profile: profileData });
    if (result.error) {
      await service.storage.from('profile-photos').remove([path]);
      return Response.json({}, { status: result.error.code === '40001' ? 409 : 400 });
    }
    return Response.json({ id: result.data });
  } catch {
    return Response.json({}, { status: 400 });
  }
}
