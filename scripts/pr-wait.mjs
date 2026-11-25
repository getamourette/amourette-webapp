// Waits for the two required checks of a pull request's latest commit, and only
// for them: non-blocking jobs (WebKit) are read afterwards. It fails at once on a
// conflict with main (GitHub starts no pull_request run then), fails when no CI
// run has started on the head commit after a few minutes, and never waits past
// its time limit. Usage: npm run pr:wait -- <number> [--timeout <minutes>] [--start <minutes>]
// Rule: docs/workflow.md, "Waiting for CI".
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// The checks the `Required PR tests` ruleset requires. Changing that list is a
// founder decision; keep this constant in step with it.
export const requiredChecks = ['Lint, logic and build', 'Playwright Chromium mobile'];

// One poll of the pull request, its head commit's CI runs and check runs, turned
// into a verdict. `done: false` means keep waiting. `expected` is the commit just
// pushed from this checkout: right after a push the pull request can still show
// the previous head, whose green checks prove nothing. Pure, so tested offline.
export function judge({ state, mergeable, head, runs, checks }, { waited, sinceHead }, { timeout, start, expected = null }) {
  const short = head.slice(0, 7);
  if (state !== 'OPEN') return { done: true, ok: false, message: `The pull request is ${state.toLowerCase()}.` };
  if (expected && head !== expected) {
    if (waited >= start) return { done: true, ok: false, message: `The pull request still shows ${short}, not the local ${expected.slice(0, 7)}, after ${start} min. Check that the push succeeded.` };
    return { done: false, message: `The pull request still shows ${short}; waiting for the pushed ${expected.slice(0, 7)}` };
  }
  if (mergeable === 'CONFLICTING') {
    return { done: true, ok: false, message: `Conflict with main: GitHub starts no CI run until it is resolved. Update the branch from main and push.` };
  }
  const latest = name => checks.filter(check => check.name === name).sort((a, b) => b.id - a.id)[0];
  const results = requiredChecks.map(name => ({ name, check: latest(name) }));
  const failed = results.filter(({ check }) => check?.status === 'completed' && check.conclusion !== 'success');
  if (failed.length) {
    return { done: true, ok: false, message: `Required check failed on ${short}: ${failed.map(({ name, check }) => `${name} (${check.conclusion})`).join(', ')}.` };
  }
  if (results.every(({ check }) => check?.conclusion === 'success')) {
    return { done: true, ok: true, message: `Both required checks passed on ${short}. Non-blocking jobs may still run: read them afterwards.` };
  }
  if (runs === 0 && sinceHead >= start) {
    return { done: true, ok: false, message: `No CI run started on ${short} after ${start} min. Check that the push reached GitHub, that the PR targets main and that Actions is not down; do not keep waiting.` };
  }
  if (waited >= timeout) {
    const pending = results.filter(({ check }) => check?.conclusion !== 'success').map(({ name, check }) => `${name} (${check?.status ?? 'not started'})`);
    return { done: true, ok: false, message: `Time limit of ${timeout} min reached on ${short}; still pending: ${pending.join(', ')}. Diagnose the run (runner queue, stuck job) and report it.` };
  }
  const status = runs === 0 ? 'waiting for a CI run to start' : results.map(({ name, check }) => `${name}: ${check?.status ?? 'not started'}`).join(', ');
  return { done: false, message: `${short}, ${mergeable === 'UNKNOWN' ? 'mergeability not computed yet, ' : ''}${status}` };
}

function gh(args) {
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8' }));
}

function snapshot(repository, number) {
  const pr = gh(['pr', 'view', String(number), '--repo', repository, '--json', 'state,mergeable,headRefOid,headRefName']);
  const head = pr.headRefOid;
  const runs = gh(['api', `repos/${repository}/actions/workflows/ci.yml/runs?head_sha=${head}&event=pull_request&per_page=1`]).total_count;
  const checks = gh(['api', `repos/${repository}/commits/${head}/check-runs?per_page=100`]).check_runs
    .map(({ id, name, status, conclusion }) => ({ id, name, status, conclusion }));
  return { state: pr.state, mergeable: pr.mergeable, head, branch: pr.headRefName, runs, checks };
}

// The local HEAD, when this checkout is on the pull request's branch.
function localHead(branch) {
  try {
    const git = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return git(['rev-parse', '--abbrev-ref', 'HEAD']) === branch ? git(['rev-parse', 'HEAD']) : null;
  } catch {
    return null;
  }
}

function option(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(args[index + 1]);
  if (!(value > 0 && value <= 120)) throw new Error(`${name} takes a number of minutes between 0 and 120`);
  return value;
}

async function main(args) {
  const number = Number(args[0]);
  if (!Number.isInteger(number) || number < 1) throw new Error('Usage: npm run pr:wait -- <number> [--timeout <minutes>] [--start <minutes>]');
  const limits = { timeout: option(args, '--timeout', 40), start: option(args, '--start', 5) };
  const repository = process.env.GITHUB_REPOSITORY ?? 'getamourette/amourette-webapp';
  const began = Date.now();
  let head = null;
  let headSeen = began;
  for (;;) {
    const now = snapshot(repository, number);
    limits.expected ??= localHead(now.branch);
    if (now.head !== head) { head = now.head; headSeen = Date.now(); }
    const minutes = since => (Date.now() - since) / 60000;
    const verdict = judge(now, { waited: minutes(began), sinceHead: minutes(headSeen) }, limits);
    console.log(`[${new Date().toISOString().slice(11, 19)}] ${verdict.message}`);
    if (verdict.done) return verdict.ok ? 0 : 1;
    await new Promise(resolve => setTimeout(resolve, 20000));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(code => process.exit(code), error => { console.error(error.message); process.exit(2); });
}
