import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const smoke = 'tests/onboarding/arrival-to-chat.spec.ts';
const profile = ['tests/onboarding', 'tests/profile', 'tests/moderation'];
const chat = ['tests/match-chat', 'tests/profile/chat-preview.spec.ts'];
const photo = [...profile, ...chat, 'tests/validation/photo-api.spec.ts'];
const dictionaries = {
  'lib/strings.ts': 't',
  'lib/photo-strings.ts': 'photoStrings',
  'lib/email-preference-strings.ts': 'emailPreferenceStrings',
};

// Unknown paths deliberately expand coverage. Keep this list narrower than the
// dependency graph: shared auth, presence, SQL, styles and tooling run everything.
function suitesFor(path) {
  if (path.startsWith('app/profile/') || path === 'lib/profile.ts') return profile;
  if (path.startsWith('app/chat/') || ['lib/chat-delivery.ts', 'lib/chat-read-state.ts', 'lib/match-order.ts'].includes(path)) return chat;
  if (path.startsWith('app/api/profile-photo/') || path.startsWith('components/Photo') || path === 'components/ProfilePhoto.tsx' || ['lib/photo-client.ts', 'lib/photo-moderation.ts', 'lib/usePhotoState.ts', 'lib/server/photo-validation.ts'].includes(path)) return photo;
  if (path.startsWith('app/v/')) return [...profile, ...chat, 'tests/room'];
  if (path.startsWith('app/admin/')) return photo;
  if (path === 'app/page.tsx' || path === 'app/WaitlistForm.tsx' || path.startsWith('app/email-preferences/') || path.startsWith('app/unsubscribe/') || path.startsWith('app/api/email/') || path.startsWith('app/api/unsubscribe/') || ['lib/waitlist.ts', 'lib/email-subscriptions.ts', 'lib/resend-webhook.ts', 'lib/email-transport-policy.ts', 'lib/server/email-delivery.ts', 'lib/server/email-links.ts'].includes(path)) return ['tests/validation/api.spec.ts'];
  if (/^tests\/(onboarding|profile|match-chat|moderation|validation|room)\/[^/]+\.spec\.ts$/.test(path)) return [path];
  return null;
}

export function isDocumentation(path) {
  return /^(?:docs\/.*|README\.md|AGENTS\.md|CLAUDE\.md|\.github\/pull_request_template\.md|\.(?:codex|claude)\/skills\/[^/]+\/SKILL\.md)$/.test(path)
    && path.endsWith('.md');
}

export function selectPlan(paths, copyOnly = new Set(), forceFull = false) {
  if (forceFull || paths.length === 0) return { mode: 'full', checks: true, suites: [] };
  const application = paths.filter(path => !isDocumentation(path));
  if (!application.length) return { mode: 'docs', checks: false, suites: [] };
  const behavior = application.filter(path => !copyOnly.has(path));
  if (!behavior.length) return { mode: 'copy', checks: true, suites: [] };
  const suites = new Set([smoke]);
  for (const path of behavior) {
    const affected = suitesFor(path);
    if (!affected) return { mode: 'full', checks: true, suites: [] };
    for (const suite of affected) suites.add(suite);
  }
  // A directory already includes its individual files (including the smoke).
  const selected = [...suites].filter(path => ![...suites].some(other => other !== path && path.startsWith(`${other}/`))).sort();
  return { mode: 'targeted', checks: true, suites: selected };
}

// Only plain property values inside the named dictionary may change. Keys,
// functions, interpolation expressions, locale detection and imports stay exact.
// Unsupported copy edits safely run the full suite instead of guessing intent.
export function isCopyOnly(ts, before, after, dictionary) {
  function signature(source) {
    const file = ts.createSourceFile('dictionary.ts', source, ts.ScriptTarget.Latest, true);
    if (file.parseDiagnostics.length) return null;
    const ranges = [];
    function visit(node, inside = false) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === dictionary && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
        visit(node.initializer, true);
        return;
      }
      if (inside && ts.isPropertyAssignment(node)) {
        if (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer)) {
          ranges.push([node.initializer.getStart(file), node.initializer.end]);
        } else if (ts.isObjectLiteralExpression(node.initializer)) {
          visit(node.initializer, true);
        }
        return;
      }
      ts.forEachChild(node, child => visit(child, inside));
    }
    visit(file);
    if (!ranges.length) return null;
    for (const [start, end] of ranges.reverse()) source = `${source.slice(0, start)}"COPY"${source.slice(end)}`;
    return source;
  }
  const original = signature(before);
  return original !== null && original === signature(after);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
export function changedPaths(base, head) {
  for (const sha of [base, head]) {
    if (!/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('CI_BASE and CI_HEAD must be full 40-character commit SHAs');
  }
  // Disable rename detection so both old and new paths contribute to selection.
  return git('diff', '--name-only', '--no-renames', '-z', `${base}...${head}`, '--').split('\0').filter(Boolean);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length && !['--paths-only', '--run'].includes(args[0]))) throw new Error('Usage: node scripts/ci-plan.mjs [--paths-only|--run]');
  const event = process.env.GITHUB_EVENT_NAME;
  if (event && !['pull_request', 'workflow_dispatch'].includes(event)) throw new Error('Unsupported CI event');
  const full = event === 'workflow_dispatch';
  const { CI_BASE: base, CI_HEAD: head } = process.env;
  const paths = full ? [] : changedPaths(base, head);
  const copyOnly = new Set();
  if (args[0] !== '--paths-only' && !full) {
    const candidates = paths.filter(path => Object.hasOwn(dictionaries, path));
    if (candidates.length) {
      const { default: ts } = await import('typescript');
      const ancestor = git('merge-base', base, head).trim();
      for (const path of candidates) {
        // Added/deleted dictionaries have no safe before/after comparison.
        try {
          if (isCopyOnly(ts, git('show', `${ancestor}:${path}`), git('show', `${head}:${path}`), dictionaries[path])) copyOnly.add(path);
        } catch { /* Missing dictionary revision keeps full coverage. */ }
      }
    }
  }
  const plan = selectPlan(paths, copyOnly, full);
  console.log(JSON.stringify(plan));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `mode=${plan.mode}\nchecks=${plan.checks}\n`);
  if (args[0] !== '--paths-only' && process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### CI scope: ${plan.mode}\n\n${plan.mode === 'targeted' ? plan.suites.map(suite => `- \`${suite}\``).join('\n') : { full: 'Full Chromium suite.', docs: 'Documentation only: no build or browser tests.', copy: 'Verified dictionary copy only: lint, logic and build; no browser tests.' }[plan.mode]}\n`);
  if (args[0] === '--run' && ['targeted', 'full'].includes(plan.mode)) {
    // Literal arguments, never a shell command composed from changed filenames.
    execFileSync('npm', ['run', 'test:e2e', '--', ...plan.suites], { stdio: 'inherit' });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
