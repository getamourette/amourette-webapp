import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// #535: the repository is public. No tracked file may carry a personal email
// address (from a consumer mail provider) or an internal tailnet address in the
// 100.64/10 block. Test fixtures use example.com; internal previews are written
// as "<internal preview, not public>". See AGENTS.md, "Conventions".

const PERSONAL_PROVIDERS = [
  'gmail', 'googlemail', 'hotmail', 'outlook', 'live', 'msn', 'yahoo', 'ymail',
  'icloud', 'me', 'mac', 'aol', 'proton', 'protonmail', 'pm', 'gmx', 'free',
  'orange', 'wanadoo', 'laposte', 'sfr', 'yandex',
];
const PERSONAL_EMAIL = new RegExp(
  `[A-Za-z0-9._%+-]+@(?:${PERSONAL_PROVIDERS.join('|')})\\.[a-z]{2,}(?:\\.[a-z]{2,})?\\b`, 'gi',
);
// The 100.64/10 block is the carrier-grade NAT range Tailscale assigns to machines.
const TAILNET_ADDRESS = /\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b/g;

// Never echo the value itself: a failure message must not republish it.
const mask = (value) => value.includes('@')
  ? `${value[0]}***@${value.split('@')[1]}`
  : `${value.split('.')[0]}.x.x.x`;

function findings(text) {
  return [...text.matchAll(PERSONAL_EMAIL), ...text.matchAll(TAILNET_ADDRESS)].map((m) => m[0]);
}

// The patterns themselves, red then green on synthetic inputs. The refused
// samples are assembled at run time so this file passes its own scan.
const at = (local, domain) => [local, domain].join('@');
const ip = (...octets) => octets.join('.');
for (const bad of [at('someone', 'gmail.com'), at('A.B+tag', 'Hotmail.fr'), at('x', 'outlook.com'), at('x', 'free.fr'), `http://${ip(100, 100, 1, 2)}:8079/`, ip(100, 64, 0, 1), ip(100, 127, 255, 254)]) {
  assert.equal(findings(bad).length, 1, `should refuse ${mask(bad.replace(/^http:\/\//, ''))}`);
}
for (const ok of ['guest@example.com', 'hello@getamourette.com', 'privacy@getamourette.com', 'a@gmailabc', 'pro@seed.amourette.invalid', '100.63.0.1', '100.128.0.1', '192.168.1.10', 'width: 100.5']) {
  assert.deepEqual(findings(ok), [], `should accept ${ok}`);
}

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const problems = [];
for (const file of files) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; } // deleted in the working tree
  if (text.includes('\0')) continue; // binary
  text.split('\n').forEach((line, index) => {
    for (const value of findings(line)) problems.push(`${file}:${index + 1}: ${mask(value)}`);
  });
}
assert.deepEqual(problems, [], `Private details in a public repository (replace them, see AGENTS.md "Conventions"):\n${problems.join('\n')}`);
console.log(`public repo hygiene: ${files.length} tracked files clean`);
