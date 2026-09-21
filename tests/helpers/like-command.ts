import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../lib/database.types';

export async function likeCommand(client: SupabaseClient<Database>, venueId: string, targetId: string) {
  const { data, error } = await client.rpc('room_candidates', { p_venue_id: venueId });
  if (error) throw error;
  const card = data.find(row => row.id === targetId);
  if (!card) throw new Error('Test target is not discoverable');
  return {
    p_venue_night_id: card.venue_night_id,
    p_target_id: card.id,
    p_action: 'like',
    p_request_id: randomUUID(),
    p_token: card.like_token,
  };
}
