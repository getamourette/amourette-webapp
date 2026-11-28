// Refreshes scripts/browser-timings.json from the Chromium browser jobs of real
// CI runs: the seconds each spec file took, averaged over the given runs. CI uses
// the table to split browser specs into shards of similar duration (#ci-wait).
//
//   node scripts/browser-timings.mjs <run id> [<run id> ...]
//
// Pick recent green merge queue runs: they always execute the full suite. A spec
// missing from the table still runs, with the median weight, so a stale table
// only costs balance, never coverage.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const timingsFile = 'scripts/browser-timings.json';

// One line of Playwright's list reporter, for example
// "  ✓   12 [chromium-mobile] › tests/room/x.spec.ts:10:5 › title (3.2s)".
const line = /\[chromium-mobile\] › (tests\/[^:\s]+\.spec\.ts):\d+:\d+ › .*\((\d+(?:\.\d+)?)(ms|s|m)\)\s*$/;
export function specSeconds(log) {
  const seconds = {};
  for (const text of log.split('\n')) {
    const match = line.exec(text);
    if (!match) continue;
    const value = Number(match[2]) * { ms: 0.001, s: 1, m: 60 }[match[3]];
    seconds[match[1]] = (seconds[match[1]] ?? 0) + value;
  }
  return seconds;
}

function main() {
  const runs = process.argv.slice(2);
  if (!runs.length || runs.some(run => !/^\d+$/.test(run))) throw new Error('Usage: node scripts/browser-timings.mjs <run id> [<run id> ...]');
  const repo = process.env.GITHUB_REPOSITORY ?? 'getamourette/amourette-webapp';
  const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const totals = {};
  for (const run of runs) {
    const jobs = gh('api', `repos/${repo}/actions/runs/${run}/jobs?per_page=100`, '--jq',
      '.jobs[] | select(.name | startswith("Execute browser coverage")) | .id').split('\n').filter(Boolean);
    if (!jobs.length) throw new Error(`Run ${run} has no browser coverage job`);
    const seconds = {};
    for (const job of jobs) Object.assign(seconds, specSeconds(gh('api', `repos/${repo}/actions/jobs/${job}/logs`)));
    for (const [spec, value] of Object.entries(seconds)) (totals[spec] ??= []).push(value);
  }
  const table = Object.fromEntries(Object.keys(totals).sort()
    .map(spec => [spec, Math.max(1, Math.round(totals[spec].reduce((a, b) => a + b, 0) / totals[spec].length))]));
  writeFileSync(timingsFile, JSON.stringify(table, null, 2) + '\n');
  console.log(`${Object.keys(table).length} specs written to ${timingsFile} from ${runs.length} run(s).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
