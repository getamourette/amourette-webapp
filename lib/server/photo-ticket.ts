import { createHmac, timingSafeEqual } from 'node:crypto';
// @ts-expect-error -- Node source entry for deterministic upload tests.
import { isPhotoCrop, isPhotoType, MAX_PHOTO_SOURCE_BYTES, type PhotoCrop, type PhotoType } from '../photo-upload.ts';
// @ts-expect-error -- Node source entry for deterministic upload tests.
import { bioValidation, isRecord, isValidText, TEXT_RAW_MAX_BYTES } from '../input-validation.ts';
// @ts-expect-error -- Node source entry for deterministic upload tests.
import { FIRST_NAME_MAX_LENGTH, isGender, isInterestedIn } from '../profile.ts';
import type { Json } from '../database.types';

export type PhotoManifest = { type: PhotoType; size: number; revision: number; profile?: Json; crop?: PhotoCrop; roundCrop?: PhotoCrop };
export type PhotoTicket = PhotoManifest & { owner: string; path: string; expires: number };
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

export function parsePhotoProfile(value: unknown): Json {
  if (!isRecord(value) || new TextEncoder().encode(JSON.stringify(value)).length > TEXT_RAW_MAX_BYTES ||
    Object.keys(value).some(key => !['first_name', 'bio', 'gender', 'interested_in', 'adult_confirmed'].includes(key)) ||
    !isValidText(value.first_name, FIRST_NAME_MAX_LENGTH) ||
    bioValidation(value.bio) === 'invalid' ||
    !isGender(value.gender) || !isInterestedIn(value.interested_in) || value.adult_confirmed !== true) throw new Error('invalid_profile');
  if (bioValidation(value.bio) === 'too_long') throw new Error('bio_too_long');
  return { first_name: value.first_name.trim(), bio: typeof value.bio === 'string' ? value.bio.trim() || null : null,
    gender: value.gender, interested_in: value.interested_in, adult_confirmed: true };
}
export function parsePhotoManifest(value: unknown): PhotoManifest {
  if (!isRecord(value) || Object.keys(value).some(key => !['type', 'size', 'revision', 'profile', 'crop', 'roundCrop'].includes(key)) ||
    !isPhotoType(value.type) || typeof value.size !== 'number' || !Number.isInteger(value.size) || value.size < 1 || value.size > MAX_PHOTO_SOURCE_BYTES ||
    typeof value.revision !== 'number' || !Number.isInteger(value.revision) || value.revision < 0 || value.revision > 2147483647 ||
    (value.crop !== undefined && !isPhotoCrop(value.crop)) ||
    (value.roundCrop !== undefined && !isPhotoCrop(value.roundCrop))) throw new Error('invalid_photo');
  return { type: value.type, size: value.size, revision: value.revision,
    ...(value.profile !== undefined ? { profile: parsePhotoProfile(value.profile) } : {}),
    ...(value.crop !== undefined ? { crop: value.crop as PhotoCrop } : {}),
    ...(value.roundCrop !== undefined ? { roundCrop: value.roundCrop as PhotoCrop } : {}) };
}
export function signPhotoTicket(ticket: PhotoTicket, secret: string): string {
  const payload = Buffer.from(JSON.stringify(ticket)).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
export function verifyPhotoTicket(token: unknown, owner: string, secret: string, now = Date.now()): PhotoTicket {
  if (typeof token !== 'string' || token.length > 32 * 1024 || !/^[\w-]+\.[\w-]{43}$/.test(token)) throw new Error('invalid_ticket');
  const [payload, signature] = token.split('.');
  const expected = createHmac('sha256', secret).update(payload).digest();
  const supplied = Buffer.from(signature, 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error('invalid_ticket');
  const value: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (!isRecord(value) || value.owner !== owner || typeof value.path !== 'string' ||
    !new RegExp(`^${UUID}/${UUID}\\.(jpg|png|webp)$`).test(value.path) || !value.path.startsWith(`${owner}/`) ||
    typeof value.expires !== 'number' || !Number.isSafeInteger(value.expires) || value.expires <= now || value.expires > now + 10 * 60_000) throw new Error('invalid_ticket');
  const { owner: ticketOwner, path, expires, ...manifest } = value;
  return { ...parsePhotoManifest(manifest), owner: ticketOwner as string, path, expires };
}
