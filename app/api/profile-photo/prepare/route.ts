import { randomUUID } from 'node:crypto';
import { after } from 'next/server';
import { PHOTO_STAGING_BUCKET } from '@/lib/photo-upload';
import { isRecord } from '@/lib/input-validation';
import { photoRequestUser, photoService } from '@/lib/server/photo-service';
import { parseHeicPreviewManifest, signHeicPreviewTicket, verifyHeicPreviewTicket } from '@/lib/server/photo-ticket';
import { convertHeic, type HeicTimings } from '@/lib/server/heic-conversion';
import { readBoundedJson, RequestBodyError } from '@/lib/server/request-body';
export const runtime = 'nodejs';
let requests = 0;

// Preparation never creates a profile or photo version. Publication still goes
// through the ordinary server validation/moderation/revision-checked command.
export async function POST(request: Request) {
  const started = performance.now();
  const firstRequest = requests++ === 0;
  const durations: Record<string, number> = {};
  const timingHeaders = () => ({
    'Server-Timing': Object.entries(durations).map(([name, duration]) => `${name};dur=${duration.toFixed(1)}`).join(', '),
    // This means first invocation of this module, not proof of a platform cold start.
    'X-Photo-Process-First-Request': String(firstRequest),
  });
  const user = await photoRequestUser(request);
  durations.auth = performance.now() - started;
  if (!user) return Response.json({}, { status: 401 });
  const service = photoService();
  let stagingPath: string | undefined;
  try {
    const body = await readBoundedJson(request, 2048);
    if (!isRecord(body)) throw new Error('invalid_photo');
    if (!('ticket' in body)) {
      const manifest = parseHeicPreviewManifest(body);
      const path = `${user.id}/${randomUUID()}.${manifest.type.split('/')[1]}`;
      const { data, error } = await service.storage.from(PHOTO_STAGING_BUCKET).createSignedUploadUrl(path, { upsert: false });
      if (error || !data) return Response.json({ error: 'upload_unavailable' }, { status: 503 });
      const ticket = signHeicPreviewTicket({ ...manifest, purpose: 'heic-preview', owner: user.id, path, expires: Date.now() + 10 * 60_000 }, process.env.SUPABASE_SERVICE_ROLE_KEY!);
      durations.permission = performance.now() - started - durations.auth;
      return Response.json({ path, token: data.token, ticket }, { headers: { 'Cache-Control': 'private, no-store', ...timingHeaders() } });
    }
    if (Object.keys(body).length !== 1) throw new Error('invalid_photo');
    const ticket = verifyHeicPreviewTicket(body.ticket, user.id, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    stagingPath = ticket.path;
    const downloadStarted = performance.now();
    const staged = await service.storage.from(PHOTO_STAGING_BUCKET).download(ticket.path);
    durations.source_download = performance.now() - downloadStarted;
    if (staged.error || !staged.data || staged.data.size !== ticket.size || staged.data.type !== ticket.type) throw new Error('invalid_photo');
    const timings: HeicTimings = {};
    const conversionStarted = performance.now();
    const png = await convertHeic(new File([staged.data], 'photo', { type: ticket.type }), request.signal, timings);
    durations.conversion = performance.now() - conversionStarted;
    Object.assign(durations, timings);
    // Read IHDR from our own validated encoder output without copying a large
    // PNG or loading a second image decoder into the request process.
    const dimensions = new DataView(await png.slice(0, 24).arrayBuffer());
    durations.total = performance.now() - started;
    return new Response(png.stream(), { headers: {
      'Content-Type': 'image/png', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
      'X-Photo-Width': String(dimensions.getUint32(16)), 'X-Photo-Height': String(dimensions.getUint32(20)),
      ...timingHeaders(),
    } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const unavailable = ['decoder_busy', 'decoder_unavailable', 'conversion_timeout'].includes(message);
    return Response.json({ error: ['unsupported_heic', 'heic_too_large'].includes(message) ? message : 'invalid_photo' },
      { status: error instanceof RequestBodyError ? error.status : unavailable ? 503 : 400 });
  } finally {
    if (stagingPath) {
      const path = stagingPath;
      after(async () => { await service.storage.from(PHOTO_STAGING_BUCKET).remove([path]).catch(() => undefined); });
    }
  }
}
