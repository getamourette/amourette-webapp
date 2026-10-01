import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { readFileSync } from 'node:fs';
import { test, expect } from "../helpers/fixtures";

test('HEIC preparation stays owner-only and final submission retains a full private PNG source', async ({ data, request }) => {
  test.setTimeout(120_000);
  const owner = await data.identity('HeicSource'), other = await data.identity('HeicOther');
  const headers = { Authorization: `Bearer ${owner.session.access_token}` };
  const source = readFileSync('tests/fixtures/heic/p3-10.heic');
  const client = createClient(data.env.url, data.env.publishableKey, { auth: { persistSession: false } });
  await client.auth.setSession(owner.session);
  const permission = await request.post('/api/profile-photo/prepare', { headers, data: { type: 'image/heic', size: source.length } });
  expect(permission.ok(), await permission.text()).toBeTruthy();
  const upload: { path: string; token: string; ticket: string } = await permission.json();
  const staged = await client.storage.from('profile-photo-staging').uploadToSignedUrl(upload.path, upload.token, source, { contentType: 'image/heic' });
  expect(staged.error, 'Apply the reviewed #279 staging MIME migration before running real HEIC transport tests').toBeNull();
  const stolen = await request.post('/api/profile-photo/prepare', { headers: { Authorization: `Bearer ${other.session.access_token}` }, data: { ticket: upload.ticket } });
  expect(stolen.status()).toBe(400);
  const wrongPurpose = await request.post('/api/profile-photo', { headers, data: { ticket: upload.ticket } });
  expect(wrongPurpose.status()).toBe(400);
  const prepared = await request.post('/api/profile-photo/prepare', { headers, data: { ticket: upload.ticket } });
  expect(prepared.ok(), await prepared.text()).toBeTruthy();
  expect(prepared.headers()['cache-control']).toBe('private, no-store');
  const png = await prepared.body();
  expect((await sharp(png).metadata()).bitsPerSample).toBe(16);
  const unpublished = await data.service.from('photo_versions').select('id').eq('profile_id', owner.id);
  expect(unpublished.error).toBeNull(); expect(unpublished.data).toEqual([]);

  const finalPermission = await request.post('/api/profile-photo/upload', { headers, data: {
    type: 'image/heic', size: source.length, revision: 0,
    profile: { first_name: owner.name, gender: 'woman', interested_in: ['man'], adult_confirmed: true,
      matching_consent: true, matching_consent_version: 'matching-v1-draft', matching_consent_locale: 'en' },
    crop: { x: 25, y: 0, width: 50, height: 100 }, roundSourceCrop: { x: 0, y: 0, width: 75, height: 100 },
  } });
  expect(finalPermission.ok(), await finalPermission.text()).toBeTruthy();
  const finalUpload: { path: string; token: string; ticket: string } = await finalPermission.json();
  expect((await client.storage.from('profile-photo-staging').uploadToSignedUrl(finalUpload.path, finalUpload.token, source, { contentType: 'image/heic' })).error).toBeNull();
  const response = await request.post('/api/profile-photo', { headers, data: { ticket: finalUpload.ticket } });
  expect(response.ok(), await response.text()).toBeTruthy();
  const { id }: { id: string } = await response.json();
  const version = await data.service.from('photo_versions').select('source_path,source_width,source_height,round_path').eq('id', id).single();
  expect(version.error).toBeNull();
  expect(version.data?.source_width).toBe(128); expect(version.data?.source_height).toBe(96);
  expect(version.data?.source_path).toMatch(/\.png$/); expect(version.data?.round_path).toMatch(/\.png$/);
  expect((await client.storage.from('profile-photo-sources').download(version.data!.source_path!)).error).toBeTruthy();
  const reopened = await request.get(`/api/profile-photo/source?version=${id}&revision=1`, { headers });
  expect(reopened.ok(), await reopened.text()).toBeTruthy();
  expect((await sharp(await reopened.body(), { ignoreIcc: true }).toColourspace('rgb16').raw({ depth: 'ushort' }).toBuffer())
    .equals(await sharp(png, { ignoreIcc: true }).toColourspace('rgb16').raw({ depth: 'ushort' }).toBuffer())).toBe(true);
});

test("large original uploads bypass Vercel, stay private and retain their pixels", async ({ data, request }) => {
  test.setTimeout(120_000); // A >5 MiB source crosses the shared remote Storage connection twice.
  const owner = await data.identity("OriginalPhoto");
  const other = await data.identity("OtherPhoto");
  // Uncompressed PNG deterministically exceeds the Vercel request boundary.
  const source = await sharp({ create: { width: 1500, height: 1500, channels: 3, background: "#b75e70" } })
    .png({ compressionLevel: 0 }).toBuffer();
  expect(source.length).toBeGreaterThan(5 * 1024 * 1024);
  expect(source.length).toBeLessThan(20 * 1024 * 1024);
  const headers = { Authorization: `Bearer ${owner.session.access_token}` };
  const oversizedBio = await request.post("/api/profile-photo/upload", {
    headers, data: { type: "image/png", size: source.length, revision: 0,
      profile: { first_name: owner.name, bio: "😀".repeat(301), gender: "woman", interested_in: ["man"], adult_confirmed: true, matching_consent: true, matching_consent_version: 'matching-v1-draft', matching_consent_locale: 'en' } },
  });
  expect(oversizedBio.status()).toBe(400);
  expect(await oversizedBio.json()).toEqual({ error: "bio_too_long" });
  const permission = await request.post("/api/profile-photo/upload", {
    headers, data: { type: "image/png", size: source.length, revision: 0,
      profile: { first_name: owner.name, bio: "😀".repeat(300), gender: "woman", interested_in: ["man"], adult_confirmed: true, matching_consent: true, matching_consent_version: 'matching-v1-draft', matching_consent_locale: 'en' } },
  });
  expect(permission.ok(), await permission.text()).toBeTruthy();
  const upload: { path: string; token: string; ticket: string } = await permission.json();
  const client = createClient(data.env.url, data.env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers },
  });
  const bucket = client.storage.from("profile-photo-staging");
  const staged = await bucket.uploadToSignedUrl(upload.path, upload.token, source, { contentType: "image/png" });
  expect(staged.error).toBeNull();
  expect((await bucket.download(upload.path)).error).not.toBeNull();
  const foreign = await request.post("/api/profile-photo", {
    headers: { Authorization: `Bearer ${other.session.access_token}` }, data: { ticket: upload.ticket },
  });
  expect(foreign.status()).toBe(400);
  expect((await data.service.storage.from("profile-photo-staging").download(upload.path)).error).toBeNull();
  const response = await request.post("/api/profile-photo", { headers, data: { ticket: upload.ticket } });
  expect(response.ok(), await response.text()).toBeTruthy();
  const result: { id: string } = await response.json();
  const version = await data.service.from("photo_versions").select("path,source_path").eq("id", result.id).single();
  expect(version.error).toBeNull();
  const stored = await data.service.storage.from("profile-photos").download(version.data!.path);
  expect(stored.error).toBeNull();
  const actual = await sharp(Buffer.from(await stored.data!.arrayBuffer())).raw().toBuffer({ resolveWithObject: true });
  const original = await sharp(source).raw().toBuffer({ resolveWithObject: true });
  expect(actual.info).toEqual(original.info);
  expect(actual.data.equals(original.data)).toBe(true);
  // Large owner reads must stream through the authenticated route on Vercel.
  const reopened = await request.get(`/api/profile-photo/source?version=${result.id}&revision=1`, { headers });
  expect(reopened.ok(), await reopened.text()).toBeTruthy();
  const reopenedBytes = await reopened.body();
  expect(reopenedBytes.length).toBeGreaterThan(5 * 1024 * 1024);
  expect(await sharp(reopenedBytes).raw().toBuffer()).toEqual(original.data);
  expect((await client.storage.from('profile-photo-sources').download(version.data!.source_path!)).error).toBeTruthy();
  // A previously downloaded private object can remain in Storage's CDN cache.
  // Listing reflects the object table and verifies the staging row was deleted.
  await expect.poll(async () => {
    const remaining = await data.service.storage.from("profile-photo-staging").list(owner.id);
    expect(remaining.error).toBeNull();
    return remaining.data?.some(object => `${owner.id}/${object.name}` === upload.path);
  }).toBe(false);
  const stateBeforeReplay = await data.service.from('photo_state').select('revision,displayed_id,pending_id').eq('profile_id',owner.id).single();
  expect(stateBeforeReplay.error).toBeNull();
  const replay = await request.post("/api/profile-photo", { headers, data: { ticket: upload.ticket } });
  // Storage may still serve the deleted staging bytes from its CDN. Either the
  // missing upload or the stale revision must refuse replay before any effects.
  expect([400,409]).toContain(replay.status());
  const stateAfterReplay = await data.service.from('photo_state').select('revision,displayed_id,pending_id').eq('profile_id',owner.id).single();
  expect(stateAfterReplay.error).toBeNull();
  expect(stateAfterReplay.data).toEqual(stateBeforeReplay.data);
  const versions = await data.service.from('photo_versions').select('id').eq('profile_id',owner.id);
  expect(versions.error).toBeNull();
  expect(versions.data).toEqual([{id:result.id}]);
  expect((await data.service.storage.from("profile-photos").download(version.data!.path)).error).toBeNull();
});
