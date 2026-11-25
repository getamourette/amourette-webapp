// Verdicts of `npm run pr:wait`, offline: each terminal state is reached once,
// and nothing waits on a run that never started or past the time limit.
import assert from 'node:assert/strict';
import { judge, requiredChecks } from './pr-wait.mjs';

const head = 'a'.repeat(40);
const limits = { timeout: 40, start: 3 };
const early = { waited: 1, sinceHead: 1 };
const open = { state: 'OPEN', mergeable: 'MERGEABLE', head, runs: 1, checks: [] };
const check = (name, conclusion, id = 1) => ({ id, name, status: conclusion ? 'completed' : 'in_progress', conclusion });
const green = requiredChecks.map(name => check(name, 'success'));

// A conflict fails at once: GitHub starts no pull_request run on it (#529 waited 50 minutes).
let verdict = judge({ ...open, mergeable: 'CONFLICTING', runs: 0 }, early, limits);
assert.deepEqual([verdict.done, verdict.ok], [true, false]);
assert.match(verdict.message, /Conflict with main/);

// Not yet computed mergeability is not a conflict.
assert.equal(judge({ ...open, mergeable: 'UNKNOWN', runs: 0 }, early, limits).done, false);

// No run on the head commit: wait a little, then stop and say so.
assert.equal(judge({ ...open, runs: 0 }, early, limits).done, false);
verdict = judge({ ...open, runs: 0 }, { waited: 3, sinceHead: 3 }, limits);
assert.deepEqual([verdict.done, verdict.ok], [true, false]);
assert.match(verdict.message, /No CI run started on aaaaaaa after 3 min/);

// Only the two required checks count; a non-blocking job still running or failing does not.
verdict = judge({ ...open, checks: [...green, check('Safari WebKit iPhone, non-blocking (1/4)', null), check('Safari WebKit iPhone, non-blocking (2/4)', 'failure')] }, early, limits);
assert.deepEqual([verdict.done, verdict.ok], [true, true]);

// One required check green, the other running: keep waiting.
assert.equal(judge({ ...open, checks: [green[0], check(requiredChecks[1], null)] }, early, limits).done, false);

// A failed required check ends the wait at once.
verdict = judge({ ...open, checks: [check(requiredChecks[0], null), check(requiredChecks[1], 'failure')] }, early, limits);
assert.deepEqual([verdict.done, verdict.ok], [true, false]);
assert.match(verdict.message, /Playwright Chromium mobile \(failure\)/);

// A rerun replaces the earlier attempt of the same check.
verdict = judge({ ...open, checks: [...green, check(requiredChecks[1], 'failure', 0)] }, early, limits);
assert.equal(verdict.ok, true);

// The time limit always ends the wait, naming what is still pending.
verdict = judge({ ...open, checks: [green[0]] }, { waited: 40, sinceHead: 40 }, limits);
assert.deepEqual([verdict.done, verdict.ok], [true, false]);
assert.match(verdict.message, /Time limit of 40 min .*Playwright Chromium mobile \(not started\)/);

// Right after a push the pull request can still show the previous head: its green
// checks prove nothing, so wait for the pushed commit, then give up and say so.
const pushed = 'b'.repeat(40);
verdict = judge({ ...open, checks: green }, early, { ...limits, expected: pushed });
assert.equal(verdict.done, false);
assert.match(verdict.message, /still shows aaaaaaa; waiting for the pushed bbbbbbb/);
verdict = judge({ ...open, checks: green }, { waited: 3, sinceHead: 3 }, { ...limits, expected: pushed });
assert.deepEqual([verdict.done, verdict.ok], [true, false]);
assert.equal(judge({ ...open, checks: green }, early, { ...limits, expected: head }).ok, true);

// A closed or merged pull request is not waited on.
assert.equal(judge({ ...open, state: 'MERGED' }, early, limits).ok, false);

console.log('PR wait: conflict, missing run, stale head, required-only, failure, rerun and time limit verdicts passed.');
