import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const temporary = mkdtempSync(join(tmpdir(), 'amourette-pick-test-'));
const root = join(temporary, 'repo');
const remote = join(temporary, 'remote.git');
const bin = join(temporary, 'bin');
const helper = join(root, 'scripts/prepare-worktree.mjs');
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
try {
  mkdirSync(root); mkdirSync(bin); mkdirSync(join(root, 'scripts'));
  copyFileSync(resolve('scripts/prepare-worktree.mjs'), helper);
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'pick-test@example.com'); git('config', 'user.name', 'Pick test');
  writeFileSync(join(root, '.gitignore'), '.env.local\nnode_modules/\n');
  writeFileSync(join(root, '.env.local'), 'SYNTHETIC_TEST_VALUE=private\n');
  writeFileSync(join(root, 'package.json'), '{"name":"fixture","version":"1.0.0"}');
  git('add', '.'); git('commit', '-qm', 'fixture');
  execFileSync('git', ['init', '--bare', '-q', remote]);
  git('remote', 'add', 'origin', remote); git('push', '-u', 'origin', 'main');
  // No package registry or lifecycle execution is needed for this logic test.
  // Capture npm's real argument boundary and simulate a completed installation.
  const npm = join(bin, 'npm');
  writeFileSync(npm, `#!${process.execPath}\nconst fs=require('node:fs');fs.mkdirSync('node_modules',{recursive:true});fs.writeFileSync('node_modules/.package-lock.json',JSON.stringify(process.argv.slice(2)));`);
  chmodSync(npm, 0o755);
  const run = (...args) => execFileSync(process.execPath, [helper, ...args], { cwd: tmpdir(), encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, stdio: ['ignore', 'pipe', 'pipe'] });
  const initial = git('worktree', 'list', '--porcelain');
  for (const args of [[], ['main'], ['feature/../outside'], ['--help'], ['feature/a;echo-secret'], ['feature/a', 'extra'], [`feature/${'a'.repeat(101)}`]]) assert.throws(() => run(...args));
  assert.equal(git('worktree', 'list', '--porcelain'), initial, 'invalid input has no Git effects');
  assert.match(run('feature/example'), /Prepared feature\/example/);
  const worktree = `${root}--example`;
  assert.equal(readFileSync(join(worktree, '.env.local'), 'utf8'), 'SYNTHETIC_TEST_VALUE=private\n');
  assert.deepEqual(JSON.parse(readFileSync(join(worktree, 'node_modules/.package-lock.json'), 'utf8')), ['ci', '--no-audit', '--no-fund']);
  assert.equal(git('config', '--get-regexp', '^branch\\.main\\.' ).includes('origin'), true);
  assert.throws(() => git('config', '--get', 'branch.feature/example.remote'), 'new branch has no origin/main upstream');
  writeFileSync(join(worktree, '.env.local'), 'KEEP_EXISTING_ENV=yes\n');
  writeFileSync(join(worktree, 'draft.txt'), 'unfinished work');
  const resumed = run('feature/example');
  assert.match(resumed, /Reusing/); assert.doesNotMatch(resumed, /KEEP_EXISTING_ENV|private/);
  assert.equal(readFileSync(join(worktree, '.env.local'), 'utf8'), 'KEEP_EXISTING_ENV=yes\n');
  assert.equal(readFileSync(join(worktree, 'draft.txt'), 'utf8'), 'unfinished work');
  mkdirSync(`${root}--occupied`);
  assert.throws(() => run('fix/occupied'));
  assert.equal(git('branch', '--list', 'fix/occupied'), '');
  symlinkSync(worktree, `${root}--linked`, 'dir');
  assert.throws(() => run('feature/linked'));
  assert.equal(git('branch', '--list', 'feature/linked'), '');
  git('branch', 'feature/unattached');
  assert.throws(() => run('feature/unattached'));
  assert.equal(existsSync(`${root}--unattached`), false);
  // Verify COPYFILE_EXCL does not follow or overwrite an existing env symlink.
  rmSync(join(worktree, '.env.local'));
  const unrelated = join(temporary, 'unrelated'); writeFileSync(unrelated, 'untouched');
  symlinkSync(unrelated, join(worktree, '.env.local'));
  run('feature/example');
  assert.equal(readFileSync(unrelated, 'utf8'), 'untouched');
} finally {
  // Only disposable fixtures created by this test; never project worktrees.
  rmSync(temporary, { recursive: true, force: true });
}
console.log('Pick preparation: create/resume, env privacy, npm invocation, no upstream and collision/input refusals passed.');
