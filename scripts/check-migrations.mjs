#!/usr/bin/env node

// Pull request check for the migrations a branch adds (#434). It classifies
// each new file (scripts/migration-kind.mjs) and enforces what its kind asks:
//
//   additive   nothing more.
//   behaviour  the code already live on main must pass its browser suite on
//              the new schema; this check asks the workflow for that run.
//   removal    the pull request holds the migration only, no application code
//              still names the removed object, and the last use left main at
//              least 24 hours ago.
//
//   CI_BASE=<sha> CI_HEAD=<sha> node scripts/check-migrations.mjs [--github]
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { isDocumentation } from './ci-plan.mjs';
import { ADDITIVE, BEHAVIOUR, KIND_NAMES, REMOVAL, classifyMigration } from './migration-kind.mjs';

export const MIGRATIONS = 'supabase/migrations/';
// Where the deployed application reads the database from. Tests, seed and QA
// tooling do not run in production and do not hold a removal back.
export const APPLICATION_PATHS = ['app', 'components', 'emails', 'lib', 'proxy.ts'];
// Generated from the schema: it changes with the migration that removes.
const TYPES = 'lib/database.types.ts';
export const QUIET_HOURS = 24;
const isMigration = path => path.startsWith(MIGRATIONS) && path.endsWith('.sql');

// Pure decision. `changes` is [{ status, path }] for the whole pull request,
// `existing` the migration file names already in main, `read` returns the SQL
// of a path, `uses(object)` the application lines still naming an object and
// `lastUseChange(object)` the time main last changed how often it is named.
export function assessMigrations({ changes, existing, read, uses, lastUseChange, now = Date.now() }) {
  const errors = [];
  const touched = changes.filter(change => isMigration(change.path));
  for (const change of touched.filter(change => change.status !== 'A')) {
    errors.push(`${change.path} is already in main: a migration is never edited or deleted, add a new file.`);
  }
  const added = touched.filter(change => change.status === 'A').map(change => change.path).sort();
  const last = [...existing].sort().at(-1);
  let earlier = [...existing].sort().map(file => read(`${MIGRATIONS}${file}`)).join('\n');
  const files = [];
  for (const path of added) {
    const file = path.slice(MIGRATIONS.length);
    const sql = read(path);
    if (last && file < last) errors.push(`${file} sorts before ${last}, which is already in main. Rename it so it sorts last.`);
    if (/^\s*(begin|commit|rollback|start\s+transaction)\s*;/im.test(sql)) errors.push(`${file} contains BEGIN, COMMIT or ROLLBACK. Each migration is applied as one transaction.`);
    files.push({ file, ...classifyMigration(sql, earlier) });
    earlier += `\n${sql}`;
  }
  const kind = files.reduce((highest, file) => Math.max(highest, file.kind), 0);
  const others = changes.filter(change => !isMigration(change.path) && !isDocumentation(change.path) && change.path !== TYPES).map(change => change.path);
  const removals = [];
  if (kind === REMOVAL) {
    if (others.length) {
      errors.push(`A migration that removes, renames or is not recognised ships alone, so this pull request's browser suite runs the code already live. Move these to another pull request: ${others.slice(0, 8).join(', ')}${others.length > 8 ? ', …' : ''}.`);
    }
    for (const object of new Set(files.flatMap(file => file.removed))) {
      const remaining = uses(object);
      const changed = lastUseChange(object);
      const hours = changed === null ? null : (now - changed) / 3_600_000;
      removals.push({ object, remaining, hours });
      if (remaining.length) errors.push(`${object} is still named in application code (${remaining.length} line(s)).`);
      else if (hours !== null && hours < QUIET_HOURS) errors.push(`${object} left the application code ${hours.toFixed(1)} h ago: wait ${QUIET_HOURS} h so no open browser tab still runs the old code.`);
    }
  }
  // With application code in the same pull request, its own browser suite
  // tests the new code; the live code needs a run of its own.
  return { kind, files, removals, errors, liveCode: kind === BEHAVIOUR && others.length > 0 };
}

export function report({ kind, files, removals, errors, liveCode }) {
  if (!files.length && !errors.length) return 'No new migration.\n';
  const lines = ['### Migrations', ''];
  for (const file of files) {
    lines.push(`- \`${file.file}\`: **${KIND_NAMES[file.kind]}**`);
    const seen = new Set();
    for (const finding of file.findings.filter(finding => finding.kind === file.kind && file.kind > ADDITIVE)) {
      if (seen.has(finding.reason) || seen.size === 6) continue;
      seen.add(finding.reason);
      lines.push(`  - ${finding.reason}: \`${finding.statement.replaceAll('`', "'")}\``);
    }
  }
  for (const removal of removals) {
    lines.push('', `Search for \`${removal.object}\` in ${APPLICATION_PATHS.join(', ')}: ${removal.remaining.length} line(s).`);
    for (const line of removal.remaining.slice(0, 20)) lines.push(`  - \`${line.replaceAll('`', "'")}\``);
    lines.push(removal.hours === null ? 'Never named in the application code of main.' : `Last change of its uses in main: ${removal.hours.toFixed(1)} h ago.`);
  }
  if (kind === BEHAVIOUR) lines.push('', liveCode ? 'The code already live on main runs its browser suite on this schema ("Live code on the new schema").' : 'Migration only: the browser suite of this pull request is the code already live on the new schema.');
  if (kind === REMOVAL && !errors.length) lines.push('', 'Migration only: the browser suite of this pull request is the code already live on the new schema.');
  if (errors.length) lines.push('', '**Refused:**', ...errors.map(error => `- ${error}`));
  return `${lines.join('\n')}\n`;
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const word = object => object.split('.').at(-1);

function main() {
  const { CI_BASE: base, CI_HEAD: head, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary } = process.env;
  let result = { kind: 0, files: [], removals: [], errors: [], liveCode: false };
  // Manual and nightly runs validate main itself: there is no pull request.
  if (base || head) {
    for (const sha of [base, head]) if (!/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('CI_BASE and CI_HEAD must be full 40-character commit SHAs');
    const changes = git('diff', '--name-status', '--no-renames', '-z', `${base}...${head}`, '--').split('\0').filter(Boolean)
      .reduce((list, value, index, all) => (index % 2 ? list : [...list, { status: value, path: all[index + 1] }]), []);
    const existing = git('ls-tree', '--name-only', `${base}:${MIGRATIONS.slice(0, -1)}`).split('\n').filter(file => file.endsWith('.sql'));
    result = assessMigrations({
      changes,
      existing,
      read: path => (existing.includes(path.slice(MIGRATIONS.length)) ? git('show', `${base}:${path}`) : git('show', `${head}:${path}`)),
      // Fixed-string, whole-word search of the application as main has it.
      uses(object) {
        try {
          return git('grep', '-n', '-w', '-F', '-e', word(object), base, '--', ...APPLICATION_PATHS, `:(exclude)${TYPES}`).split('\n').filter(Boolean).map(line => line.slice(base.length + 1));
        } catch (error) {
          if (error.status === 1) return [];
          throw error;
        }
      },
      lastUseChange(object) {
        const date = git('log', '-1', '--format=%cI', `-S${word(object)}`, base, '--', ...APPLICATION_PATHS, `:(exclude)${TYPES}`).trim();
        return date ? Date.parse(date) : null;
      },
    });
  }
  const text = report(result);
  process.stdout.write(text);
  if (summary) appendFileSync(summary, text);
  if (output) appendFileSync(output, `migration_kind=${KIND_NAMES[result.kind] ?? 'none'}\nlive_code=${result.liveCode}\n`);
  if (result.errors.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
