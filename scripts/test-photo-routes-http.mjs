// #376 (SEC-013): the photo routes refuse over-quota work through the real handlers.
// Run after one production build. Supabase and the vision provider are a local
// fake: no project, no OpenAI call, no storage.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const user = '00000000-0000-4000-8000-000000000376';
const state = { quota: false, approved: false, claims: 0, provider: 0, signed: 0, unexpected: [] };
const directory = await mkdtemp(join(tmpdir(), 'photo-routes-http-'));
let next, adapter;
try {
  adapter = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const reply = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    const path = req.url.split('?')[0];
    if (path === '/auth/v1/user') return reply(200, { id: user, aud: 'authenticated', role: 'authenticated', is_anonymous: true });
    if (path === '/rest/v1/rpc/claim_photo_upload_ticket') {
      state.claims++;
      assert.deepEqual(JSON.parse(Buffer.concat(chunks).toString()), { p_owner: user });
      return reply(200, state.quota);
    }
    if (path === '/rest/v1/photo_state') return reply(200, { revision: 0 });
    if (path.startsWith('/storage/v1/object/upload/sign/')) { state.signed++; return reply(200, { url: `${path}?token=signed`, token: 'signed' }); }
    if (path === '/openai/responses') {
      state.provider++;
      return reply(200, { output_text: JSON.stringify({ approved: state.approved, reason: 'test' }) });
    }
    state.unexpected.push(`${req.method} ${path}`);
    return reply(500, { message: 'unexpected request in isolated photo test' });
  });
  await new Promise(resolve => adapter.listen(0, '127.0.0.1', resolve));
  const fake = `http://127.0.0.1:${adapter.address().port}`;
  // Redirect every Supabase and provider call of the server process to the fake.
  const preload = join(directory, 'fetch.mjs');
  await writeFile(preload, `const original=globalThis.fetch;globalThis.fetch=(input,init)=>{
    const raw=typeof input==='string'?input:input instanceof URL?input.href:input.url;const url=new URL(raw);
    let target=null;
    if(/^\\/(auth|rest|storage)\\/v1\\//.test(url.pathname))target=process.env.PHOTO_HTTP_FAKE+url.pathname+url.search;
    else if(url.origin==='https://api.openai.com'&&url.pathname==='/v1/responses')target=process.env.PHOTO_HTTP_FAKE+'/openai/responses';
    if(target===null)return original(input,init);
    return input instanceof Request?original(new Request(target,input),init):original(target,init);};`);
  const base = 'http://127.0.0.1:31186';
  next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '31186'], {
    env: { ...process.env, NODE_OPTIONS: `--import ${pathToFileURL(preload).href}`, PHOTO_HTTP_FAKE: fake,
      SUPABASE_SERVICE_ROLE_KEY: 'isolated-service', PROFILE_PHOTO_REVIEW_ENABLED: 'true', OPENAI_API_KEY: 'isolated-openai',
      EMAIL_DELIVERY_ENABLED: 'false', RESEND_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; next.stdout.on('data', c => { output += c; }); next.stderr.on('data', c => { output += c; });
  for (let i = 0; i < 200; i++) {
    try { if ((await fetch(`${base}/api/profile-photo/upload`, { method: 'POST' })).status === 401) break; } catch { /* starting */ }
    await new Promise(r => setTimeout(r, 100));
    if (i === 199) throw new Error('Next test server did not start: ' + output.slice(-1000));
  }
  const auth = { authorization: 'Bearer isolated-session' };
  const jpeg = await sharp({ create: { width: 900, height: 900, channels: 3, background: { r: 180, g: 120, b: 90 } } }).jpeg({ quality: 90 }).toBuffer();
  const publish = () => {
    const form = new FormData();
    form.set('photo', new Blob([jpeg], { type: 'image/jpeg' }), 'photo.jpg');
    form.set('revision', '0');
    return fetch(`${base}/api/profile-photo`, { method: 'POST', headers: auth, body: form });
  };
  const manifest = { type: 'image/jpeg', size: jpeg.length, revision: 0 };

  // The public review route is gone. (A multipart POST to any missing path gets
  // Next's own 409 from its form-action handling, so this one sends JSON.)
  const review = await fetch(`${base}/api/profile-photo/review`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(review.status, 404, 'POST /api/profile-photo/review no longer exists');

  // Over quota: 429, no upload URL, no paid review.
  state.quota = false;
  const upload = await fetch(`${base}/api/profile-photo/upload`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(manifest) });
  assert.equal(upload.status, 429); assert.deepEqual(await upload.json(), { error: 'too_many_uploads' });
  const heic = await fetch(`${base}/api/profile-photo/prepare`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'image/heic', size: 1000 }) });
  assert.equal(heic.status, 429);
  const refused = await publish();
  assert.equal(refused.status, 429, 'a reviewed publication over quota is refused');
  assert.equal(state.provider, 0, 'no provider call over quota');
  assert.equal(state.signed, 0, 'no upload URL over quota');
  assert.equal(state.claims, 3);

  // Within quota the same publication reaches the review, which still rejects a disapproved photo.
  state.quota = true; state.approved = false;
  const rejected = await publish();
  assert.equal(rejected.status, 422, 'a disapproved photo is still rejected');
  assert.equal(state.provider, 1);
  const allowed = await fetch(`${base}/api/profile-photo/upload`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(manifest) });
  assert.equal(allowed.status, 200); assert.equal(state.signed, 1);

  assert.deepEqual(state.unexpected, []);
  console.log('Photo routes over HTTP: review route 404, quota 429 without provider call, disapproved photo 422.');
} finally {
  if (next) { next.kill('SIGTERM'); await new Promise(resolve => next.once('exit', resolve)); }
  if (adapter) await new Promise(resolve => adapter.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
