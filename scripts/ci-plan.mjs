import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { githubReuse } from './ci-reuse.mjs';
import { pathToFileURL } from 'node:url';

export const smoke = 'tests/onboarding/arrival-to-chat.spec.ts';
// Overflowing or clipped text on the main screens, in French and English (#420).
// Runs with every browser selection and for copy-only changes: a longer string
// is the usual cause, and it changes no behavior a journey would notice.
export const overflowSweep = 'tests/layout';
// Founder-authorized sprint exception; automatic coverage resumes without a PR.
export const automaticBrowserResumesAt = Date.parse('2026-10-12T00:00:00Z');
const profile = ['tests/onboarding', 'tests/profile', 'tests/moderation'];
const chat = ['tests/match-chat', 'tests/profile/chat-preview.spec.ts'];
const photo = [...profile, ...chat, 'tests/validation/photo-api.spec.ts', 'tests/validation/photo-staging.spec.ts', 'tests/validation/photo-source.spec.ts'];
// Founder console: nights, venues, reservations and arrivals. The moderation
// specs sign in through the same shell, so they guard it too.
const operations = ['tests/admin', 'tests/moderation', 'tests/security', 'tests/room/auth-identity.spec.ts', 'tests/reservations', 'tests/api',
  // Participant specs that end their journey in the console.
  'tests/profile/name-corrections-ui.spec.ts', 'tests/profile/text-corrections-ui.spec.ts', 'tests/profile/unified-profile-review-ui.spec.ts'];
const legal = ['tests/onboarding/legal-pages.spec.ts', 'tests/onboarding/privacy-policy.spec.ts'];
const dictionaries = {
  'lib/strings.ts': 't',
  'lib/photo-strings.ts': 'photoStrings',
  'lib/email-preference-strings.ts': 'emailPreferenceStrings',
};

// Unknown paths deliberately expand coverage. Keep this list narrower than the
// dependency graph: shared auth, presence, SQL, styles and tooling run everything.
function suitesFor(path) {
  // Dictionary keys are type-checked by the build; behavior lives in each consumer.
  if (path === 'lib/strings.ts') return [];
  if (path === 'lib/photo-strings.ts') return photo;
  if (path === 'lib/email-preference-strings.ts') return ['tests/validation/api.spec.ts'];
  if (path.startsWith('app/profile/') || path === 'lib/profile.ts') return profile;
  if (path.startsWith('app/chat/') || ['lib/chat-delivery.ts', 'lib/chat-read-state.ts', 'lib/match-order.ts'].includes(path)) return chat;
  if (path.startsWith('app/api/profile-photo/') || path.startsWith('components/Photo') || path === 'components/ProfilePhoto.tsx' || ['lib/photo-client.ts', 'lib/photo-moderation.ts', 'lib/usePhotoState.ts', 'lib/server/photo-validation.ts'].includes(path)) return photo;
  if (path.startsWith('app/v/') || path === 'lib/empty-room.ts') return [...profile, ...chat, 'tests/room'];
  // Profile and photo review screens share their components with the participant side.
  if (/^app\/admin\/(?:AdminProfileReview|ModerationQueue|NameCorrectionQueue|PhotoQueue|ProfileReview|TextReview)\./.test(path)) return [...photo, 'tests/admin/profile-review-layout.spec.ts'];
  if (path.startsWith('app/admin/') || path.startsWith('app/api/admin/') || /^lib\/(?:admin-(?:dashboard|night-creation|venues)|night-report)\.ts$/.test(path)) return operations;
  if (path.startsWith('app/reservation-terms/') || path === 'lib/booking-privacy.ts') return [...operations, ...legal];
  if (path.startsWith('app/api/launch/') || path.startsWith('app/events/') || path.startsWith('app/reservations/') || path.startsWith('app/survey/') || path.startsWith('app/preview/')
    || path.startsWith('components/booking/') || path === 'components/ReservationQr.tsx'
    || /^lib\/(?:server\/launch-|launch-|booking|cancellation-strings\.|survey-strings\.|reservation-configuration\.)[^/]*$/.test(path)) return operations;
  if (path.startsWith('app/legal/') || path.startsWith('app/privacy/') || path.startsWith('app/terms/') || path === 'components/LegalDocument.tsx') return legal;
  if (path === 'app/page.tsx' || path === 'app/WaitlistForm.tsx' || path.startsWith('app/email-preferences/') || path.startsWith('app/unsubscribe/') || path.startsWith('app/api/email/') || path.startsWith('app/api/unsubscribe/') || ['lib/waitlist.ts', 'lib/email-subscriptions.ts', 'lib/resend-webhook.ts', 'lib/email-transport-policy.ts', 'lib/server/email-delivery.ts', 'lib/server/email-links.ts'].includes(path)) return ['tests/validation/api.spec.ts'];
  // A changed spec runs itself, in any current or future suite folder. Shared
  // helpers and fixtures are not specs and still run everything.
  if (isSpec(path)) return [path];
  // Logic tests are imported only by each other; no browser spec executes them.
  // Their shared database helpers still run everything.
  if (/^scripts\/test-[^/]+\.(?:mjs|mts|ts)$/.test(path)) return [];
  return null;
}

function isSpec(path) {
  return /^tests\/[^/]+\/[^/]+\.spec\.ts$/.test(path);
}

// A spec added or changed by a pull request also runs 10 times in a row, without
// Playwright's CI retry, before it can reach the merge queue: one failure fails
// the required browser check. Only on pull_request events; the queue never waits
// for it. At most 6 specs are repeated (sorted), so the repetitions stay under
// about 60 file runs; the others are named as not repeated.
export const repeatEach = 10;
export const maxRepeatedSpecs = 6;
export function repeatedSpecs(paths, exists = existsSync) {
  const specs = [...new Set(paths.filter(isSpec))].filter(path => exists(path)).sort();
  return { specs: specs.slice(0, maxRepeatedSpecs), skipped: specs.slice(maxRepeatedSpecs) };
}

// Files under app/ that run the full suite on purpose: the shell every page
// shares. Every other file under app/ must be mapped in suitesFor.
export const fullSuiteAreas = ['app/BrandLogo.tsx', 'app/LanguageSelector.tsx', 'app/apple-icon.png', 'app/favicon.ico', 'app/globals.css', 'app/icon.svg', 'app/layout.tsx'];

// `files` is every file under app/. Returns the ones a new area forgot to declare.
export function undeclaredAreas(files) {
  return files.filter(file => !fullSuiteAreas.includes(file) && suitesFor(file) === null);
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
  if (!behavior.length) return { mode: 'copy', checks: true, suites: [overflowSweep] };
  const suites = new Set([smoke, overflowSweep]);
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

export function browserExemption(plan, event, draft, now = Date.now()) {
  if (event === 'pull_request' && ['targeted', 'full'].includes(plan.mode)
    && now < automaticBrowserResumesAt) {
    return 'Automatic browser tests temporarily suspended until 2026-10-12 00:00 UTC; manual workflow dispatch remains available. No browser coverage is claimed.';
  }
  return '';
}

// A merge queue entry is a new commit on the latest main: always the full suite,
// never a reused proof.
export const fullEvents = ['workflow_dispatch', 'schedule', 'merge_group'];
export function needsBrowser(plan, event, draft, now = Date.now()) {
  if (fullEvents.includes(event)) return true;
  if (browserExemption(plan, event, draft, now)) return false;
  // Draft and ready PRs get the same coverage: browser jobs no longer share a database.
  return ['copy', 'targeted', 'full'].includes(plan.mode);
}

// Each shard runs on its own runner with its own disposable Supabase stack, so a
// selection splits freely. A targeted selection gets one runner per 12 spec files:
// a large one on a single runner would finish after the sharded full suite. Each
// repetition of a changed spec counts as one more file; Playwright spreads the
// repetitions across the same shards.
export const fullSuiteShards = 4;
export const specsPerShard = 12;
const specFiles = suite => suite.endsWith('.spec.ts') ? 1
  : readdirSync(suite, { recursive: true }).filter(name => name.endsWith('.spec.ts')).length;
export function browserShards(plan, count = specFiles, repeated = 0) {
  const total = plan.suites.reduce((sum, suite) => sum + count(suite), 0) + repeated * repeatEach;
  const length = plan.mode === 'full' ? fullSuiteShards : Math.min(fullSuiteShards, Math.max(1, Math.ceil(total / specsPerShard)));
  return Array.from({ length }, (_, index) => index + 1);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length && !['--paths-only', '--run', '--github'].includes(args[0]))) throw new Error('Usage: node scripts/ci-plan.mjs [--paths-only|--run|--github]');
  const event = process.env.GITHUB_EVENT_NAME;
  if (event && event !== 'pull_request' && !fullEvents.includes(event)) throw new Error('Unsupported CI event');
  const full = fullEvents.includes(event);
  let { CI_BASE: base, CI_HEAD: head } = process.env;
  const payload = process.env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')) : {};
  if (args[0] === '--github') {
    if (full) {
      base = git('merge-base', 'origin/main', 'HEAD').trim();
      head = git('rev-parse', 'HEAD').trim();
    } else if (typeof payload.pull_request?.draft !== 'boolean') {
      throw new Error('Missing PR draft state');
    }
  }
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
  const repeat = event === 'pull_request' && ['targeted', 'full'].includes(plan.mode)
    ? repeatedSpecs(paths) : { specs: [], skipped: [] };
  if (args[0] === '--github') {
    const now = Date.now();
    const exemption = browserExemption(plan, event, payload.pull_request?.draft, now);
    const browser = needsBrowser(plan, event, payload.pull_request?.draft, now);
    const reuse = await githubReuse({ event, base, head, plan, browser, repeat: repeat.specs.length > 0,
      repository: process.env.GITHUB_REPOSITORY, branch: payload.pull_request?.head.ref,
      runId: process.env.GITHUB_RUN_ID });
    const values = { mode: plan.mode, checks: plan.checks && !reuse,
      browser: browser && !reuse, required_browser: browser, base, head,
      browser_exemption: exemption,
      reuse: reuse?.url ?? '', suites: JSON.stringify(plan.suites),
      shards: JSON.stringify(browserShards(plan, specFiles, repeat.specs.length)),
      // The non-blocking WebKit job does not repeat specs: no extra runner for it.
      webkit_shards: JSON.stringify(browserShards(plan)) };
    if (process.env.GITHUB_OUTPUT) for (const [key, value] of Object.entries(values)) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
    const explanation = reuse
      ? `Reused validation: ${reuse.url} (head ${reuse.head}, base ${reuse.base}, scope ${reuse.mode}). Tests were NOT executed again.`
      : `Scope: ${plan.mode}. Browser execution: ${browser}. Fresh validation; no reusable proof.`;
    console.log(explanation);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, explanation + '\n');
    const repetition = repeatSummary(repeat);
    if (repetition) {
      console.log(repetition);
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, repetition + '\n');
    }
    if (exemption) {
      console.log(exemption);
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, exemption + '\n');
    }
    return;
  }
  console.log(JSON.stringify(plan));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `mode=${plan.mode}\nchecks=${plan.checks}\ndictionaries=${paths.some(path => Object.hasOwn(dictionaries, path))}\n`);
  if (args[0] !== '--paths-only' && process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### CI scope: ${plan.mode}\n\n${plan.mode === 'targeted' ? plan.suites.map(suite => `- \`${suite}\``).join('\n') : { full: 'Full browser suite.', docs: 'Documentation only: no build or browser tests.', copy: `Verified dictionary copy only: lint, logic, build and the text overflow sweep (\`${overflowSweep}\`); no other browser test.` }[plan.mode]}\n`);
  if (args[0] === '--run' && ['copy', 'targeted', 'full'].includes(plan.mode)) {
    // Literal arguments, never a shell command composed from changed filenames.
    const shard = process.env.CI_SHARD;
    if (shard && !/^[1-9]\/[1-9]$/.test(shard)) throw new Error('CI_SHARD must look like 2/4');
    execFileSync('npm', ['run', 'test:e2e', '--', ...plan.suites, ...(shard ? [`--shard=${shard}`] : [])], { stdio: 'inherit' });
    if (repeat.specs.length && process.env.E2E_ENGINE !== 'webkit') {
      console.log(repeatSummary(repeat));
      // Reuses the build above; --retries=0 so a pass on retry cannot hide a failure.
      execFileSync('npx', ['playwright', 'test', ...repeat.specs, `--repeat-each=${repeatEach}`, '--retries=0', ...(shard ? [`--shard=${shard}`] : [])], { stdio: 'inherit' });
    }
  }
}

export function repeatSummary({ specs, skipped }) {
  if (!specs.length) return '';
  const lines = [`Changed browser specs repeated ${repeatEach} times without retry: ${specs.map(spec => `\`${spec}\``).join(', ')}.`];
  if (skipped.length) lines.push(`Over the cap of ${maxRepeatedSpecs}, NOT repeated (they still ran once): ${skipped.map(spec => `\`${spec}\``).join(', ')}.`);
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
