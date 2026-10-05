const { createDecipheriv } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
const { protect } = require('./envelope.cjs');

function main() {
  const keyText = process.env.E2E_ARTIFACT_KEY;
  if (!/^[a-f0-9]{64}$/i.test(keyText ?? '')) throw new Error('Diagnostic key is unavailable or invalid.');
  const key = Buffer.from(keyText, 'hex');
  delete process.env.E2E_ARTIFACT_KEY;
  let archive;
  try {
    const encrypted = readFileSync('source/e2e-diagnostics.enc');
    const magic = Buffer.from('AMOUE2E1');
    if (encrypted.length < 36 || !encrypted.subarray(0, 8).equals(magic)) throw new Error('Invalid source diagnostic archive.');
    const decipher = createDecipheriv('aes-256-gcm', key, encrypted.subarray(8, 20));
    decipher.setAAD(magic);
    decipher.setAuthTag(encrypted.subarray(20, 36));
    archive = Buffer.concat([decipher.update(encrypted.subarray(36)), decipher.final()]);
    const envelope = protect(archive, readFileSync('recipient-public.pem'));
    writeFileSync('protected-diagnostics.enc', envelope, { mode: 0o600, flag: 'wx' });
    console.log('Diagnostics encrypted for the local recipient. No secret or plaintext was written to output.');
  } finally { key.fill(0); archive?.fill(0); }
}
try { main(); }
catch { console.error('Diagnostic recovery failed; no private failure details were printed.'); process.exitCode = 1; }
