import { execFileSync } from 'node:child_process';

// Deliberately narrower than the documentation scope exemption. Everything else,
// including agent instructions, tests, SQL, lockfiles and CI itself stays exact.
const reusableMarkdown = new Set([
  'README.md', 'docs/decisions.md', 'docs/workflow.md', 'docs/roadmap.md',
  'docs/reports/input-validation-audit.md',
]);
// One file per decision (docs/decisions/YYYY-MM-DD-short-slug.md), nothing else in that folder.
const decisionFile = /^docs\/decisions\/\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
export const isReusableMarkdown = path => reusableMarkdown.has(path) || decisionFile.test(path);
export const proofPrefix = 'CI evidence v1';
const sha = value => /^[a-f0-9]{40}$/.test(value ?? '');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

// A migration this pull request adds, renamed to a later timestamp because
// another one landed on main first: same suffix, same bytes, same mode.
const migrationName = /^supabase\/migrations\/(\d{14})_([^/]+\.sql)$/;
const absentFrom = (base, path) => git('ls-tree', '--name-only', base, '--', path) === '';
// Whether a tracked file outside the migrations names a text: an unchanged test
// or script that names the old file breaks once it is renamed. git grep exits 1
// on no match; any other failure is an error and refuses reuse.
const mentioned = (tree, text) => {
  try { return git('grep', '-l', '-F', '-e', text, tree, '--', ':(exclude)supabase/migrations/') !== ''; }
  catch (error) { if (error.status === 1) return false; throw error; }
};
// The pull request's own migrations in apply order, named without their timestamp.
const ownOrder = (head, base) => {
  const names = tree => git('ls-tree', '--name-only', '-z', tree, '--', 'supabase/migrations/').split('\0').filter(Boolean);
  const onBase = new Set(names(base));
  return names(head).filter(path => !onBase.has(path)).sort().map(path => path.replace(/^supabase\/migrations\/\d+_/, '')).join('\0');
};

// What changed between the tested head and the new head, if it may reuse the
// proof: 'documentation' (allowlisted Markdown only, same base required) or
// 'migration rename' (pure renames of migrations the pull request adds, plus
// allowlisted Markdown). Main may have moved forward for a rename, never been
// rewritten: the proven base is an ancestor of the current one. Anything else,
// and any Git error, is false.
export function reusableDelta(before, after, provenBase, currentBase) {
  if (![before, after, provenBase, currentBase].every(sha)) return false;
  try {
    git('merge-base', '--is-ancestor', before, after);
    const fields = git('diff', '--raw', '--no-abbrev', '--no-renames', '-z', before, after, '--').split('\0');
    const deleted = new Map(), added = new Map();
    for (let index = 0; index + 1 < fields.length; index += 2) {
      const [oldMode, newMode, oldBlob, newBlob, status] = fields[index].slice(1).split(' ');
      const path = fields[index + 1];
      if (isReusableMarkdown(path)) continue;
      const name = migrationName.exec(path);
      if (!name || !['A', 'D'].includes(status)) return false;
      const side = status === 'D' ? deleted : added;
      if (side.has(name[2])) return false;
      side.set(name[2], { path, timestamp: name[1], mode: status === 'D' ? oldMode : newMode, blob: status === 'D' ? oldBlob : newBlob });
    }
    if (!deleted.size) return provenBase === currentBase && !added.size && 'documentation';
    if (deleted.size !== added.size) return false;
    for (const [suffix, from] of deleted) {
      const to = added.get(suffix);
      if (!to || to.blob !== from.blob || to.mode !== from.mode || to.timestamp <= from.timestamp) return false;
      // Both names belong to this pull request: neither is on main, then or now.
      for (const base of [provenBase, currentBase]) if (!absentFrom(base, from.path) || !absentFrom(base, to.path)) return false;
      if (mentioned(after, from.timestamp)) return false;
    }
    // A rename must not reorder the pull request's own migrations among themselves.
    if (ownOrder(before, provenBase) !== ownOrder(after, currentBase)) return false;
    if (provenBase !== currentBase) git('merge-base', '--is-ancestor', provenBase, currentBase);
    return 'migration rename';
  } catch { return false; }
}

export function parseProof(name) {
  const match = /^CI evidence v1 ([a-f0-9]{40}) ([a-f0-9]{40}) (docs|copy|targeted|full) (true|false)$/.exec(name ?? '');
  return match && { base: match[1], head: match[2], mode: match[3], browser: match[4] === 'true' };
}

export function covers(proof, plan, browser) {
  if (!proof || (browser && !proof.browser)) return false;
  // Same base + same executable tree means the targeted selection is identical.
  // A manual full run can also cover a targeted PR or a draft-to-ready transition.
  return proof.mode === 'full' || proof.mode === plan.mode;
}

// API and Git are injected in tests. No artifact supplied by a PR is trusted.
// Only a successful evidence job from this unchanged workflow proves coverage.
export async function findReusable({ runs, jobs, current, delta = reusableDelta }) {
  if (current.event === 'workflow_dispatch') return null;
  for (const run of runs) {
    if (String(run.id) === current.runId || run.path !== '.github/workflows/ci.yml'
      || !['pull_request', 'workflow_dispatch'].includes(run.event)
      || run.head_repository?.full_name !== current.repository
      || run.head_branch !== current.branch) continue;
    if (delta(run.head_sha, current.head, current.base, current.base) && (run.status !== 'completed' || run.conclusion !== 'success')) return null;
    const evidence = (await jobs(run.id)).find(job => parseProof(job.name));
    const proof = parseProof(evidence?.name);
    const change = proof && run.head_sha === proof.head && delta(proof.head, current.head, proof.base, current.base);
    // Only a pure migration rename may follow main forward (reusableDelta).
    if (!change || (proof.base !== current.base && change !== 'migration rename')) continue;
    // Never go back past a newer failure, incomplete run or insufficient coverage
    // for the same code/base. A rerun must establish a new successful proof.
    if (run.status !== 'completed' || run.conclusion !== 'success'
      || evidence.conclusion !== 'success' || !covers(proof, current.plan, current.browser)) return null;
    // Only a pull_request run repeats the specs the pull request changes
    // (scripts/ci-plan.mjs): a manual run never proves that repetition.
    if (current.repeat && run.event !== 'pull_request') return null;
    return { id: run.id, url: `https://github.com/${current.repository}/actions/runs/${run.id}`, change, ...proof };
  }
  return null;
}

export async function githubReuse(current) {
  if (!process.env.GH_TOKEN || current.event !== 'pull_request') return null;
  const api = path => JSON.parse(execFileSync('gh', ['api', path], {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'],
  }));
  try {
    const { workflow_runs: runs } = api(`repos/${current.repository}/actions/workflows/ci.yml/runs?per_page=50`);
    return await findReusable({ runs, current, jobs: async id => api(`repos/${current.repository}/actions/runs/${id}/jobs?per_page=100`).jobs });
  } catch {
    console.log('Reuse evidence unavailable; running the normal scope.');
    return null;
  }
}
