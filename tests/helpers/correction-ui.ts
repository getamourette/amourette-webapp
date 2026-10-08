import type { BrowserContext } from '@playwright/test';
import { mockNameUi, nameIds, nameUiState } from './name-ui-fixture';
import type { ReviewField } from '../../lib/profile-review';
import type { OwnerReview } from '../../lib/profile-review-data';
import type { TextCorrection } from '../../lib/text-moderation';

// Controlled transport exercises the real page and photo crop/upload client;
// the shared-schema moderation journeys separately verify authorization.
export async function mockCorrections(context: BrowserContext, fields: ReviewField[]) {
  const names = nameUiState();
  if (fields.includes('first_name')) names.name = null;
  if (fields.includes('bio')) names.bio = null;
  await mockNameUi(context, names);
  const state: OwnerReview = { profileId: nameIds.alice, requestId: crypto.randomUUID(), revision: crypto.randomUUID(),
    status: 'awaiting_changes', fields: fields.map(field => field === 'photo' ? { field, reason: 'face_unclear' } : { field, reason: 'misleading_identity' }),
    updatedFields: [], canSubmit: false, notification: true };
  const text: TextCorrection[] = fields.filter((field): field is 'first_name' | 'bio' => field !== 'photo').map(field => ({ field,
    revision: crypto.randomUUID(), required: true, reason: 'misleading_identity', status: null, request_id: null, proposed_text: null }));
  const faults = { save: false, loseSave: false, submit: false, loseSubmit: false, upload: false, read: false };
  const commands = { saves: [] as Record<string, unknown>[], cancellations: 0, submissions: 0, acknowledgements: 0, uploads: 0 };
  function saved(field: ReviewField) {
    state.updatedFields = [...new Set([...state.updatedFields, field])];
    state.canSubmit = fields.every(item => state.updatedFields.includes(item));
    state.revision = crypto.randomUUID();
  }
  await context.route('**/rest/v1/rpc/my_profile_review', route => route.fulfill({ json: state }));
  await context.route('**/rest/v1/rpc/my_text_corrections', route => route.fulfill(faults.read ? { status: 503, json: { message: 'Unavailable' } } : { json: text }));
  await context.route('**/rest/v1/rpc/acknowledge_profile_correction', route => {
    commands.acknowledgements++; state.notification = false;
    return route.fulfill({ json: null });
  });
  for (const field of ['first_name', 'bio'] as const) {
    const suffix = field === 'first_name' ? 'name' : 'bio';
    await context.route(`**/rest/v1/rpc/submit_${suffix}_correction`, route => {
      const args = route.request().postDataJSON(); commands.saves.push(args);
      if (faults.save) return route.fulfill({ status: 503, json: { message: 'Save unavailable' } });
      Object.assign(text.find(row => row.field === field)!, { status: 'pending', request_id: args.p_request_id, proposed_text: args.p_proposed_name ?? args.p_proposed_text });
      if (field === 'first_name') names.corrections.push({ id: args.p_request_id, proposed_name: args.p_proposed_name, status: 'pending', profile_id: nameIds.alice, created_at: new Date().toISOString(), reviewed_by: null, resolved_at: null });
      saved(field);
      return route.fulfill(faults.loseSave ? { status: 503, json: { message: 'Lost save response' } } : { json: args.p_request_id });
    });
    await context.route(`**/rest/v1/rpc/cancel_${suffix}_correction`, route => {
      commands.cancellations++;
      const row = text.find(row => row.request_id === route.request().postDataJSON().p_request_id)!;
      row.status = 'cancelled'; row.revision = crypto.randomUUID();
      state.updatedFields = state.updatedFields.filter(item => item !== field); state.canSubmit = false;
      return route.fulfill({ json: 'cancelled' });
    });
  }
  await context.route('**/rest/v1/rpc/submit_profile_review', route => {
    commands.submissions++;
    if (faults.submit) return route.fulfill({ status: 503, json: { message: 'Submit unavailable' } });
    state.status = 'needs_review';
    return route.fulfill(faults.loseSubmit ? { status: 503, json: { message: 'Lost submission response' } } : { json: null });
  });
  const photoState = { profile_id: nameIds.alice, displayed_id: null, pending_id: null as string | null,
    correction_required: fields.includes('photo'), reason: 'face_unclear', last_action: 'rejected', last_reason: 'face_unclear', revision: 1, updated_at: new Date().toISOString() };
  await context.route('**/rest/v1/photo_state?*', route => route.fulfill({ json: photoState }));
  await context.route('**/api/profile-photo/upload', route => route.fulfill({ json: { path: `${nameIds.alice}/test.jpg`, token: 'test', ticket: 'test' } }));
  await context.route('**/storage/v1/object/upload/sign/**', route => route.fulfill({ json: { Key: 'test.jpg' } }));
  await context.route('**/api/profile-photo', route => {
    commands.uploads++;
    if (faults.upload) return route.fulfill({ status: 503, json: {} });
    photoState.pending_id = crypto.randomUUID(); photoState.revision++;
    saved('photo'); return route.fulfill({ json: {} });
  });
  return { state, text, faults, commands, saved };
}
