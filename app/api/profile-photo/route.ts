import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import type { Json } from '@/lib/database.types';
import { isBioLengthError, isRecord, isUuid } from '@/lib/input-validation';
import { PHOTO_STAGING_BUCKET, PHOTO_SOURCE_BUCKET, isPhotoCrop, type PhotoCrop } from '@/lib/photo-upload';
import { MAX_PHOTO_REQUEST_BYTES } from '@/lib/server/photo-validation';
import { preparePhoto } from '@/lib/server/prepare-photo';
import { photoRequestUser, photoService } from '@/lib/server/photo-service';
import { parsePhotoProfile, verifyPhotoTicket } from '@/lib/server/photo-ticket';
import { readBoundedBody, readBoundedJson, RequestBodyError } from '@/lib/server/request-body';
import { ownerPhotoSource } from '@/lib/server/photo-source';
import { POST as precheck } from './review/route';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const user = await photoRequestUser(request);
  if (!user) return Response.json({}, { status: 401 });
  const service = photoService();
  let stagingPath: string | undefined;
  try {
    let file: File;
    let revision: number;
    let profileData: Json | undefined;
    let crop: PhotoCrop | undefined;
    let roundCrop: PhotoCrop | undefined;
    let fromVersion: string | undefined;
    let sourcePath: string | undefined;
    if (request.headers.get('content-type')?.split(';')[0] === 'application/json') {
      const body = await readBoundedJson(request, 40 * 1024);
      if (!isRecord(body)) return Response.json({}, { status: 400 });
      if ('version' in body) {
        if (Object.keys(body).some(key => !['version', 'revision', 'crop', 'roundCrop'].includes(key)) || !isUuid(body.version) ||
          typeof body.revision !== 'number' || !Number.isInteger(body.revision) || body.revision < 0 || body.revision > 2147483647 ||
          !isPhotoCrop(body.crop) || (body.roundCrop !== undefined && !isPhotoCrop(body.roundCrop))) return Response.json({}, { status: 400 });
        fromVersion = body.version; revision = body.revision; crop = body.crop;
        roundCrop = body.roundCrop as PhotoCrop | undefined;
        const source = await ownerPhotoSource(user.id, fromVersion, revision);
        file = source.file; sourcePath = source.version.source_path ?? undefined;
      } else {
        if (Object.keys(body).length !== 1) return Response.json({}, { status: 400 });
        const ticket = verifyPhotoTicket(body.ticket, user.id, process.env.SUPABASE_SERVICE_ROLE_KEY!);
        stagingPath = ticket.path;
        const staged = await service.storage.from(PHOTO_STAGING_BUCKET).download(ticket.path);
        if (staged.error || !staged.data) return Response.json({ error: 'upload_missing' }, { status: 400 });
        if (staged.data.size !== ticket.size || staged.data.type !== ticket.type) return Response.json({}, { status: 400 });
        file = new File([staged.data], 'photo', { type: ticket.type });
        revision = ticket.revision; profileData = ticket.profile; crop = ticket.crop; roundCrop = ticket.roundCrop;
      }
    } else {
      // Compatibility for already-loaded clients and API callers. New clients
      // send their unchanged source directly to private staging, not this route.
      const body = await readBoundedBody(request, MAX_PHOTO_REQUEST_BYTES);
      const form = await new Response(new Blob([new Uint8Array(body)]), {
        headers: { 'content-type': request.headers.get('content-type') ?? '' },
      }).formData();
      if (form.getAll('photo').length !== 1 || form.getAll('revision').length !== 1 || form.getAll('profile').length > 1) return Response.json({}, { status: 400 });
      const photo = form.get('photo'); const rawRevision = form.get('revision');
      if (!(photo instanceof File) || typeof rawRevision !== 'string' || !/^(0|[1-9]\d{0,9})$/.test(rawRevision) || Number(rawRevision) > 2147483647) return Response.json({}, { status: 400 });
      file = photo; revision = Number(rawRevision);
      const profile = form.get('profile');
      if (profile !== null) {
        if (typeof profile !== 'string') return Response.json({}, { status: 400 });
        profileData = parsePhotoProfile(JSON.parse(profile));
      }
    }
    // Refuse stale commands before review, uploads or state changes; the RPC
    // checks again under lock to cover concurrent finalizations.
    const state = await service.from('photo_state').select('revision').eq('profile_id', user.id).maybeSingle();
    if (state.error) return Response.json({}, { status: 503 });
    if (profileData ? state.data !== null || revision !== 0 : !state.data || state.data.revision !== revision) return Response.json({}, { status: 409 });
    const prepared = await preparePhoto(file, crop, roundCrop, Boolean(fromVersion));
    if (process.env.PROFILE_PHOTO_REVIEW_ENABLED === 'true') {
      // A bounded, transient review copy never replaces the stored photo.
      const reviewBytes = await sharp(prepared.bytes, { limitInputPixels: 25_000_000 }).autoOrient()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
      const reviewBody = new FormData(); reviewBody.set('photo', new Blob([new Uint8Array(reviewBytes)], { type: 'image/jpeg' }), 'photo.jpg');
      const review = await precheck(new Request(request.url, { method: 'POST', headers: { Authorization: request.headers.get('authorization')! }, body: reviewBody }));
      const result: unknown = await review.json();
      if (!review.ok || !isRecord(result) || typeof result.approved !== 'boolean') return Response.json({ error: 'precheck_failed' }, { status: 503 });
      if (!result.approved) return Response.json({}, { status: 422 });
    }
    const extension = prepared.type === 'image/jpeg' ? 'jpg' : prepared.type.split('/')[1];
    // Each finalization gets its own immutable path. A concurrent/stale loser
    // can remove only its own file, never the winner's published version.
    const path = `${user.id}/${randomUUID()}.${extension}`;
    const upload = await service.storage.from('profile-photos').upload(path, prepared.bytes, { contentType: prepared.type, upsert: false, cacheControl: '0' });
    if (upload.error) return Response.json({}, { status: 502 });
    if (!sourcePath) {
      const sourceExtension = prepared.source.type === 'image/jpeg' ? 'jpg' : prepared.source.type.split('/')[1];
      sourcePath = `${user.id}/${randomUUID()}.${sourceExtension}`;
      const sourceUpload = await service.storage.from(PHOTO_SOURCE_BUCKET).upload(sourcePath, prepared.source.bytes, { contentType: prepared.source.type, upsert: false, cacheControl: '0' });
      if (sourceUpload.error) {
        await service.storage.from('profile-photos').remove([path]);
        return Response.json({}, { status: 502 });
      }
    }
    const result = await service.rpc('submit_profile_photo_crop', {
      p_owner: user.id, p_path: path, p_expected_revision: revision, p_profile: profileData,
      p_source_path: sourcePath, p_source_width: prepared.source.width, p_source_height: prepared.source.height,
      p_image_width: prepared.width, p_image_height: prepared.height, p_crop: crop, p_round_crop: roundCrop,
      p_from_version: fromVersion,
    });
    if (result.error) {
      // An unknown transport outcome might have committed. The normal orphan
      // collector will remove it only if no published/pending state references it.
      if (result.error.code) await service.storage.from('profile-photos').remove([path]);
      if (isBioLengthError(result.error)) return Response.json({ error: "bio_too_long" }, { status: 400 });
      return Response.json({}, { status: result.error.code === 'PT409' ? 409 : 400 });
    }
    return Response.json({ id: result.data });
  } catch (error) {
    return Response.json({ error: error instanceof Error && error.message === 'crop_too_large' ? 'crop_too_large' : error instanceof Error && error.message === 'bio_too_long' ? 'bio_too_long' : 'invalid_photo' },
      { status: error instanceof RequestBodyError ? error.status : error instanceof Error && error.message === 'stale' ? 409 : 400 });
  } finally {
    // Only an authenticated, signature-verified ticket can reach this cleanup.
    // Cleanup failures leave private objects for the scheduled staging collector.
    if (stagingPath) await service.storage.from(PHOTO_STAGING_BUCKET).remove([stagingPath]).catch(() => undefined);
  }
}
