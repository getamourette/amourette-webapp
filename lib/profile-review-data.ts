// @ts-expect-error Node's direct TypeScript runner requires source extensions.
import { isRecord, isUuid, isValidText } from './input-validation.ts';
// @ts-expect-error Node's direct TypeScript runner requires source extensions.
import { REVIEW_FIELDS, REVIEW_FILTERS, reviewCorrection, type ReviewCorrection, type ReviewField, type ReviewFilter, type ReviewProfile, type ReviewStatus, type ReviewCounts } from './profile-review.ts';

function invalid(): never { throw new Error('Invalid profile review response'); }
function uuid(value: unknown): string { return isUuid(value) ? value : invalid(); }
function flag(value: unknown): boolean { return typeof value === 'boolean' ? value : invalid(); }
function text(value: unknown, max: number): string | null {
  return value === null ? null : isValidText(value, max, false) ? value : invalid();
}
function path(value: unknown): string | null {
  return value === null ? null : typeof value === 'string' && value.length > 0 && value.length <= 2048 && !/[\u0000-\u001f]/u.test(value) ? value : invalid();
}
function status(value: unknown): ReviewStatus {
  return value === 'needs_review' || value === 'awaiting_changes' || value === 'approved' ? value : invalid();
}
function fields(value: unknown): ReviewField[] {
  if (!Array.isArray(value) || value.length > 3 || new Set(value).size !== value.length) return invalid();
  return value.map(field => REVIEW_FIELDS.find(candidate => candidate === field) ?? invalid());
}
function corrections(value: unknown): ReviewCorrection[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) return invalid();
  const result = value.map(item => {
    if (!isRecord(item) || Object.keys(item).length !== 2 || typeof item.reason !== 'string') return invalid();
    const field = REVIEW_FIELDS.find(field => field === item.field);
    return field ? reviewCorrection(field, item.reason) ?? invalid() : invalid();
  });
  if (new Set(result.map(item => item.field)).size !== result.length) return invalid();
  return result;
}
export function parseReviewProfile(value: unknown): ReviewProfile {
  if (!isRecord(value)) return invalid();
  let correction: ReviewProfile['correction'] = null;
  if (value.correction !== null) {
    if (!isRecord(value.correction) || !isRecord(value.correction.original)) return invalid();
    correction = { fields: corrections(value.correction.fields), original: {
      firstName: text(value.correction.original.firstName, 30), bio: text(value.correction.original.bio, 300), photoPath: path(value.correction.original.photoPath),
    } };
  }
  if (typeof value.submittedAt !== 'string' || value.submittedAt.length > 64 || !Number.isFinite(Date.parse(value.submittedAt))) return invalid();
  return { id: uuid(value.id), revision: uuid(value.revision), firstName: text(value.firstName, 30), bio: text(value.bio, 300), photoPath: path(value.photoPath),
    status: status(value.status), submittedAt: value.submittedAt, resubmission: flag(value.resubmission),
    changedFields: fields(value.changedFields), approvedFields: fields(value.approvedFields), correction };
}
export function parseReviewPage(value: unknown, venueId: string, filter: ReviewFilter, offset: number) {
  if (!isRecord(value) || value.venueId !== venueId || value.filter !== filter || value.offset !== offset || !isRecord(value.counts) || !Array.isArray(value.profiles) || value.profiles.length > 1) return invalid();
  const counts = {} as ReviewCounts;
  for (const item of REVIEW_FILTERS) {
    const count = value.counts[item.value];
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) return invalid();
    counts[item.value] = count;
  }
  if (counts.all !== counts.needs_review + counts.awaiting_changes + counts.approved) return invalid();
  const profiles = value.profiles.map(parseReviewProfile);
  if (profiles.some(profile => filter !== 'all' && profile.status !== filter)) return invalid();
  return { counts, profile: profiles[0] ?? null };
}
export type OwnerReview = { profileId: string; requestId: string; revision: string; status: ReviewStatus; fields: ReviewCorrection[]; updatedFields: ReviewField[]; canSubmit: boolean; notification: boolean };
export function parseOwnerReview(value: unknown, owner: string): OwnerReview | null {
  if (value === null) return null;
  if (!isRecord(value) || value.profileId !== owner || value.status === 'approved') return invalid();
  return { profileId: uuid(value.profileId), requestId: uuid(value.requestId), revision: uuid(value.revision), status: status(value.status),
    fields: corrections(value.fields), updatedFields: fields(value.updatedFields), canSubmit: flag(value.canSubmit), notification: flag(value.notification) };
}
