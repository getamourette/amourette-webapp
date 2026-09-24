import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  const expected = process.env.PHOTO_CLEANUP_SECRET;
  const supplied = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!expected || !supplied || Buffer.byteLength(expected) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return Response.json({}, { status: 401 });
  const service = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await service.rpc('expired_profile_photo_paths');
  if (error) return Response.json({ error: 'cleanup_query_failed' }, { status: 500 });
  const staged = await service.rpc('expired_profile_photo_staging_paths');
  if (staged.error) return Response.json({ error: 'cleanup_query_failed' }, { status: 500 });
  const sources = await service.rpc('expired_profile_photo_source_paths');
  if (sources.error) return Response.json({ error: 'cleanup_query_failed' }, { status: 500 });
  const rounds = await service.rpc('expired_profile_photo_round_paths');
  if (rounds.error) return Response.json({ error: 'cleanup_query_failed' }, { status: 500 });
  for (const [bucket, paths] of [['profile-photos', data], ['profile-photo-staging', staged.data], ['profile-photo-sources', sources.data], ['profile-photo-rounds', rounds.data]] as const) {
    if (!paths?.length) continue;
    const removed = await service.storage.from(bucket).remove(paths);
    if (removed.error) return Response.json({ error: 'cleanup_delete_failed' }, { status: 502 });
  }
  return Response.json({ removed: (data?.length ?? 0) + (staged.data?.length ?? 0) + (sources.data?.length ?? 0) + (rounds.data?.length ?? 0) });
}
