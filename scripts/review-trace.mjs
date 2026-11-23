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

export function hostedTrace({ reviews = [], comments = [], reactions = [] }) {
  return reviews.some(by(hostedReviewer))
    || comments.some(comment => by(hostedReviewer)(comment) && !refusal.test(comment.body ?? ''))
    // The hosted reviewer approves a clean pull request with a thumbs-up, without a review.
    || reactions.some(reaction => by(hostedReviewer)(reaction) && reaction.content === '+1');
}

export function localTrace({ comments = [] }) {
  return comments.some(comment => (comment.body ?? '').trimStart().startsWith(localMarker));
}

// level: 'pass' | 'warn' (passes, shown to the founder) | 'fail'.
export function evaluate({ draft, body, reviews, comments, reactions }) {
  const line = reviewLine(body);
  const kind = kindOf(line);
  const said = line ? `The card says: "${line}".` : 'The description has no "**Review:**" line.';
  if (draft) return { level: 'pass', message: `Draft: the review trace is not enforced yet. ${said}` };
  const how = 'Run the review step of the ship skill, then write the Review line of the founder card as "Hosted reviewer: …", "Local fallback (<why>): …" or "None: <reason>".';
  if (kind === 'missing' || kind === 'unknown') return { level: 'fail', message: `Ready without a review verdict. ${said} ${how}` };
  if (kind === 'hosted') {
    return hostedTrace({ reviews, comments, reactions })
      ? { level: 'pass', message: `Reviewed by the hosted reviewer. ${said}` }
      : { level: 'fail', message: `The card names the hosted reviewer, but ${hostedReviewer} left no review on this pull request. ${how}` };
  }
  if (kind === 'local') {
    return localTrace({ comments })
      ? { level: 'pass', message: `Reviewed by a local fallback review. ${said}` }
      : { level: 'fail', message: `The card names a local fallback review, but no comment starting with ${localMarker} carries it. ${how}` };
  }
  const reason = line.replace(/^none\b[\s:.,()-]*/i, '');
  return reason.length >= 15
    ? { level: 'warn', message: `Ready with NO review. ${said}` }
    : { level: 'fail', message: `Ready with no review and no reason. ${said} ${how}` };
}

function api(path) {
  return JSON.parse(execFileSync('gh', ['api', `${path}?per_page=100`], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
}

function main() {
  const number = process.argv[2] ?? process.env.PR_NUMBER;
  const repository = process.env.GITHUB_REPOSITORY ?? 'getamourette/amourette-webapp';
  if (!/^\d+$/.test(number ?? '')) throw new Error('Usage: node scripts/review-trace.mjs <pull request number>');
  const pull = api(`repos/${repository}/pulls/${number}`);
  const result = evaluate({
    draft: pull.draft,
    body: pull.body,
    reviews: api(`repos/${repository}/pulls/${number}/reviews`),
    comments: api(`repos/${repository}/issues/${number}/comments`),
    reactions: api(`repos/${repository}/issues/${number}/reactions`),
  });
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${result.message}\n`);
  if (process.env.GITHUB_ACTIONS && result.level !== 'pass') console.log(`::${result.level === 'fail' ? 'error' : 'warning'}::${result.message}`);
  console.log(`${result.level.toUpperCase()}: ${result.message}`);
  if (result.level === 'fail') process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
