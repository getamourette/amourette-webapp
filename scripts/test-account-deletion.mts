// #258: once the account is deleted, every photo file of the guest goes, in
// every bucket and past one listing page; a Storage failure is reported and a
// retry finishes the job; another guest's files are never touched. The Storage
// client is an in-memory stand-in; the real service runs in
// tests/admin/account-deletion.spec.ts.
import assert from 'node:assert/strict';
// @ts-expect-error Node's type stripping requires the explicit source extension.
import { ACCOUNT_PHOTO_BUCKETS, removePhotoFiles } from '../lib/server/account-deletion.ts';

const user = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';

function fakeStorage(files: Record<string, string[]>, failures: { list?: string; remove?: string } = {}) {
  return {
    files, failures,
    storage: { from: (bucket: string) => ({
      async list(prefix: string, options: { limit: number }) {
        if (failures.list === bucket) return { data: null, error: { message: 'list failed' } };
        return { data: (files[bucket] ?? []).filter(path => path.startsWith(`${prefix}/`)).slice(0, options.limit).map(path => ({ name: path.slice(prefix.length + 1) })), error: null };
      },
      async remove(paths: string[]) {
        if (failures.remove === bucket) return { error: { message: 'remove failed' } };
        files[bucket] = (files[bucket] ?? []).filter(path => !paths.includes(path));
        return { error: null };
      },
    }) },
  };
}
const seeded = () => ({
  'profile-photos': [...Array.from({ length: 230 }, (_, i) => `${user}/photo-${i}.webp`), `${other}/kept.webp`],
  'profile-photo-staging': [`${user}/staged.jpg`],
  'profile-photo-sources': [`${user}/source.png`],
  'profile-photo-rounds': [`${user}/round.png`, `${other}/round.png`],
});
const left = (files: Record<string, string[]>) => ACCOUNT_PHOTO_BUCKETS.flatMap(bucket => (files[bucket] ?? []).filter(path => path.startsWith(user)));

// Every file of the guest, in every bucket and past one listing page.
{
  const service = fakeStorage(seeded());
  assert.equal(await removePhotoFiles(service, user), 233);
  assert.deepEqual(left(service.files), []);
  assert.deepEqual(service.files['profile-photos'], [`${other}/kept.webp`], 'another guest keeps their files');
  assert.deepEqual(service.files['profile-photo-rounds'], [`${other}/round.png`]);
}

// A Storage failure is reported; the retry removes what is left.
for (const failure of [{ list: 'profile-photo-sources' }, { remove: 'profile-photo-staging' }]) {
  const service = fakeStorage(seeded(), failure);
  await assert.rejects(removePhotoFiles(service, user), /storage_(list|remove)_failed/);
  assert.ok(left(service.files).length > 0, `files remain after ${JSON.stringify(failure)}`);
  delete service.failures.list; delete service.failures.remove;
  await removePhotoFiles(service, user);
  assert.deepEqual(left(service.files), [], 'the retry finishes');
}

// A remove that claims success but leaves the files cannot loop forever.
{
  const service = fakeStorage({});
  service.storage.from = (bucket: string) => ({
    async list() { return { data: bucket === 'profile-photos' ? [{ name: 'stuck.webp' }] : [], error: null }; },
    async remove() { return { error: null }; },
  });
  await assert.rejects(removePhotoFiles(service, user), /storage_not_emptied/);
}

console.log('account deletion photo sweep: complete, retry-safe, scoped to the guest');
