import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import type { Database } from '@/lib/database.types';
import type { Json } from '@/lib/database.types';
import { isRecord, isValidText, TEXT_RAW_MAX_BYTES } from '@/lib/input-validation';
import { FIRST_NAME_MAX_LENGTH, PROFILE_BIO_MAX_LENGTH, isGender, isInterestedIn } from '@/lib/profile';
import { validatePhotoContent, MAX_PHOTO_REQUEST_BYTES } from '@/lib/server/photo-validation';
import { readBoundedBody, RequestBodyError } from '@/lib/server/request-body';
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
    const body = await readBoundedBody(request, MAX_PHOTO_REQUEST_BYTES);
    const form = await new Response(new Blob([new Uint8Array(body)]), {
      headers: { 'content-type': request.headers.get('content-type') ?? '' },
    }).formData();
    if (form.getAll('photo').length !== 1 || form.getAll('revision').length !== 1 || form.getAll('profile').length > 1) return Response.json({}, { status: 400 });
    const file = form.get('photo');
    const rawRevision = form.get('revision');
    if (typeof rawRevision !== 'string' || !/^(0|[1-9]\d{0,9})$/.test(rawRevision)) return Response.json({}, { status: 400 });
    const revision = Number(rawRevision);
    if (!(file instanceof File) || revision > 2147483647) return Response.json({}, { status: 400 });
    const profile = form.get('profile');
    let profileData: Json | undefined;
    if (profile !== null) {
      if (typeof profile !== 'string' || new TextEncoder().encode(profile).byteLength > TEXT_RAW_MAX_BYTES) return Response.json({}, { status: 400 });
      const value: unknown = JSON.parse(profile);
      if (!isRecord(value) || Object.keys(value).some(key => !['first_name', 'bio', 'gender', 'interested_in', 'adult_confirmed'].includes(key)) ||
          !isValidText(value.first_name, FIRST_NAME_MAX_LENGTH) ||
          (value.bio !== undefined && value.bio !== null && !isValidText(value.bio, PROFILE_BIO_MAX_LENGTH, false)) ||
          !isGender(value.gender) || !isInterestedIn(value.interested_in) || value.adult_confirmed !== true) return Response.json({}, { status: 400 });
      profileData = { first_name: value.first_name.trim(), bio: typeof value.bio === 'string' ? value.bio.trim() || null : null,
        gender: value.gender, interested_in: value.interested_in, adult_confirmed: true };
    }
    await validatePhotoContent(file);
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Decode and re-encode the entire image: reject corrupt payloads and strip
    // EXIF/GPS metadata before either review or storage. Bound decoded pixels.
    const normalized = await sharp(bytes, { limitInputPixels: 25000000, failOn: 'warning' }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    if (process.env.PROFILE_PHOTO_REVIEW_ENABLED === 'true') {
      const reviewBody = new FormData(); reviewBody.set('photo', new Blob([new Uint8Array(normalized)], { type: 'image/jpeg' }), 'photo.jpg');
      const review = await precheck(new Request(request.url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: reviewBody }));
      const result: unknown = await review.json();
      if (!review.ok || typeof result !== 'object' || !result || !('approved' in result)) return Response.json({ error: 'precheck_failed' }, { status: 503 });
      if (result.approved !== true) return Response.json({}, { status: 422 });
    }
    const service = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const path = `${user.id}/${randomUUID()}.jpg`;
    const upload = await service.storage.from('profile-photos').upload(path, normalized, { contentType: 'image/jpeg', upsert: false, cacheControl: '0' });
    if (upload.error) return Response.json({}, { status: 502 });
    const result = await service.rpc('submit_profile_photo', { p_owner: user.id, p_path: path, p_expected_revision: revision, p_profile: profileData });
    if (result.error) {
      await service.storage.from('profile-photos').remove([path]);
      return Response.json({}, { status: result.error.code === 'PT409' ? 409 : 400 });
    }
    return Response.json({ id: result.data });
  } catch (error) {
    return Response.json({}, { status: error instanceof RequestBodyError ? error.status : 400 });
  }
}
