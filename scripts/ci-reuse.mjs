import { execFileSync } from 'node:child_process';

// Deliberately narrower than the documentation scope exemption. Everything else,
// including agent instructions, tests, SQL, lockfiles and CI itself stays exact.
export const reusableMarkdown = new Set([
  'README.md', 'docs/decisions.md', 'docs/workflow.md', 'docs/roadmap.md',
  'docs/reports/input-validation-audit.md',
]);
export const proofPrefix = 'CI evidence v1';
const sha = value => /^[a-f0-9]{40}$/.test(value ?? '');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

export function documentationDelta(before, after) {
  if (!sha(before) || !sha(after)) return false;
  try {
    git('merge-base', '--is-ancestor', before, after);
    return git('diff', '--name-only', '--no-renames', '-z', before, after, '--')
      .split('\0').filter(Boolean).every(path => reusableMarkdown.has(path));
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
export async function findReusable({ runs, jobs, current, delta = documentationDelta }) {
  if (current.event === 'workflow_dispatch') return null;
  for (const run of runs) {
    if (String(run.id) === current.runId || run.path !== '.github/workflows/ci.yml'
      || !['pull_request', 'workflow_dispatch'].includes(run.event)
      || run.head_repository?.full_name !== current.repository
      || run.head_branch !== current.branch) continue;
    if (delta(run.head_sha, current.head) && (run.status !== 'completed' || run.conclusion !== 'success')) return null;
    const evidence = (await jobs(run.id)).find(job => parseProof(job.name));
    const proof = parseProof(evidence?.name);
    if (!proof || run.head_sha !== proof.head || proof.base !== current.base || !delta(proof.head, current.head)) continue;
    // Never go back past a newer failure, incomplete run or insufficient coverage
    // for the same code/base. A rerun must establish a new successful proof.
    if (run.status !== 'completed' || run.conclusion !== 'success'
      || evidence.conclusion !== 'success' || !covers(proof, current.plan, current.browser)) return null;
    return { id: run.id, url: `https://github.com/${current.repository}/actions/runs/${run.id}`, ...proof };
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
