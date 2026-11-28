import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { findReusable, parseProof, reusableDelta } from './ci-reuse.mjs';
import { automaticBrowserResumesAt, needsBrowser, selectPlan } from './ci-plan.mjs';

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
const noBrowserEvidence = { ...evidence, name: `CI evidence v1 ${base} ${prior} full false` };
assert.equal((await check({}, { browser: needsBrowser(current.plan, 'pull_request', false, automaticBrowserResumesAt - 1) }, noBrowserEvidence)).id, 1, 'limited evidence qualifies during the explicit suspension');
assert.equal(await check({}, { browser: needsBrowser(current.plan, 'pull_request', false, automaticBrowserResumesAt) }, noBrowserEvidence), null, 'suspension evidence cannot satisfy coverage after expiry');
assert.equal(await check({}, { event: 'workflow_dispatch' }), null, 'manual always executes');
assert.equal((await check({ event: 'workflow_dispatch' })).id, 1, 'real manual full coverage qualifies');
assert.equal(await check({ event: 'workflow_dispatch' }, { repeat: true }), null, 'a manual run never repeated the changed specs');
assert.equal((await check({}, { repeat: true })).id, 1, 'a pull_request run repeated them');
assert.equal(await check({ head_repository: { full_name: 'fork/repo' } }), null);
assert.equal(await check({ head_branch: 'feature/other' }), null);
assert.equal(await check({ path: '.github/workflows/other.yml' }), null);
assert.equal(await check({ event: 'push' }), null);
assert.equal(await check({ id: 9 }), null);
assert.equal(await check({ head_sha: head }), null, 'proof must name the run source revision');
assert.equal(await check({}, {}, { ...evidence, name: `CI evidence v1 ${base} ${prior} targeted true` }), null, 'targeted cannot cover full');
assert.equal(await findReusable({ current, runs: [{ ...run, conclusion: 'failure' }, { ...run, id: 2 }], jobs: async () => [evidence], delta: () => true }), null, 'never hide latest equivalent failure');
// A pure migration rename may follow main forward; anything else needs the same base.
const moved = { base: head };
const renamed = await check({}, moved, evidence, () => 'migration rename');
assert.equal(renamed?.id, 1, 'a pure migration rename reuses the proof after main moved');
assert.equal(renamed.change, 'migration rename');
assert.equal(await check({}, moved, evidence, () => 'documentation'), null, 'documentation still needs the same base');
assert.equal(await check({ conclusion: 'failure' }, moved, evidence, () => 'migration rename'), null, 'a failed run is never reused for a rename');
assert.equal(await check({}, moved, { ...evidence, name: `CI evidence v1 ${base} ${prior} targeted true` }, () => 'migration rename'), null, 'a rename keeps the coverage rule');
assert.equal(parseProof(`CI evidence v1 ${base} ${prior} full maybe`), null);
for (const paths of [['app/chat/page.tsx'], ['package.json'], ['unknown']]) {
  const plan = selectPlan(paths);
  assert.equal(needsBrowser(plan, 'pull_request', true), true, 'drafts execute browser coverage too');
  assert.equal(needsBrowser(plan, 'pull_request', false, automaticBrowserResumesAt), true);
  assert.equal(needsBrowser(plan, 'workflow_dispatch', true), true);
}
assert.equal(needsBrowser(selectPlan(['docs/decisions.md']), 'pull_request', false), false);

// Real Git trees: multiple documentation commits preserve the tested code;
// changes outside the allowlist, renames, divergent history and missing refs do not.
const selector = resolve('scripts/ci-plan.mjs');
const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
// The PR stage no longer changes coverage, so stage changes do not start a run.
assert.match(workflow, /types: \[opened, synchronize, reopened\]/);
// A new push supersedes the previous run of the same PR; manual and nightly runs never collide.
assert.match(workflow, /group: ci-\$\{\{ github\.event\.pull_request\.number \|\| github\.run_id \}\}\n  cancel-in-progress: true/);
// Browser jobs own a disposable local Supabase stack: no lock, no hosted credentials.
assert.doesNotMatch(workflow, /supabase-development-e2e|E2E_SUPABASE_/);
assert.match(workflow, /supabase start /);
assert.match(workflow, /shard: \$\{\{ fromJSON\(needs\.plan\.outputs\.shards\) \}\}/);
assert.match(workflow, /needs: \[plan, checks, e2e\]/);
assert.match(workflow, /!cancelled\(\) && needs.plan.result == 'success' && needs.checks.result == 'success' && needs.e2e.result == 'success'/, 'explicit results let successful draft checks certify their limited coverage despite the skipped browser ancestor');
// WebKit (#349) reports without blocking: no required check depends on it, the
// merge queue skips it, and a failure keeps the run green so reuse still works.
const webkitJob = /\n  webkit:\n([\s\S]*?)\n  [a-z-]+:\n/.exec(workflow)?.[1] ?? '';
assert.match(webkitJob, /\n    continue-on-error: true\n/, 'a WebKit failure must not fail the run');
assert.match(webkitJob, /github\.event_name != 'merge_group'/, 'the merge queue must not wait for WebKit');
// With at most 20 jobs at once for the organization, WebKit shards that start
// with the required job delay it behind them in the runner queue (#531).
assert.match(webkitJob, /\n    needs: \[plan, evidence\]\n/, 'WebKit starts after the required checks and the evidence job');
assert.match(webkitJob, /E2E_ENGINE: webkit/);
// It held 28 % of the runners while the organization sat at that ceiling
// (2026-11-23 to 2026-11-28): two shards at a time leave room for required jobs.
assert.match(webkitJob, /\n      max-parallel: 2\n/, 'at most two WebKit shards run at once');
const browserJob = /\n  browser:\n([\s\S]*?)\n  [a-z-]+:\n/.exec(workflow)?.[1] ?? '';
assert.doesNotMatch(browserJob, /max-parallel/, 'required browser shards all start at once');
for (const job of ['e2e', 'evidence']) {
  const needs = new RegExp(`\\n  ${job}:\\n[\\s\\S]*?needs: \\[([^\\]]*)\\]`).exec(workflow)?.[1] ?? '';
  assert.ok(needs && !needs.includes('webkit'), `${job} must not depend on WebKit`);
}
const dir = mkdtempSync(join(tmpdir(), 'ci-reuse-'));
const cwd = process.cwd();
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
try {
  process.chdir(dir);
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.com');
  mkdirSync('docs/decisions', { recursive: true }); writeFileSync('app.ts', 'code'); writeFileSync('docs/decisions.md', 'before');
  git('add', '.'); git('commit', '-qm', 'initial');
  const tested = git('rev-parse', 'HEAD');
  for (const file of ['docs/decisions.md', 'docs/workflow.md', 'docs/decisions/2026-11-23-one-file-per-decision.md', 'docs/decisions/2026-11-24-another.md']) {
    writeFileSync(file, 'after'); git('add', '.'); git('commit', '-qm', 'docs');
  }
  assert.equal(reusableDelta(tested, git('rev-parse', 'HEAD'), tested, tested), 'documentation');
  for (const path of ['app.ts', 'tests.ts', 'package-lock.json', 'ci.yml', 'schema.sql', 'unknown.md', 'docs/decisions/index.md', 'docs/decisions/2026-11-23-script.mjs', 'docs/decisions/nested/2026-11-23-deep.md']) {
    mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, 'changed'); git('add', '.'); git('commit', '-qm', 'behavior');
    assert.equal(reusableDelta(tested, git('rev-parse', 'HEAD'), tested, tested), false, path);
    git('revert', '--no-edit', 'HEAD');
  }
  git('mv', 'app.ts', 'docs/app.md'); git('commit', '-qm', 'rename');
  assert.equal(reusableDelta(tested, git('rev-parse', 'HEAD'), tested, tested), false);
  assert.equal(reusableDelta(git('rev-parse', 'HEAD'), tested, tested, tested), false);
  assert.equal(reusableDelta('0'.repeat(40), tested, tested, tested), false);
  assert.equal(reusableDelta('--help', tested, tested, tested), false);
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
  assert.match(execute('pull_request', true), /browser=true/);
  const readyOutput = execute('pull_request', false);
  assert.ok(readyOutput.includes(`required_browser=${needsBrowser(selectPlan(['app.ts']), 'pull_request', false)}`));
  if (Date.now() < automaticBrowserResumesAt) assert.match(readyOutput, /browser_exemption=Automatic browser tests temporarily suspended/);
  assert.throws(() => execute('pull_request', 'false'), /Missing PR draft state/);
  git('update-ref', 'refs/remotes/origin/main', tested);
  assert.match(execute('workflow_dispatch', true), /browser=true/);
  assert.match(execute('workflow_dispatch', true), /mode=full/);
  // A merge queue entry carries no pull request: no draft state, no base or head
  // from the workflow. It still plans the full suite, with a token present.
  writeFileSync(eventFile, JSON.stringify({ action: 'checks_requested', merge_group: { head_sha: git('rev-parse', 'HEAD'), base_sha: tested } }));
  for (const step of ['--paths-only', '--github']) {
    writeFileSync(outputs, '');
    execFileSync(process.execPath, [selector, step], { encoding: 'utf8', env: {
      ...process.env, GH_TOKEN: 'unused', CI_BASE: '', CI_HEAD: '',
      GITHUB_EVENT_NAME: 'merge_group', GITHUB_EVENT_PATH: eventFile, GITHUB_OUTPUT: outputs, GITHUB_STEP_SUMMARY: '',
    }, stdio: ['ignore', 'pipe', 'pipe'] });
    assert.match(readFileSync(outputs, 'utf8'), /mode=full/);
  }
  for (const expected of [/browser=true/, /reuse=\n/, /shards=\[1,2,3,4\]/, new RegExp(`base=${tested}\n`)]) assert.match(readFileSync(outputs, 'utf8'), expected);
} finally { process.chdir(cwd); rmSync(dir, { recursive: true, force: true }); }

// Real Git trees for a migration rename: main gains a newer migration, the pull
// request renames its own file after it, bytes unchanged.
const renameDir = mkdtempSync(join(tmpdir(), 'ci-reuse-rename-'));
try {
  process.chdir(renameDir);
  git('init', '-q', '-b', 'main'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.com');
  const m = name => `supabase/migrations/${name}.sql`;
  const commit = (message, edit) => { mkdirSync('docs', { recursive: true }); edit(); git('add', '-A'); git('commit', '-qm', message); return git('rev-parse', 'HEAD'); };
  mkdirSync('supabase/migrations', { recursive: true });
  const base0 = commit('main', () => { writeFileSync('app.ts', 'code'); writeFileSync(m('20261101000000_live'), 'create table live ();'); });
  const base1 = commit('main moves', () => writeFileSync(m('20261125000000_other'), 'create table other ();'));
  git('checkout', '-q', '-b', 'pr', base0);
  const tested = commit('pr', () => { writeFileSync(m('20261120000000_mine'), 'create table mine ();'); writeFileSync(m('20261120000001_second'), 'create table second ();'); });
  // Each case starts from the tested head and is undone afterwards.
  const attempt = edit => { const after = commit('case', edit); git('reset', '-q', '--hard', tested); return after; };
  const mv = (from, to) => () => git('mv', m(from), m(to));
  const pure = attempt(mv('20261120000001_second', '20261126000000_second'));
  assert.equal(reusableDelta(tested, pure, base0, base1), 'migration rename', 'pure rename after main moved');
  assert.equal(reusableDelta(tested, pure, base0, base0), 'migration rename', 'pure rename on the same base');
  assert.equal(reusableDelta(tested, pure, base1, base0), false, 'the proven base must be an ancestor of the current one');
  assert.equal(reusableDelta(tested, attempt(() => { mv('20261120000000_mine', '20261126000000_mine')(); mv('20261120000001_second', '20261126000001_second')(); }), base0, base1), 'migration rename', 'several pure renames');
  assert.equal(reusableDelta(tested, attempt(() => { mv('20261120000001_second', '20261126000000_second')(); writeFileSync('docs/workflow.md', 'note'); }), base0, base1), 'migration rename', 'with allowlisted Markdown');
  const refused = {
    'changed content': () => { mv('20261120000001_second', '20261126000000_second')(); writeFileSync(m('20261126000000_second'), 'create table mine (id int);'); },
    'one byte added': () => { mv('20261120000001_second', '20261126000000_second')(); writeFileSync(m('20261126000000_second'), 'create table mine ();\n'); },
    'migration already on main': mv('20261101000000_live', '20261126000000_live'),
    'older timestamp': mv('20261120000000_mine', '20261119000000_mine'),
    'different name': mv('20261120000000_mine', '20261126000000_yours'),
    'mode changed': () => { mv('20261120000001_second', '20261126000000_second')(); chmodSync(m('20261126000000_second'), 0o755); },
    'a file referencing the name': () => { mv('20261120000001_second', '20261126000000_second')(); writeFileSync('app.ts', '20261126000000_second'); },
    'a test referencing the name': () => { mv('20261120000001_second', '20261126000000_second')(); mkdirSync('scripts', { recursive: true }); writeFileSync('scripts/test-mine.mjs', '20261126000000_second'); },
    'agent instructions referencing the name': () => { mv('20261120000001_second', '20261126000000_second')(); writeFileSync('AGENTS.md', '20261126000000_second'); },
    'deleted only': () => git('rm', '-q', m('20261120000000_mine')),
    'added only': () => writeFileSync(m('20261126000000_extra'), 'create table extra ();'),
    'renamed out of the folder': () => { mkdirSync('supabase/migrations/old', { recursive: true }); git('mv', m('20261120000000_mine'), 'supabase/migrations/old/20261126000000_mine.sql'); },
    'renamed onto the name main took': mv('20261120000000_mine', '20261125000000_other'),
    'reordered among the pull request migrations': mv('20261120000000_mine', '20261126000000_mine'),
  };
  for (const [name, edit] of Object.entries(refused)) assert.equal(reusableDelta(tested, attempt(edit), base0, base1), false, name);
  // An unchanged file that names the old migration would break once it is renamed.
  git('checkout', '-q', '-b', 'pr-with-consumer', tested);
  const consumer = commit('a test names the file', () => { mkdirSync('scripts', { recursive: true }); writeFileSync('scripts/test-second.mjs', "const target = '20261120000001_second.sql';"); });
  const renamedUnderConsumer = commit('rename', mv('20261120000001_second', '20261126000000_second'));
  assert.equal(reusableDelta(consumer, renamedUnderConsumer, base0, base1), false, 'an unchanged test naming the old file');
  git('checkout', '-q', 'pr');
  // The name main took is refused for the rename above; with no base movement a
  // documentation-only change keeps its rule, and a moved base refuses it.
  const docs = attempt(() => writeFileSync('docs/workflow.md', 'note'));
  assert.equal(reusableDelta(tested, docs, base0, base0), 'documentation');
  assert.equal(reusableDelta(tested, docs, base0, base1), false, 'documentation after main moved');
  assert.equal(reusableDelta(tested, pure, base0, '0'.repeat(40)), false, 'unknown base');
} finally { process.chdir(cwd); rmSync(renameDir, { recursive: true, force: true }); }
console.log('CI reuse: provenance, scope, stages, failure fallback and real Git tree checks passed.');
