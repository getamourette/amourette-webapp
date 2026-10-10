// Temporary, read-only recovery for #289. Only public-key-encrypted diagnostics
// leave the runner. Remove this helper and its public key before final validation.
import { publicEncrypt, randomBytes, constants } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decryptDiagnostics, encryptDiagnostics } from './e2e-artifacts.mjs';

const root = process.env.RUNNER_TEMP;
if (!root) throw new Error('Runner directory required');
const output = join(root, 'photo-recovery-output');
mkdirSync(output, { mode: 0o700 });
const publicKey = readFileSync(new URL('./photo-diagnostic-recovery-public.pub', import.meta.url));
for (const run of ['38008809672']) {
  const input = join(root, `photo-recovery-${run}`);
  mkdirSync(input, { mode: 0o700 });
  execFileSync('gh', ['run', 'download', run, '--repo', 'getamourette/amourette-webapp', '--name', `playwright-failure-${run}-1`, '--dir', input], { stdio: 'ignore' });
  const archive = decryptDiagnostics(readFileSync(join(input, 'e2e-diagnostics.enc')), process.env.E2E_ARTIFACT_KEY);
  const key = randomBytes(32);
  writeFileSync(join(output, `${run}.enc`), encryptDiagnostics(archive, key.toString('hex')), { mode: 0o600 });
  writeFileSync(join(output, `${run}.key`), publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, key), { mode: 0o600 });
  console.log(`Encrypted recovery prepared for run ${run}`);
}
