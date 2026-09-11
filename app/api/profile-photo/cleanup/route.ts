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
  if (!data?.length) return Response.json({ removed: 0 });
  const removed = await service.storage.from('profile-photos').remove(data);
  if (removed.error) return Response.json({ error: 'cleanup_delete_failed' }, { status: 502 });
  return Response.json({ removed: data.length });
}
