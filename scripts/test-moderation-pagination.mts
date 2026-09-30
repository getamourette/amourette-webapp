import assert from 'node:assert/strict';
// @ts-expect-error Node's type stripping requires the explicit source extension.
import { readModerationPages, MODERATION_PAGE_SIZE } from '../lib/moderation-refresh.ts';

const rows = Array.from({ length: 1001 }, (_, i) => ({
  id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
}));
const signal = new AbortController().signal;
for (const cap of [MODERATION_PAGE_SIZE, 83]) {
  let reads = 0;
  const result = await readModerationPages(async after => {
    reads++;
    return { data: rows.filter(row => !after || row.id > after).slice(0, cap), error: null, status: 200 };
  }, row => row.id, signal);
  assert.deepEqual(result.data, rows, 'include every report even when the API caps below the requested size');
  assert.equal(reads, Math.ceil(rows.length / cap) + 1, 'only an empty page proves completion');
}

// Deleting an earlier row between pages must not shift the cursor past unread work.
const changing = [...rows];
const afterDelete = await readModerationPages(async after => {
  if (after) changing.shift();
  return { data: changing.filter(row => !after || row.id > after).slice(0, 200), error: null, status: 200 };
}, row => row.id, signal);
assert.deepEqual(afterDelete.data, rows);

for (const failure of [
  { data: null, error: { code: '42501', message: 'not authorized' }, status: 403 },
  { data: null, error: { message: 'unavailable' }, status: 503 },
]) {
  const result = await readModerationPages(async after => after ? failure : { data: rows.slice(0, 200), error: null, status: 200 }, row => row.id, signal);
  assert.deepEqual(result, failure, 'later-page failures retain their authorization/status and expose no partial data');
}
const controller = new AbortController();
let abortReads = 0;
await assert.rejects(readModerationPages(async () => {
  abortReads++;
  controller.abort();
  return { data: rows.slice(0, 200), error: null, status: 200 };
}, row => row.id, controller.signal), { name: 'AbortError' });
assert.equal(abortReads, 1, 'disposal prevents subsequent pages');
await assert.rejects(readModerationPages(async () => ({ data: rows.slice(0, 200), error: null, status: 200 }), row => row.id, signal), /queue_cursor_did_not_advance/);
console.log('moderation pagination: 1001 reports, lower server caps, deletion, later-page refusal and cancellation passed');
