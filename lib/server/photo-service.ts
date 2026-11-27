import { createClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';
export async function photoRequestUser(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await auth.auth.getUser(token);
  return error ? null : data.user;
}
export function photoService() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}
// #376 (SEC-013): an anonymous session is free, so upload permissions are counted
// per account in the database (`claim_photo_upload_ticket`): 30 an hour, none
// while 10 staging objects are waiting. An unreadable quota refuses the upload.
export async function claimPhotoUploadTicket(owner: string): Promise<'allowed' | 'too_many_uploads' | 'upload_unavailable'> {
  const { data, error } = await photoService().rpc('claim_photo_upload_ticket', { p_owner: owner });
  if (error || typeof data !== 'boolean') return 'upload_unavailable';
  return data ? 'allowed' : 'too_many_uploads';
}
