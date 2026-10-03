import type { PhotoReason } from './photo-moderation';

export const REVIEW_FIELDS = ['first_name', 'bio', 'photo'] as const;
export type ReviewField = typeof REVIEW_FIELDS[number];
export type ReviewStatus = 'needs_review' | 'awaiting_changes' | 'approved';
export type ReviewFilter = ReviewStatus | 'all';
export type ReviewCounts = Record<ReviewFilter, number>;
export type ReviewTextReason = 'sexual' | 'hateful' | 'harassment' | 'misleading_identity' | 'inappropriate';
export type ReviewCorrection =
  | { field: 'first_name' | 'bio'; reason: ReviewTextReason }
  | { field: 'photo'; reason: PhotoReason | 'legacy_unknown' };

export const REVIEW_LABELS: Record<ReviewField, string> = {
  first_name: 'Name', bio: 'Bio', photo: 'Profile picture',
};
export const REVIEW_FILTERS: { value: ReviewFilter; label: string }[] = [
  { value: 'needs_review', label: 'Needs review' },
  { value: 'awaiting_changes', label: 'Awaiting changes' },
  { value: 'approved', label: 'Approved' },
  { value: 'all', label: 'All profiles' },
];

// Match the merged #236 text and #194 photo vocabulary.
const textReasons: { value: ReviewTextReason; label: string }[] = [
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'sexual', label: 'Explicit sexual content' },
  { value: 'hateful', label: 'Hateful content' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'misleading_identity', label: 'Misleading identity' },
];
const photoReasons: { value: PhotoReason; label: string }[] = [
  { value: 'face_unclear', label: 'Face not clear' },
  { value: 'multiple_people', label: 'Multiple people' },
  { value: 'not_person', label: 'Not a photo of you' },
  { value: 'sexual', label: 'Explicit sexual content' },
  { value: 'violent', label: 'Violent content' },
];

export function reviewReasonOptions(field: ReviewField) {
  return field === 'photo' ? photoReasons : textReasons;
}

export function reviewCorrection(field: ReviewField, reason: string): ReviewCorrection | null {
  if (field === 'photo') {
    const option = photoReasons.find(option => option.value === reason);
    return option ? { field, reason: option.value } : null;
  }
  const option = textReasons.find(option => option.value === reason);
  return option ? { field, reason: option.value } : null;
}

export type ReviewProfile = {
  id: string;
  revision: string;
  firstName: string | null;
  bio: string | null;
  photoPath: string | null;
  status: ReviewStatus;
  submittedAt: string;
  resubmission: boolean;
  changedFields: ReviewField[];
  approvedFields: ReviewField[];
  correction: {
    fields: ReviewCorrection[];
    original: { firstName: string | null; bio: string | null; photoPath: string | null };
  } | null;
};

export function reviewCounts(profiles: readonly Pick<ReviewProfile, 'status'>[]): ReviewCounts {
  const counts: ReviewCounts = { needs_review: 0, awaiting_changes: 0, approved: 0, all: profiles.length };
  for (const profile of profiles) counts[profile.status]++;
  return counts;
}

export function orderedReviews(profiles: readonly ReviewProfile[], filter: ReviewFilter): ReviewProfile[] {
  return profiles.filter(profile => filter === 'all' || profile.status === filter).sort((a, b) =>
    Number(b.resubmission) - Number(a.resubmission) ||
    a.submittedAt.localeCompare(b.submittedAt) || a.id.localeCompare(b.id));
}

export function correctionMessage(corrections: readonly ReviewCorrection[]): string {
  const labels = REVIEW_FIELDS.filter(field => corrections.some(item => item.field === field))
    .map(field => REVIEW_LABELS[field].toLowerCase());
  if (!labels.length) return '';
  const list = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
  return `Please update your ${list} so we can approve your profile.`;
}

export function reviewReady(fields: readonly ReviewCorrection[], updated: readonly ReviewField[], serverReady: boolean): boolean {
  return serverReady === true && fields.length > 0 && fields.length <= REVIEW_FIELDS.length &&
    new Set(fields.map(item => item.field)).size === fields.length &&
    fields.every(item => updated.includes(item.field));
}

export type ReviewQueue = {
  venueId: string;
  filter: ReviewFilter;
  inspectionId: string;
  counts: ReviewCounts;
  profile: ReviewProfile | null;
  position: number;
  total: number;
};
export type ReviewOutcome = 'saved' | 'stale' | 'uncertain';
