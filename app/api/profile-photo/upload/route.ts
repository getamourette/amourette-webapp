import { randomUUID } from 'node:crypto';
import { PHOTO_STAGING_BUCKET } from '@/lib/photo-upload';
import { photoRequestUser, photoService } from '@/lib/server/photo-service';
import { parsePhotoManifest, signPhotoTicket } from '@/lib/server/photo-ticket';
import { readBoundedJson, RequestBodyError } from '@/lib/server/request-body';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const user = await photoRequestUser(request);
  if (!user) return Response.json({}, { status: 401 });
  try {
    const manifest = parsePhotoManifest(await readBoundedJson(request, 20 * 1024));
    const extension = manifest.type === 'image/jpeg' ? 'jpg' : manifest.type.split('/')[1];
    const path = `${user.id}/${randomUUID()}.${extension}`;
    const { data, error } = await photoService().storage.from(PHOTO_STAGING_BUCKET).createSignedUploadUrl(path, { upsert: false });
    if (error || !data) return Response.json({ error: 'upload_unavailable' }, { status: 503 });
    const ticket = signPhotoTicket({ ...manifest, owner: user.id, path, expires: Date.now() + 10 * 60_000 }, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    return Response.json({ path, token: data.token, ticket });
  } catch (error) {
    return Response.json({}, { status: error instanceof RequestBodyError ? error.status : 400 });
  }
}
