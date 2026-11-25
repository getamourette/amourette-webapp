// Sorts a pull request into the fast or the sensitive review lane from its changed
// files, and checks that the founder card announces the same lane. Rule and lists:
// docs/workflow.md, "Review lanes". A Ready pull request whose card says "Fast lane"
// while its files say sensitive fails; a draft is only reported. Announcing
// "Sensitive lane" for a fast change is always allowed: an agent may escalate.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Above this many changed lines of application code, a change is not "small"
// any more, whatever it touches. Tests, docs and binary captures do not count.
export const fastLineLimit = 400;

const rules = [
  [/^supabase\/|\.sql$|^lib\/database\.types\.ts$/, 'database'],
  [/^(?:AGENTS\.md|CLAUDE\.md|docs\/workflow\.md)$|^\.(?:claude|codex)\//, 'agent rules'],
  [/^\.github\//, 'CI'],
  // Logic tests are ordinary changes; every other script is CI, database or seed tooling.
  [/^scripts\/(?!test-[^/]+\.(?:mjs|mts|ts)$)/, 'CI or database tooling'],
  // Every root file but the README: dependencies, build, proxy, environment.
  [/^(?!README\.md$)[^/]+$/, 'dependencies or configuration'],
  [/^lib\/(?:auth|supabase|guest-session|venue-session|admin-password-recovery|security-headers)\.ts$/, 'auth or session'],
  [/^app\/api\/|^lib\/server\//, 'server code'],
  [/^app\/(?:events|reservations|reservation-terms|preview)\/|^components\/(?:booking\/|ReservationQr\.tsx$)|^emails\/Reservation|^lib\/(?:launch-|booking|free-cancellation|cancellation-|reservation-configuration)[^/]*$/, 'reservations and payments'],
  [/^docs\/(?:launch-reservation-policy|production-cutover)\.md$|^lib\/(?:legal-content|privacy-policy)\.ts$/, 'legal or production policy'],
];

// Paths a fast change may touch once no rule above matched. Anything else, such as
// a new top-level folder, is sensitive until someone places it.
const test = /^tests\/.*\.spec\.ts$|^scripts\/test-[^/]+\.(?:mjs|mts|ts)$/;
const known = path => /^(?:app|components|emails|lib|tests|public|docs)\/|^README\.md$/.test(path) || test.test(path);
const counted = path => /^(?:app|components|emails|lib)\//.test(path);
// An added line that turns a browser test off.
const disables = /^\+.*\b(?:test|it|describe)\.(?:skip|fixme|only)\s*\(/m;

// files: [{ path, status ('added'|'modified'|'removed'|'renamed'), changes, patch }]
export function laneFor(files) {
  const reasons = new Set();
  let lines = 0;
  for (const file of files) {
    const rule = rules.find(([pattern]) => pattern.test(file.path));
    if (rule) reasons.add(rule[1]);
    else if (!known(file.path)) reasons.add('unclassified path');
    if (test.test(file.path) && file.status === 'removed') reasons.add('test removed');
    if (test.test(file.path) && disables.test(file.patch ?? '')) reasons.add('test disabled');
    if (counted(file.path)) lines += file.changes ?? 0;
  }
  if (lines > fastLineLimit) reasons.add(`more than ${fastLineLimit} changed lines of application code`);
  return reasons.size ? { lane: 'sensitive', reasons: [...reasons] } : { lane: 'fast', reasons: [] };
}

export function riskLine(body) {
  const match = /^\*\*Risk:\*\*(.*)$/m.exec((body ?? '').replace(/\r/g, ''));
  return match ? match[1].replace(/<!--.*?-->/g, '').trim() : null;
}

export function announced(line) {
  if (/^fast lane\b/i.test(line ?? '')) return 'fast';
  if (/^sensitive lane\b/i.test(line ?? '')) return 'sensitive';
  return null;
}

export function opening({ lane, reasons }) {
  return lane === 'fast' ? 'Fast lane.' : `Sensitive lane (${reasons.join(', ')}).`;
}

// level: 'pass' | 'fail', as in review-trace.mjs.
export function evaluateLane({ draft, body, files }) {
  const computed = laneFor(files);
  const card = announced(riskLine(body));
  const expected = `The files put it in the ${computed.lane} lane${computed.reasons.length ? ` (${computed.reasons.join(', ')})` : ''}.`;
  const how = `Open the Risk line of the founder card with "${opening(computed)}"`;
  if (draft) return { level: 'pass', lane: computed.lane, message: `Draft: lane not enforced yet. ${expected}` };
  if (!card) return { level: 'fail', lane: computed.lane, message: `Ready without a lane on the Risk line. ${expected} ${how}.` };
  if (card === 'fast' && computed.lane === 'sensitive') return { level: 'fail', lane: computed.lane, message: `The card announces the fast lane. ${expected} ${how}.` };
  return { level: 'pass', lane: card, message: `${card === 'fast' ? 'Fast' : 'Sensitive'} lane. ${expected}` };
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// The working branch against main, for the agent writing the card.
function localFiles(base) {
  const status = { A: 'added', D: 'removed', M: 'modified' };
  const counts = new Map(git('diff', '--numstat', '--no-renames', '-z', `${base}...HEAD`).split('\0').filter(Boolean)
    .map(entry => entry.split('\t')).map(([added, deleted, path]) => [path, (Number(added) || 0) + (Number(deleted) || 0)]));
  return git('diff', '--name-status', '--no-renames', `${base}...HEAD`).split('\n').filter(Boolean).map(line => {
    const [code, path] = line.split('\t');
    return { path, status: status[code[0]] ?? 'modified', changes: counts.get(path) ?? 0,
      patch: test.test(path) && code[0] !== 'D' ? git('diff', `${base}...HEAD`, '--', path) : '' };
  });
}

function pullFiles(repository, number) {
  const lines = execFileSync('gh', ['api', '--paginate', '--jq', '.[] | {path: .filename, previous: .previous_filename, status, changes, patch}', `repos/${repository}/pulls/${number}/files?per_page=100`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  // A rename is judged on both paths: a test moved out of the suite is a removal.
  return lines.split('\n').filter(Boolean).map(line => JSON.parse(line)).flatMap(file => file.status === 'renamed' && file.previous
    ? [{ path: file.previous, status: test.test(file.path) ? 'modified' : 'removed', changes: 0 }, { ...file, status: 'added' }] : [file]);
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--local') {
    const result = laneFor(localFiles(args[1] ?? 'origin/main'));
    console.log(`Risk line opening: ${opening(result)}`);
    return;
  }
  const number = args.find(argument => argument !== '--as-ready') ?? process.env.PR_NUMBER;
  const repository = process.env.GITHUB_REPOSITORY ?? 'getamourette/amourette-webapp';
  if (!/^\d+$/.test(number ?? '')) throw new Error('Usage: node scripts/review-lane.mjs <pull request number> [--as-ready] | --local [base]');
  const pull = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/pulls/${number}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  const result = evaluateLane({ draft: pull.draft && !args.includes('--as-ready'), body: pull.body, files: pullFiles(repository, number) });
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `**Review lane:** ${result.message}\n`);
  if (process.env.GITHUB_ACTIONS && result.level === 'fail') console.log(`::error::${result.message}`);
  console.log(`${result.level.toUpperCase()}: ${result.message}`);
  if (result.level === 'fail') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
