import { isGender, isInterestedIn, type Gender } from './profile';

export type PreferenceValues = { gender: Gender; interested_in: Gender[] };
export type ProfileEditState = PreferenceValues & {
  version: string | null; available_at: string | null; server_now: string;
};
export type PreferenceStatus = 'saved' | 'unchanged' | 'stale' | 'cooldown';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const timestamp = (value: unknown): value is string => typeof value === 'string' &&
  value.length <= 40 && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));

export function parseProfileEditState(value: unknown): ProfileEditState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid edit state');
  const row = value as Record<string, unknown>;
  if (!isGender(row.gender) || !isInterestedIn(row.interested_in) ||
    !(row.version === null || (typeof row.version === 'string' && uuid.test(row.version))) ||
    !(row.available_at === null || timestamp(row.available_at)) || !timestamp(row.server_now)) {
    throw new Error('Invalid edit state');
  }
  return { gender: row.gender, interested_in: row.interested_in, version: row.version,
    available_at: row.available_at, server_now: row.server_now };
}
export function parsePreferenceResult(value: unknown) {
  const state = parseProfileEditState(value);
  const status = (value as Record<string, unknown>).status;
  if (status !== 'saved' && status !== 'unchanged' && status !== 'stale' && status !== 'cooldown') {
    throw new Error('Invalid preference result');
  }
  return { state, status };
}
export function samePreferences(a: PreferenceValues, b: PreferenceValues) {
  return a.gender === b.gender && a.interested_in.length === b.interested_in.length &&
    a.interested_in.every(gender => b.interested_in.includes(gender));
}
export function restrictedPreferenceChange(saved: PreferenceValues, draft: PreferenceValues) {
  return saved.gender !== draft.gender || draft.interested_in.some(gender => !saved.interested_in.includes(gender));
}
export function cooldownActive(state: ProfileEditState) {
  return state.available_at !== null && Date.parse(state.server_now) < Date.parse(state.available_at);
}
