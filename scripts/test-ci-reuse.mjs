import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { documentationDelta, findReusable, parseProof } from './ci-reuse.mjs';
import { needsBrowser, selectPlan } from './ci-plan.mjs';

const base = 'a'.repeat(40), head = 'b'.repeat(40), prior = 'c'.repeat(40);
const repository = 'getamourette/amourette-webapp';
const current = { base, head, repository, branch: 'feature/test', event: 'pull_request', runId: '9', plan: selectPlan(['lib/auth.ts']), browser: true };
const run = { id: 1, head_sha: prior, path: '.github/workflows/ci.yml', head_repository: { full_name: repository }, head_branch: current.branch, event: 'pull_request', status: 'completed', conclusion: 'success' };
const evidence = { name: `CI evidence v1 ${base} ${prior} full true`, conclusion: 'success' };
const check = (overrides = {}, changes = {}, job = evidence, delta = () => true) => findReusable({ current: { ...current, ...changes }, runs: [{ ...run, ...overrides }], jobs: async () => [job], delta });
assert.equal((await check()).id, 1, 'docs after success');
assert.equal(await findReusable({ current, runs: [], jobs: async () => [] }), null, 'no previous success');
for (const conclusion of ['failure', 'cancelled', 'timed_out', null]) assert.equal(await check({ conclusion }), null);
assert.equal(await check({ status: 'in_progress' }), null);
assert.equal(await check({}, { base: head }), null, 'changed main invalidates proof');
assert.equal(await check({}, {}, evidence, () => false), null, 'changed executable tree');
assert.equal(await check({}, {}, { ...evidence, conclusion: 'skipped' }), null);
assert.equal(await check({}, {}, { name: 'old CI without proof', conclusion: 'success' }), null);
assert.equal(await check({}, {}, { ...evidence, name: `CI evidence v1 ${base} ${prior} full false` }), null, 'draft success cannot satisfy ready');
assert.equal(await check({}, { event: 'workflow_dispatch' }), null, 'manual always executes');
assert.equal((await check({ event: 'workflow_dispatch' })).id, 1, 'real manual full coverage qualifies');
assert.equal(await check({ head_repository: { full_name: 'fork/repo' } }), null);
assert.equal(await check({ head_branch: 'feature/other' }), null);
assert.equal(await check({ path: '.github/workflows/other.yml' }), null);
assert.equal(await check({ event: 'push' }), null);
assert.equal(await check({ id: 9 }), null);
assert.equal(await check({ head_sha: head }), null, 'proof must name the run source revision');
assert.equal(await check({}, {}, { ...evidence, name: `CI evidence v1 ${base} ${prior} targeted true` }), null, 'targeted cannot cover full');
assert.equal(await findReusable({ current, runs: [{ ...run, conclusion: 'failure' }, { ...run, id: 2 }], jobs: async () => [evidence], delta: () => true }), null, 'never hide latest equivalent failure');
assert.equal(parseProof(`CI evidence v1 ${base} ${prior} full maybe`), null);
for (const paths of [['app/chat/page.tsx'], ['package.json'], ['unknown']]) {
  const plan = selectPlan(paths);
  assert.equal(needsBrowser(plan, 'pull_request', true), false);
  assert.equal(needsBrowser(plan, 'pull_request', false), true);
  assert.equal(needsBrowser(plan, 'workflow_dispatch', true), true);
}
assert.equal(needsBrowser(selectPlan(['docs/decisions.md']), 'pull_request', false), false);

// Real Git trees: multiple documentation commits preserve the tested code;
// changes outside the allowlist, renames, divergent history and missing refs do not.
const selector = resolve('scripts/ci-plan.mjs');
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
assert.match(workflow, /types: \[opened, synchronize, reopened, ready_for_review, converted_to_draft\]/);
assert.match(workflow, /group: supabase-development-e2e\n      cancel-in-progress: false\n      queue: max/);
assert.match(workflow, /needs: \[plan, checks, e2e\]/);
assert.match(workflow, /!cancelled\(\) && needs.plan.result == 'success' && needs.checks.result == 'success' && needs.e2e.result == 'success'/, 'explicit results let successful draft checks certify their limited coverage despite the skipped browser ancestor');
const dir = mkdtempSync(join(tmpdir(), 'ci-reuse-'));
const cwd = process.cwd();
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
try {
  process.chdir(dir);
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.com');
  mkdirSync('docs'); writeFileSync('app.ts', 'code'); writeFileSync('docs/decisions.md', 'before');
  git('add', '.'); git('commit', '-qm', 'initial');
  const tested = git('rev-parse', 'HEAD');
  for (const file of ['docs/decisions.md', 'docs/workflow.md']) {
    writeFileSync(file, 'after'); git('add', '.'); git('commit', '-qm', 'docs');
  }
  assert.equal(documentationDelta(tested, git('rev-parse', 'HEAD')), true);
  for (const path of ['app.ts', 'tests.ts', 'package-lock.json', 'ci.yml', 'schema.sql', 'unknown.md']) {
    writeFileSync(path, 'changed'); git('add', '.'); git('commit', '-qm', 'behavior');
    assert.equal(documentationDelta(tested, git('rev-parse', 'HEAD')), false, path);
    git('revert', '--no-edit', 'HEAD');
  }
  git('mv', 'app.ts', 'docs/app.md'); git('commit', '-qm', 'rename');
  assert.equal(documentationDelta(tested, git('rev-parse', 'HEAD')), false);
  assert.equal(documentationDelta(git('rev-parse', 'HEAD'), tested), false);
  assert.equal(documentationDelta('0'.repeat(40), tested), false);
  assert.equal(documentationDelta('--help', tested), false);
  const eventFile = join(dir, 'event.json');
  const outputs = join(dir, 'outputs');
  const execute = (event, draft) => {
    writeFileSync(eventFile, JSON.stringify({ pull_request: { draft, head: { ref: 'feature/test' } } }));
    writeFileSync(outputs, '');
    execFileSync(process.execPath, [selector, '--github'], { encoding: 'utf8', env: {
      ...process.env, GH_TOKEN: '', CI_BASE: tested, CI_HEAD: git('rev-parse', 'HEAD'),
      GITHUB_EVENT_NAME: event, GITHUB_EVENT_PATH: eventFile, GITHUB_OUTPUT: outputs, GITHUB_STEP_SUMMARY: '',
    }, stdio: ['ignore', 'pipe', 'pipe'] });
    return readFileSync(outputs, 'utf8');
  };
  assert.match(execute('pull_request', true), /browser=false/);
  assert.match(execute('pull_request', false), /browser=true/);
  assert.throws(() => execute('pull_request', 'false'), /Missing PR draft state/);
  git('update-ref', 'refs/remotes/origin/main', tested);
  assert.match(execute('workflow_dispatch', true), /browser=true/);
  assert.match(execute('workflow_dispatch', true), /mode=full/);
} finally { process.chdir(cwd); rmSync(dir, { recursive: true, force: true }); }
console.log('CI reuse: provenance, scope, stages, failure fallback and real Git tree checks passed.');
