import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluate, hostedReviewer, localMarker, reviewLine } from './review-trace.mjs';

const card = review => `**What changes:** Something.\n\n**Proof:** CI green.\n\n${review}\n\n**Risk:** No migration.\n`;
const hosted = { user: { login: hostedReviewer } };
const founder = { user: { login: 'founder' }, author_association: 'MEMBER' };
const stranger = { user: { login: 'stranger' }, author_association: 'NONE' };
const level = input => evaluate({ draft: false, ...input }).level;

assert.equal(reviewLine(card('**Review:** Hosted reviewer: no blocking remark.')), 'Hosted reviewer: no blocking remark.');
assert.equal(reviewLine(card('**Review:** Hosted reviewer.\r')), 'Hosted reviewer.', 'GitHub stores CRLF line endings');
assert.equal(reviewLine('no card'), null);
assert.equal(reviewLine(null), null);

// The untouched template is not a verdict.
const template = readFileSync('.github/pull_request_template.md', 'utf8');
assert.equal(reviewLine(template), '');
assert.equal(level({ body: template }), 'fail');

// A draft is never blocked, whatever the card says.
assert.equal(evaluate({ draft: true, body: template }).level, 'pass');
assert.equal(evaluate({ draft: true, body: '' }).level, 'pass');

// Ready with nothing usable on the Review line.
for (const body of ['', 'no card', card('**Review:**'), card('**Review:** Not run (the automatic review does not exist yet).'), card('**Review:** Pending.'), card('Review: Hosted reviewer')]) {
  assert.equal(level({ body, reviews: [hosted] }), 'fail', body);
}

// Hosted reviewer: the card alone is not a trace.
const saysHosted = card('**Review:** Hosted reviewer: 2 remarks, 1 fixed, 1 dismissed.');
assert.equal(level({ body: saysHosted }), 'fail');
assert.equal(level({ body: saysHosted, reviews: [founder], comments: [founder] }), 'fail');
assert.equal(level({ body: saysHosted, reviews: [hosted] }), 'pass');
assert.equal(level({ body: saysHosted, comments: [{ ...hosted, body: 'No major issues found.' }] }), 'pass');
assert.equal(level({ body: saysHosted, reactions: [{ ...hosted, content: '+1' }] }), 'pass');
// An acknowledgement or a refusal is not a review.
assert.equal(level({ body: saysHosted, reactions: [{ ...hosted, content: 'eyes' }] }), 'fail');
assert.equal(level({ body: saysHosted, comments: [{ ...hosted, body: 'You have reached your Codex usage limits for code reviews.' }] }), 'fail');
assert.equal(level({ body: saysHosted, comments: [{ ...hosted, body: 'To use Codex here, create a Codex account and connect to github.' }] }), 'fail');

// Local fallback: needs the marked comment.
const saysLocal = card('**Review:** Local fallback (hosted reviewer out of quota): no blocking remark.');
assert.equal(level({ body: saysLocal, reviews: [hosted] }), 'fail');
assert.equal(level({ body: saysLocal, comments: [{ ...founder, body: 'Looks fine.' }] }), 'fail');
assert.equal(level({ body: saysLocal, comments: [{ ...founder, body: `quoting ${localMarker}` }] }), 'fail', 'the marker opens the comment');
assert.equal(level({ body: saysLocal, comments: [{ ...founder, body: `${localMarker}\n**Local review** ...` }] }), 'pass');
assert.equal(level({ body: saysLocal, comments: [{ ...stranger, body: `${localMarker}\n**Local review** ...` }] }), 'fail', 'public repository: a stranger cannot supply the trace');

// A reviewer without a verdict is not a verdict.
for (const line of ['Hosted reviewer', 'Hosted reviewer:', 'Local fallback (hosted reviewer out of quota):', 'Local fallback (no answer in 15 minutes).']) {
  assert.equal(level({ body: card(`**Review:** ${line}`), reviews: [hosted], comments: [{ ...founder, body: localMarker }] }), 'fail', line);
}

// A placeholder is not a verdict, even with a trace.
for (const line of ['Hosted reviewer: Pending', 'Hosted reviewer: not run.', 'Local fallback (out of quota): TBD']) {
  assert.equal(level({ body: card(`**Review:** ${line}`), reviews: [hosted], comments: [{ ...founder, body: localMarker }] }), 'fail', line);
}

// A head commit newer than the last review passes, visibly.
const at = date => ({ submitted_at: date, created_at: date });
assert.equal(level({ body: saysHosted, reviews: [{ ...hosted, ...at('2026-11-23T10:00:00Z') }], headDate: '2026-11-23T09:00:00Z' }), 'pass');
assert.equal(level({ body: saysHosted, reviews: [{ ...hosted, ...at('2026-11-23T10:00:00Z') }], headDate: '2026-11-23T11:00:00Z' }), 'warn');
assert.equal(level({ body: saysHosted, reviews: [{ ...hosted, ...at('2026-11-23T08:00:00Z') }, { ...hosted, ...at('2026-11-23T12:00:00Z') }], headDate: '2026-11-23T11:00:00Z' }), 'pass');
assert.equal(level({ body: saysLocal, comments: [{ ...founder, ...at('2026-11-23T10:00:00Z'), body: localMarker }], headDate: '2026-11-23T11:00:00Z' }), 'warn');
assert.equal(level({ body: saysLocal, comments: [{ ...founder, ...at('2026-11-23T12:00:00Z'), body: localMarker }], headDate: '2026-11-23T11:00:00Z' }), 'pass');

// No review at all: allowed only with a reason, and it stays visible.
assert.equal(level({ body: card('**Review:** None: both providers are out of quota until Monday.') }), 'warn');
assert.equal(level({ body: card('**Review:** None.') }), 'fail');
assert.equal(level({ body: card('**Review:** None: n/a') }), 'fail');
assert.equal(level({ body: card('**Review:** None: APIs down') }), 'warn');
assert.equal(level({ body: card('**Review:** None: Rate-limited') }), 'warn');
assert.equal(level({ body: card('**Review:** None: pending') }), 'fail');

console.log('review-trace: ok');
