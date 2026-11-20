#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { developmentTargetRefusal } from "./development-target.mjs";
import { randomSeedPassword, retiredTemplatePasswords, seedAccounts } from "./seed-accounts.mjs";

// Replaces the password of existing synthetic seed accounts with a random
// secret that is never stored or printed (#370, SEC-007). Profiles, presence,
// likes, matches and the rooms themselves are left untouched.
const SHARED_WRITE_FLAG = "--confirm-shared-write";
const SCOPES = new Set(["test", "demo", "other", "all"]);
// Auth rate-limits both admin updates and sign-in attempts; wait and resume
// rather than stop halfway. Rotation is safe to repeat.
const ATTEMPTS = 8;
const RETRY_DELAY_MS = 20_000;

loadLocalEnv();
const options = parseArguments(process.argv.slice(2));
if (options.help) {
  process.stdout.write(usage());
  process.exit(0);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  fail("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment or .env.local.");
}
const targetRefusal = developmentTargetRefusal(supabaseUrl);
if (targetRefusal) fail(targetRefusal);
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const accounts = seedAccounts(await listAuthUsers(), options.scope);

if (options.command === "list") {
  printAccounts(accounts);
  process.stdout.write(
    `\nRead-only: nothing was changed. ${accounts.length} account(s) would get a new random password with:\n` +
    `  npm run seed:rotate-passwords -- rotate --scope ${options.scope} ${SHARED_WRITE_FLAG}\n`,
  );
}

if (options.command === "rotate") {
  if (!options.confirmed) {
    printAccounts(accounts);
    fail(`\nRefusing to rotate without ${SHARED_WRITE_FLAG}. The Supabase database is shared. Nothing was changed.`);
  }
  let rotated = 0;
  for (const { user } of accounts) {
    let error;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      ({ error } = await supabase.auth.admin.updateUserById(user.id, { password: randomSeedPassword() }));
      if (!error) break;
      if (attempt < ATTEMPTS) await sleep(RETRY_DELAY_MS);
    }
    if (error) {
      fail(`Stopped after ${rotated}/${accounts.length}: could not rotate ${user.email}: ${error.code ?? error.status ?? error.message}. Run the same command again.`);
    }
    rotated += 1;
  }
  process.stdout.write(`Rotated ${rotated} seed account password(s) (scope: ${options.scope}). Run verify next.\n`);
}

if (options.command === "verify") {
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!publishableKey) fail("Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to attempt ordinary sign-ins.");
  const accepted = [];
  const unknown = [];
  for (const { user } of accounts) {
    for (const password of retiredTemplatePasswords(user)) {
      const participant = createClient(supabaseUrl, publishableKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      let data, error;
      for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
        ({ data, error } = await participant.auth.signInWithPassword({ email: user.email, password }));
        if (error?.code !== "over_request_rate_limit" || attempt === ATTEMPTS) break;
        await sleep(RETRY_DELAY_MS);
      }
      if (data?.session) {
        accepted.push(user.email);
        await participant.auth.signOut();
        break;
      }
      // Only an explicit credential refusal proves the template is dead; a rate
      // limit or network error proves nothing.
      if (error?.code !== "invalid_credentials") {
        unknown.push(`${user.email} (${error?.code ?? error?.message ?? "no session"})`);
        break;
      }
    }
  }
  for (const email of accepted) process.stdout.write(`STILL ACCEPTS a retired template password: ${email}\n`);
  for (const entry of unknown) process.stdout.write(`Could not conclude: ${entry}\n`);
  if (accepted.length || unknown.length) {
    fail(`Verification failed: ${accepted.length} account(s) still accept a retired template password, ${unknown.length} inconclusive, out of ${accounts.length}.`);
  }
  process.stdout.write(`Verified: none of the ${accounts.length} seed account(s) (scope: ${options.scope}) accepts a retired template password.\n`);
}

async function listAuthUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) fail(`Could not list auth users: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

function printAccounts(entries) {
  const counts = {};
  for (const { user, scope } of entries) {
    counts[scope] = (counts[scope] ?? 0) + 1;
    process.stdout.write(
      `${scope.padEnd(5)}  ${(user.email ?? "(no email)").padEnd(40)}  ${user.id}  created ${day(user.created_at)}  last sign-in ${day(user.last_sign_in_at)}\n`,
    );
  }
  const summary = Object.entries(counts).map(([scope, count]) => `${count} ${scope}`).join(", ") || "none";
  process.stdout.write(`\nSeed accounts in scope "${options.scope}": ${entries.length} (${summary}).\n`);
}

function day(value) {
  return value ? value.slice(0, 16).replace("T", " ") : "never";
}

function parseArguments(args) {
  const result = { command: "list", scope: "all", confirmed: false };
  let index = 0;
  if (args[0] && !args[0].startsWith("--")) {
    result.command = args[0];
    index = 1;
  }
  if (!new Set(["list", "rotate", "verify"]).has(result.command)) fail(usage());
  for (; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help") result.help = true;
    else if (arg === SHARED_WRITE_FLAG && result.command === "rotate") result.confirmed = true;
    else if (arg === "--scope") {
      const value = args[++index];
      if (!SCOPES.has(value)) fail(`--scope must be one of: ${[...SCOPES].join(", ")}.`);
      result.scope = value;
    } else fail(`Unknown option: ${arg}\n\n${usage()}`);
  }
  return result;
}

function usage() {
  return `Usage: npm run seed:rotate-passwords -- [command] [options]

Commands:
  list     Read-only: the seed accounts that rotate would change (default)
  rotate   Give each listed account a new random password that is never stored
  verify   Attempt a sign-in with the retired template passwords; fails if one is accepted

Options:
  --scope test|demo|other|all   QA rooms, demo room, older synthetic accounts, or all (default)
  ${SHARED_WRITE_FLAG}        Required by rotate (shared database)

rotate changes passwords only: profiles, presence, likes and matches are kept.
verify opens then closes a session on any account that still accepts a template.
`;
}

function loadLocalEnv() {
  try {
    const contents = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // Environment variables are also supported directly.
  }
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
