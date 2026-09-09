import { supabase } from './supabase';
export const photos = supabase;
export async function submitPhoto(file: File, revision: number, profile?: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Session expired');
  const body = new FormData();
  body.set('photo', file);
  body.set('revision', String(revision));
  if (profile) body.set('profile', JSON.stringify(profile));
  const response = await fetch('/api/profile-photo', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` }, body });
  if (!response.ok) {
    const details: unknown = await response.json().catch(() => null);
    const precheckFailed = typeof details === 'object' && details !== null && 'error' in details && details.error === 'precheck_failed';
    throw new Error(response.status === 409 ? 'stale' : response.status === 422 ? 'rejected' : precheckFailed ? 'review' : 'upload');
  }
}
