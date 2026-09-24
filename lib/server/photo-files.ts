// These paths are fresh, server-generated UUIDs. Never include a reused source
// or a published version: rollback is safe only before the publication RPC.
export type PhotoFile = { bucket: string; path: string; bytes: Uint8Array; type: string };
type PhotoStorage = {
  from(bucket: string): {
    upload(path: string, bytes: Uint8Array, options: {contentType: string; upsert: boolean; cacheControl: string}): PromiseLike<{error: unknown}>;
    remove(paths: string[]): PromiseLike<unknown>;
  };
};

export async function uploadPhotoFiles(storage: PhotoStorage, files: PhotoFile[]): Promise<boolean> {
  const results = await Promise.allSettled(files.map(async file => storage.from(file.bucket)
    .upload(file.path, file.bytes, {contentType: file.type, upsert: false, cacheControl: '0'})));
  if (results.every(result => result.status === 'fulfilled' && !result.value.error)) return true;
  // Wait for every upload before rollback: a slow success must not resurrect an
  // orphan after cleanup. No publication RPC has run, so all fresh paths are safe
  // to remove, including a write whose transport response was lost.
  await Promise.allSettled(files.map(async file => storage.from(file.bucket).remove([file.path])));
  return false;
}
