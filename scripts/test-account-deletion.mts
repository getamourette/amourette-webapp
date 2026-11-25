// #258: the founder deletion removes every photo file before the account, stops
// at the first failure without deleting the account, and a retry finishes it.
// The Storage and Auth clients are in-memory stand-ins; the real services run in
// tests/admin/account-deletion.spec.ts.
import assert from 'node:assert/strict';
// @ts-expect-error Node's type stripping requires the explicit source extension.
import { ACCOUNT_PHOTO_BUCKETS, deleteGuestAccount } from '../lib/server/account-deletion.ts';

const user = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';

function fakeService(files: Record<string, string[]>, failures: { list?: string; remove?: string; auth?: number } = {}) {
  const calls: string[] = [];
  let accountExists = true;
  return {
    calls, files, failures, get accountExists() { return accountExists; },
    storage: { from: (bucket: string) => ({
      async list(prefix: string, options: { limit: number }) {
        calls.push(`list ${bucket}`);
        if (failures.list === bucket) return { data: null, error: { message: 'list failed' } };
        return { data: (files[bucket] ?? []).filter(path => path.startsWith(`${prefix}/`)).slice(0, options.limit).map(path => ({ name: path.slice(prefix.length + 1) })), error: null };
      },
      async remove(paths: string[]) {
        calls.push(`remove ${bucket} ${paths.length}`);
        if (failures.remove === bucket) return { error: { message: 'remove failed' } };
        files[bucket] = (files[bucket] ?? []).filter(path => !paths.includes(path));
        return { error: null };
      },
    }) },
    auth: { admin: { async deleteUser(id: string) {
      calls.push(`delete ${id}`);
      if (failures.auth) return { error: { status: failures.auth, message: 'auth failed' } };
      accountExists = false;
      return { error: null };
    } } },
  };
}

const many = Array.from({ length: 230 }, (_, i) => `${user}/photo-${i}.webp`);
const seeded = () => ({
  'profile-photos': [...many, `${other}/kept.webp`],
  'profile-photo-staging': [`${user}/staged.jpg`],
  'profile-photo-sources': [`${user}/source.heic`],
  'profile-photo-rounds': [`${user}/round.png`, `${other}/round.png`],
});

// Every file of the user, in every bucket and past one listing page, goes before the account.
{
  const service = fakeService(seeded());
  const { removedFiles } = await deleteGuestAccount(service, user, true);
  assert.equal(removedFiles, 233);
  for (const bucket of ACCOUNT_PHOTO_BUCKETS) assert.deepEqual(service.files[bucket]?.filter(path => path.startsWith(user)) ?? [], [], `${bucket} emptied`);
  assert.deepEqual(service.files['profile-photos'], [`${other}/kept.webp`], 'another guest keeps their files');
  assert.deepEqual(service.files['profile-photo-rounds'], [`${other}/round.png`]);
  const deletedAt = service.calls.indexOf(`delete ${user}`);
  assert.ok(deletedAt > service.calls.lastIndexOf('remove profile-photo-rounds 1'), 'files first, account after');
  assert.equal(service.accountExists, false);
}

// A Storage failure stops before the account is deleted; the retry finishes the job.
for (const failure of [{ list: 'profile-photo-sources' }, { remove: 'profile-photo-staging' }]) {
  const service = fakeService(seeded(), failure);
  await assert.rejects(deleteGuestAccount(service, user, true), /storage_(list|remove)_failed/);
  assert.equal(service.accountExists, true, `account kept after ${JSON.stringify(failure)}`);
  assert.ok(!service.calls.some(call => call.startsWith('delete')));
  delete service.failures.list; delete service.failures.remove;
  await deleteGuestAccount(service, user, true);
  assert.equal(service.accountExists, false, 'the retry deletes the account');
  for (const bucket of ACCOUNT_PHOTO_BUCKETS) assert.equal(service.files[bucket]?.filter(path => path.startsWith(user)).length ?? 0, 0);
}

// An Auth failure is reported; an account already deleted (404) counts as done.
{
  const service = fakeService(seeded(), { auth: 500 });
  await assert.rejects(deleteGuestAccount(service, user, true), /auth_delete_failed/);
  const gone = fakeService(seeded(), { auth: 404 });
  await deleteGuestAccount(gone, user, true);
}

// The account already gone: only the leftover files are swept, no Auth call.
{
  const service = fakeService({ 'profile-photos': [`${user}/late.webp`] });
  const { removedFiles } = await deleteGuestAccount(service, user, false);
  assert.equal(removedFiles, 1);
  assert.ok(!service.calls.some(call => call.startsWith('delete')));
}

// A remove that claims success but leaves the files cannot loop forever.
{
  const service = fakeService({ 'profile-photos': [`${user}/stuck.webp`] });
  service.storage.from = (bucket: string) => ({
    async list() { return { data: bucket === 'profile-photos' ? [{ name: 'stuck.webp' }] : [], error: null }; },
    async remove() { return { error: null }; },
  });
  await assert.rejects(deleteGuestAccount(service, user, true), /storage_not_emptied/);
  assert.equal(service.accountExists, true);
}

console.log('account deletion steps: retry-safe, files before the account');
