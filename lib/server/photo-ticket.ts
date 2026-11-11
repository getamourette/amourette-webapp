import { createHmac, timingSafeEqual } from 'node:crypto';
// @ts-expect-error -- Node source entry for deterministic upload tests.
import { isPhotoCrop, isPhotoType, MAX_PHOTO_OUTPUT_BYTES, MAX_PHOTO_SOURCE_BYTES, type PhotoCrop, type PhotoType } from '../photo-upload.ts';
// @ts-expect-error -- Node source entry for deterministic upload tests.
import { bioValidation, isRecord, isValidText, TEXT_RAW_MAX_BYTES } from '../input-validation.ts';
// @ts-expect-error -- Node source entry for deterministic upload tests.
import { FIRST_NAME_MAX_LENGTH, isGender, isInterestedIn } from '../profile.ts';
import type { Json } from '../database.types';
// @ts-expect-error -- Node source entry for deterministic upload tests.
import { isHeicType, type HeicType } from '../heic.ts';
// @ts-expect-error -- Node source entry for deterministic upload tests.
import { validMatchingConsent } from '../matching-consent.ts';

// A staged manifest has no revision: the photo is uploaded at selection and the
// final command later supplies revision, profile and crops (#278).
export type PhotoManifest = { type: PhotoType | HeicType; size: number; revision?: number; profile?: Json; crop?: PhotoCrop; roundCrop?: PhotoCrop; roundSourceCrop?: PhotoCrop };
export type PhotoCommand = { revision: number; profile?: Json; crop?: PhotoCrop; roundCrop?: PhotoCrop; roundSourceCrop?: PhotoCrop };
export type PhotoTicket = PhotoManifest & { owner: string; path: string; expires: number };
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

export function parsePhotoProfile(value: unknown): Json {
  if (!isRecord(value) || new TextEncoder().encode(JSON.stringify(value)).length > TEXT_RAW_MAX_BYTES ||
    Object.keys(value).some(key => !['first_name', 'bio', 'gender', 'interested_in', 'adult_confirmed', 'matching_consent', 'matching_consent_version', 'matching_consent_locale'].includes(key)) ||
    !isValidText(value.first_name, FIRST_NAME_MAX_LENGTH) ||
    bioValidation(value.bio) === 'invalid' ||
    !isGender(value.gender) || !isInterestedIn(value.interested_in) || value.adult_confirmed !== true || !validMatchingConsent(value)) throw new Error('invalid_profile');
  if (bioValidation(value.bio) === 'too_long') throw new Error('bio_too_long');
  return { first_name: value.first_name.trim(), bio: typeof value.bio === 'string' ? value.bio.trim() || null : null,
    gender: value.gender, interested_in: value.interested_in, adult_confirmed: true,
    matching_consent: true, matching_consent_version: value.matching_consent_version as string,
    matching_consent_locale: value.matching_consent_locale as string };
}
export function parsePhotoManifest(value: unknown): PhotoManifest {
  if (!isRecord(value) || Object.keys(value).some(key => !['type', 'size', 'revision', 'profile', 'crop', 'roundCrop', 'roundSourceCrop'].includes(key)) ||
    (!isPhotoType(value.type) && !isHeicType(value.type)) || typeof value.size !== 'number' || !Number.isInteger(value.size) || value.size < 1 || value.size > MAX_PHOTO_SOURCE_BYTES ||
    (value.revision === undefined ? Object.keys(value).some(key => !['type', 'size'].includes(key)) :
      typeof value.revision !== 'number' || !Number.isInteger(value.revision) || value.revision < 0 || value.revision > 2147483647) ||
    (value.crop !== undefined && !isPhotoCrop(value.crop)) ||
    (value.roundCrop !== undefined && !isPhotoCrop(value.roundCrop)) ||
    (value.roundSourceCrop !== undefined && !isPhotoCrop(value.roundSourceCrop)) ||
    (value.roundCrop !== undefined && value.roundSourceCrop !== undefined)) throw new Error('invalid_photo');
  return { type: value.type, size: value.size, ...(value.revision !== undefined ? { revision: value.revision as number } : {}),
    ...(value.profile !== undefined ? { profile: parsePhotoProfile(value.profile) } : {}),
    ...(value.crop !== undefined ? { crop: value.crop as PhotoCrop } : {}),
    ...(value.roundCrop !== undefined ? { roundCrop: value.roundCrop as PhotoCrop } : {}),
    ...(value.roundSourceCrop !== undefined ? { roundSourceCrop: value.roundSourceCrop as PhotoCrop } : {}) };
}
// The final command for a staged upload or a converted HEIC source.
export function parsePhotoCommand(value: unknown): PhotoCommand {
  if (!isRecord(value) || value.revision === undefined || 'type' in value || 'size' in value) throw new Error('invalid_photo');
  const { revision, profile, crop, roundCrop, roundSourceCrop } = parsePhotoManifest({ ...value, type: 'image/png', size: 1 });
  return { revision: revision!, profile, crop, roundCrop, roundSourceCrop };
}
export function signPhotoTicket(ticket: PhotoTicket, secret: string): string {
  return signTicket(ticket, secret);
}
function signTicket(ticket: object, secret: string): string {
  const payload = Buffer.from(JSON.stringify(ticket)).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
export function verifyPhotoTicket(token: unknown, owner: string, secret: string, now = Date.now()): PhotoTicket {
  const value = readTicket(token, secret);
  if (value.owner !== owner || typeof value.path !== 'string' ||
    !new RegExp(`^${UUID}/${UUID}\\.(jpg|png|webp|heic|heif)$`).test(value.path) || !value.path.startsWith(`${owner}/`) ||
    typeof value.expires !== 'number' || !Number.isSafeInteger(value.expires) || value.expires <= now || value.expires > now + 10 * 60_000) throw new Error('invalid_ticket');
  const { owner: ticketOwner, path, expires, ...manifest } = value;
  return { ...parsePhotoManifest(manifest), owner: ticketOwner as string, path, expires };
}
function readTicket(token: unknown, secret: string): Record<string, unknown> {
  if (typeof token !== 'string' || token.length > 32 * 1024 || !/^[\w-]+\.[\w-]{43}$/.test(token)) throw new Error('invalid_ticket');
  const [payload, signature] = token.split('.');
  const expected = createHmac('sha256', secret).update(payload).digest();
  const supplied = Buffer.from(signature, 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error('invalid_ticket');
  const value: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (!isRecord(value)) throw new Error('invalid_ticket');
  return value;
}

export type HeicPreviewTicket = { purpose: 'heic-preview'; owner: string; path: string; expires: number; type: HeicType; size: number };
export function parseHeicPreviewManifest(value: unknown): { type: HeicType; size: number } {
  if (!isRecord(value) || Object.keys(value).length !== 2 || !isHeicType(value.type) ||
    typeof value.size !== 'number' || !Number.isSafeInteger(value.size) || value.size < 1 || value.size > MAX_PHOTO_SOURCE_BYTES) throw new Error('invalid_photo');
  return { type: value.type, size: value.size };
}
export function signHeicPreviewTicket(ticket: HeicPreviewTicket, secret: string) { return signTicket(ticket, secret); }
export function verifyHeicPreviewTicket(token: unknown, owner: string, secret: string, now = Date.now()): HeicPreviewTicket {
  const value = readTicket(token, secret);
  if (value.purpose !== 'heic-preview' || value.owner !== owner || typeof value.path !== 'string' ||
    !new RegExp(`^${UUID}/${UUID}\\.(heic|heif)$`).test(value.path) || !value.path.startsWith(`${owner}/`) ||
    typeof value.expires !== 'number' || !Number.isSafeInteger(value.expires) || value.expires <= now || value.expires > now + 10 * 60_000) throw new Error('invalid_ticket');
  const { purpose, owner: ticketOwner, path, expires, ...manifest } = value;
  return { ...parseHeicPreviewManifest(manifest), purpose, owner: ticketOwner as string, path, expires };
}

// A server-converted, metadata-free HEIC source already written to private
// source storage. The publication RPC accepts it only while fresh (15 minutes).
export type HeicSourceTicket = { purpose: 'heic-source'; owner: string; path: string; expires: number; size: number; width: number; height: number };
export function signHeicSourceTicket(ticket: HeicSourceTicket, secret: string) { return signTicket(ticket, secret); }
export function verifyHeicSourceTicket(token: unknown, owner: string, secret: string, now = Date.now()): HeicSourceTicket {
  const value = readTicket(token, secret);
  const dimension = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 1 && n <= 25_000_000;
  if (Object.keys(value).length !== 7 || value.purpose !== 'heic-source' || value.owner !== owner || typeof value.path !== 'string' ||
    !new RegExp(`^${UUID}/${UUID}\\.png$`).test(value.path) || !value.path.startsWith(`${owner}/`) ||
    typeof value.expires !== 'number' || !Number.isSafeInteger(value.expires) || value.expires <= now || value.expires > now + 10 * 60_000 ||
    typeof value.size !== 'number' || !Number.isSafeInteger(value.size) || value.size < 1 || value.size > MAX_PHOTO_OUTPUT_BYTES ||
    !dimension(value.width) || !dimension(value.height) || (value.width as number) * (value.height as number) > 25_000_000) throw new Error('invalid_ticket');
  return value as HeicSourceTicket;
}
