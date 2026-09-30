import { execFileSync } from 'node:child_process';
import { constants, copyFileSync, existsSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function main() {
  const [branch, ...extra] = process.argv.slice(2);
  if (extra.length || !/^(feature|fix)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(branch ?? '') || branch.length > 100) {
    throw new Error('Usage: node scripts/prepare-worktree.mjs feature/<slug> or fix/<slug> (100 characters maximum)');
  }
  // Resolve from the helper location, never from a caller-supplied path or cwd.
  const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const common = realpathSync(git('rev-parse', '--path-format=absolute', '--git-common-dir'));
  const root = dirname(common);
  if (common !== join(root, '.git')) throw new Error('Expected a standard main checkout with a .git directory');
  const destination = `${root}--${branch.split('/')[1]}`;
  const records = git('worktree', 'list', '--porcelain', '-z').split('\0\0').filter(Boolean).map(record => {
    const fields = record.split('\0');
    return {
      path: fields.find(field => field.startsWith('worktree '))?.slice(9),
      branch: fields.find(field => field.startsWith('branch '))?.slice(7),
    };
  });
  const existing = records.find(record => record.branch === `refs/heads/${branch}`);
  if (existing && existing.path !== destination) throw new Error(`Branch already has a different worktree: ${existing.path}; reuse it manually`);
  let occupied = false;
  try { lstatSync(destination); occupied = true; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (occupied) {
    if (!existing || lstatSync(destination).isSymbolicLink() || realpathSync(destination) !== destination) throw new Error('Destination is occupied or symlinked; nothing was changed');
  } else if (existing) {
    throw new Error('Registered worktree is missing; inspect it instead of recreating it');
  }
  const envSource = join(root, '.env.local');
  if (existsSync(envSource) && (!lstatSync(envSource).isFile() || lstatSync(envSource).isSymbolicLink())) throw new Error('Main .env.local must be a regular file');
  if (!existing) {
    // Existing unattached branches must be inspected, never silently reset/rebased.
    if (git('branch', '--list', branch)) throw new Error('Branch already exists without the expected worktree; inspect it first');
    git('fetch', 'origin', 'main');
    git('worktree', 'add', '--no-track', '-b', branch, destination, 'origin/main');
    console.log(`Created ${destination}`);
  } else {
    console.log(`Reusing ${destination}; branch and working changes preserved`);
  }
  const envTarget = join(destination, '.env.local');
  if (existsSync(envSource)) {
    try { copyFileSync(envSource, envTarget, constants.COPYFILE_EXCL); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  } else {
    console.warn('Main checkout has no .env.local; configure it from .env.example before running the app');
  }
  // Resume an interrupted installation, but do not reinstall a populated tree.
  const modules = join(destination, 'node_modules');
  if (!existsSync(join(modules, '.package-lock.json'))) {
    execFileSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: destination, stdio: 'inherit' });
  }
  console.log(`Prepared ${branch} at ${destination}`);
}
try { main(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
