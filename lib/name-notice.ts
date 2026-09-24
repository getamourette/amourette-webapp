// @ts-expect-error -- Node type-stripping tests resolve explicit extensions.
import { isRecord, isUuid } from './input-validation.ts';

const PREFIX = 'amourette-name-seen:';
export function nameNoticeKey(owner: string, match: string) { return `${PREFIX}${owner}:${match}`; }
export function parseNameNotice(raw: string | null, now = Date.now()): { correctionId: string; expiresAt: number } | null {
  if (!raw || raw.length > 160) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || !isUuid(value.correctionId) || typeof value.expiresAt !== 'number' ||
      !Number.isFinite(value.expiresAt) || value.expiresAt <= now) return null;
    return { correctionId: value.correctionId, expiresAt: value.expiresAt };
  } catch { return null; }
}
export function pruneNameNotices(storage: Storage, now = Date.now()) {
  for (let index = storage.length - 1; index >= 0; index--) {
    const key = storage.key(index);
    if (key?.startsWith(PREFIX) && !parseNameNotice(storage.getItem(key), now)) storage.removeItem(key);
  }
}
export function shouldShowNameNotice(correction: string | null, seen: string | null, local: string | null) {
  return correction !== null && correction !== seen && correction !== local;
}
