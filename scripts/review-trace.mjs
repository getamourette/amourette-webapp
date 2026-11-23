// Fails a Ready pull request whose founder card does not say who reviewed it, or
// says so without the matching trace on the pull request. Drafts are reported, not
// enforced. Rule: AGENTS.md, "Automatic review". Procedure: the `ship` skill.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// The GitHub login of the hosted reviewer. It is the only way to recognize its trace.
export const hostedReviewer = 'chatgpt-codex-connector[bot]';
// First line of the comment an authoring agent posts after a local fallback review.
export const localMarker = '<!-- review-trace: local -->';
// Replies of the hosted reviewer that mean "no review happened".
const refusal = /usage limit|create a codex account|connect to github/i;

export function reviewLine(body) {
  const match = /^\*\*Review:\*\*(.*)$/m.exec((body ?? '').replace(/\r/g, ''));
  return match ? match[1].replace(/<!--.*?-->/g, '').trim() : null;
}

function kindOf(line) {
  if (line === null) return 'missing';
  if (/^hosted reviewer\b/i.test(line)) return 'hosted';
  if (/^local fallback\b/i.test(line)) return 'local';
  if (/^none\b/i.test(line)) return 'none';
  return 'unknown';
}

const by = login => item => item.user?.login === login;

// Each function returns the traces found, so their dates can be compared with the head commit.
export function hostedTrace({ reviews = [], comments = [], reactions = [] }) {
  return [
    ...reviews.filter(by(hostedReviewer)),
    ...comments.filter(comment => by(hostedReviewer)(comment) && !refusal.test(comment.body ?? '')),
    // The hosted reviewer approves a clean pull request with a thumbs-up, without a review.
    ...reactions.filter(reaction => by(hostedReviewer)(reaction) && reaction.content === '+1'),
  ];
}

// The repository is public: a marker posted by a stranger is not a review.
const trusted = ['OWNER', 'MEMBER', 'COLLABORATOR'];

export function localTrace({ comments = [] }) {
  return comments.filter(comment => trusted.includes(comment.author_association)
    && (comment.body ?? '').trimStart().startsWith(localMarker));
}

const placeholder = /^(?:pending|not run|none|n\/?a|tbd|todo|\?+)\b[\s.]*$/i;

// The check proves a review happened. It cannot fail a head newer than the review,
// because the commits settling the last round are not reviewed again; it says so.
function reviewed(traces, headDate, said) {
  const latest = Math.max(...traces.map(trace => Date.parse(trace.submitted_at ?? trace.created_at ?? '') || 0));
  return headDate && latest < Date.parse(headDate)
    ? { level: 'warn', message: `Reviewed, but the head commit is newer than the last review: what was pushed after it was not reviewed. ${said}` }
    : null;
}

// level: 'pass' | 'warn' (passes, shown to the founder) | 'fail'.
export function evaluate({ draft, body, reviews, comments, reactions, headDate }) {
  const line = reviewLine(body);
  const kind = kindOf(line);
  const said = line ? `The card says: "${line}".` : 'The description has no "**Review:**" line.';
  if (draft) return { level: 'pass', message: `Draft: the review trace is not enforced yet. ${said}` };
  const how = 'Run the review step of the ship skill, then write the Review line of the founder card as "Hosted reviewer: …", "Local fallback (<why>): …" or "None: <reason>".';
  if (kind === 'missing' || kind === 'unknown') return { level: 'fail', message: `Ready without a review verdict. ${said} ${how}` };
  // What follows the opening: the verdict, or the reason when there was no review.
  const rest = line.replace(/^(?:hosted reviewer|local fallback|none)\b(?:\s*\([^)]*\))?[\s:.,-]*/i, '');
  if (kind !== 'none' && (!rest || placeholder.test(rest))) return { level: 'fail', message: `The Review line names a reviewer but gives no verdict. ${said} ${how}` };
  if (kind === 'hosted') {
    const traces = hostedTrace({ reviews, comments, reactions });
    return traces.length
      ? reviewed(traces, headDate, said) ?? { level: 'pass', message: `Reviewed by the hosted reviewer. ${said}` }
      : { level: 'fail', message: `The card names the hosted reviewer, but ${hostedReviewer} left no review on this pull request. ${how}` };
  }
  if (kind === 'local') {
    const traces = localTrace({ comments });
    return traces.length
      ? reviewed(traces, headDate, said) ?? { level: 'pass', message: `Reviewed by a local fallback review. ${said}` }
      : { level: 'fail', message: `The card names a local fallback review, but no comment starting with ${localMarker} carries it. ${how}` };
  }
  return rest.replace(/[^\p{L}]/gu, '').length >= 3 && !placeholder.test(rest)
    ? { level: 'warn', message: `Ready with NO review. ${said}` }
    : { level: 'fail', message: `Ready with no review and no reason. ${said} ${how}` };
}

function api(path) {
  return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
}

// Every page: the trace of a long pull request can sit after the hundredth comment.
function list(path) {
  const lines = execFileSync('gh', ['api', '--paginate', '--jq', '.[]', `${path}?per_page=100`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return lines.split('\n').filter(Boolean).map(line => JSON.parse(line));
}

function main() {
  // --as-ready: judge a draft as if it were Ready, before promoting it.
  const asReady = process.argv.includes('--as-ready');
  const number = process.argv.slice(2).find(argument => argument !== '--as-ready') ?? process.env.PR_NUMBER;
  const repository = process.env.GITHUB_REPOSITORY ?? 'getamourette/amourette-webapp';
  if (!/^\d+$/.test(number ?? '')) throw new Error('Usage: node scripts/review-trace.mjs <pull request number> [--as-ready]');
  const pull = api(`repos/${repository}/pulls/${number}`);
  const result = evaluate({
    draft: pull.draft && !asReady,
    headDate: api(`repos/${repository}/commits/${pull.head.sha}`).commit.committer.date,
    body: pull.body,
    reviews: list(`repos/${repository}/pulls/${number}/reviews`),
    comments: list(`repos/${repository}/issues/${number}/comments`),
    reactions: list(`repos/${repository}/issues/${number}/reactions`),
  });
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${result.message}\n`);
  if (process.env.GITHUB_ACTIONS && result.level !== 'pass') console.log(`::${result.level === 'fail' ? 'error' : 'warning'}::${result.message}`);
  console.log(`${result.level.toUpperCase()}: ${result.message}`);
  if (result.level === 'fail') process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
