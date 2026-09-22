import { photoRequestUser } from '@/lib/server/photo-service';
import { ownerPhotoSource } from '@/lib/server/photo-source';
import { isUuid } from '@/lib/input-validation';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const user = await photoRequestUser(request);
  if (!user) return Response.json({}, { status: 401 });
  const params = new URL(request.url).searchParams;
  const version = params.get('version');
  const revision = params.get('revision');
  if (!isUuid(version) || !revision || !/^(0|[1-9]\d{0,9})$/.test(revision) || Number(revision) > 2147483647 ||
    [...params.keys()].length !== 2) return Response.json({}, { status: 400 });
  try {
    const source = await ownerPhotoSource(user.id, version, Number(revision));
    // Stream without Content-Length so full sources do not hit buffered response limits.
    return new Response(source.file.stream(), { headers: {
      'Content-Type': source.file.type, 'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Photo-Crop': JSON.stringify(source.version.portrait_crop),
      'X-Photo-Round-Crop': JSON.stringify(source.version.round_crop),
      'X-Photo-Round-Source-Crop': JSON.stringify(source.sourceRound ?? null),
      'X-Photo-Legacy': String(!source.version.source_path),
    } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'source_unavailable' }, { status: error instanceof Error && error.message === 'stale' ? 409 : 404 });
  }
}
