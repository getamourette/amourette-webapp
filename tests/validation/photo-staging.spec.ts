import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { test, expect } from "../helpers/fixtures";

test("large original uploads bypass Vercel, stay private and retain their pixels", async ({ data, request }) => {
  test.setTimeout(120_000); // 5 MiB crosses the shared remote Storage connection twice.
  const owner = await data.identity("OriginalPhoto");
  const other = await data.identity("OtherPhoto");
  // Uncompressed PNG deterministically exceeds the Vercel request boundary.
  const source = await sharp({ create: { width: 1280, height: 1280, channels: 3, background: "#b75e70" } })
    .png({ compressionLevel: 0 }).toBuffer();
  expect(source.length).toBeGreaterThan(4.5 * 1024 * 1024);
  expect(source.length).toBeLessThan(5 * 1024 * 1024);
  const headers = { Authorization: `Bearer ${owner.session.access_token}` };
  const permission = await request.post("/api/profile-photo/upload", {
    headers, data: { type: "image/png", size: source.length, revision: 0,
      profile: { first_name: owner.name, gender: "woman", interested_in: ["man"], adult_confirmed: true } },
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
  const version = await data.service.from("photo_versions").select("path").eq("id", result.id).single();
  expect(version.error).toBeNull();
  const stored = await data.service.storage.from("profile-photos").download(version.data!.path);
  expect(stored.error).toBeNull();
  const actual = await sharp(Buffer.from(await stored.data!.arrayBuffer())).raw().toBuffer({ resolveWithObject: true });
  const original = await sharp(source).raw().toBuffer({ resolveWithObject: true });
  expect(actual.info).toEqual(original.info);
  expect(actual.data.equals(original.data)).toBe(true);
  // A previously downloaded private object can remain in Storage's CDN cache.
  // Listing reflects the object table and verifies the staging row was deleted.
  const remaining = await data.service.storage.from("profile-photo-staging").list(owner.id);
  expect(remaining.error).toBeNull();
  expect(remaining.data?.some(object => `${owner.id}/${object.name}` === upload.path)).toBe(false);
  const replay = await request.post("/api/profile-photo", { headers, data: { ticket: upload.ticket } });
  expect(replay.status()).toBe(400);
  expect((await data.service.storage.from("profile-photos").download(version.data!.path)).error).toBeNull();
});
