import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// #462: `page.waitForLoadState('networkidle')` resolves at once when the page has
// already been idle since its last navigation, even if requests are in flight
// now. Used in the middle of a test it waits for nothing, and the next step races
// background reads (the flaky participant-sync and feed-photo journeys). Only
// directly after `goto`/`reload` does it wait. Elsewhere, wait for the request or
// response that matters, or advance a fake clock until the effect is visible.
// Existing uses are frozen below and may only go down.
const frozen = {
  'tests/admin/reservation-operations.spec.ts': 2,
  'tests/profile/participant-sync-ui.spec.ts': 7,
  'tests/profile/photo-recovery.spec.ts': 2,
  'tests/profile/preference-edits-ui.spec.ts': 2,
  'tests/reservations/booking.spec.ts': 1,
  'tests/security/headers.spec.ts': 1,
};

const NAVIGATION = /\.(?:goto|reload)\(/;
const IDLE = /waitForLoadState\(\s*['"]networkidle['"]/;

/** Lines that wait for networkidle without a navigation just before them. */
export function midTestIdleWaits(source) {
  const lines = source.split('\n');
  const found = [];
  lines.forEach((line, index) => {
    const match = IDLE.exec(line);
    if (!match) return;
    const before = line.slice(0, match.index);
    let previous = index - 1;
    while (previous >= 0 && lines[previous].trim() === '') previous--;
    // Same statement line as the navigation, or alone right after it.
    const alone = /^\s*await\s+[\w.]+\.$/.test(before);
    const navigated = NAVIGATION.test(before) || (alone && previous >= 0 && NAVIGATION.test(lines[previous]));
    if (!navigated) found.push(index + 1);
  });
  return found;
}

// Red, then green, on synthetic sources.
for (const bad of [
  "await page.clock.runFor(1000);await page.waitForLoadState('networkidle');",
  "  release();\n  await page.waitForLoadState('networkidle');",
  'await expect(image).toBeVisible();\nawait page.waitForLoadState("networkidle");',
]) assert.equal(midTestIdleWaits(bad).length, 1, `should refuse: ${bad}`);
for (const ok of [
  "await page.goto('/v/test-bar');\nawait page.waitForLoadState('networkidle');",
  "await page.reload();\n\n  await page.waitForLoadState('networkidle');",
  "await page.goto('/');await page.waitForLoadState('networkidle');",
  "await page.waitForLoadState('load');",
]) assert.deepEqual(midTestIdleWaits(ok), [], `should accept: ${ok}`);

const root = new URL('..', import.meta.url).pathname;
function files(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(?:ts|mts|mjs)$/.test(name) ? [path] : [];
  });
}
const counts = {};
for (const path of files(join(root, 'tests'))) {
  const found = midTestIdleWaits(readFileSync(path, 'utf8'));
  if (found.length) counts[relative(root, path)] = found.length;
}
for (const [file, count] of Object.entries(counts)) {
  assert.ok(count <= (frozen[file] ?? 0),
    `${file} waits for networkidle in the middle of a test ${count} time(s), frozen at ${frozen[file] ?? 0}. ` +
    'It resolves at once after the first load: wait for the specific request or response instead.');
}
for (const [file, count] of Object.entries(frozen)) {
  assert.equal(counts[file] ?? 0, count, `${file} now has ${counts[file] ?? 0} mid-test networkidle wait(s): lower its frozen count to match.`);
}
console.log('Playwright networkidle waits: only after a navigation, or frozen.');
