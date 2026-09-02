import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export const QA_VENUES = ["test-crowded", "test-empty", "test-waiting"];
export const DEFAULT_QA_VENUE = "test-crowded";
export const GITHUB_REPO = "getamourette/amourette-webapp";
const VERCEL_PROJECT = "amourette-webapp";
const VERCEL_TEAM = "tothe-moon";

export function loadLocalEnv() {
  try {
    const contents = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // Direct environment variables are supported for CI and one-off use.
  }
}

export function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

export function currentBranch() {
  return git(["branch", "--show-current"]);
}

export function suggestQaVenue() {
  let paths = [];
  try {
    const base = git(["merge-base", "HEAD", "origin/main"]);
    paths = git(["diff", "--name-only", base]).split("\n").filter(Boolean);
  } catch {
    return { venue: DEFAULT_QA_VENUE, reason: "the branch diff could not be inspected" };
  }

  const waiting = paths.filter((path) =>
    /WaitingRoom|PreLaunch|venue[-_]night|venue_night|Waiting/.test(path),
  );
  const empty = paths.filter((path) => /Empty|empty|room-filling|presence/.test(path));
  if (waiting.length > 0 && empty.length === 0) {
    return { venue: "test-waiting", reason: `the diff changes ${waiting[0]}` };
  }
  if (empty.length > 0 && waiting.length === 0) {
    return { venue: "test-empty", reason: `the diff changes ${empty[0]}` };
  }
  return {
    venue: DEFAULT_QA_VENUE,
    reason: paths.length === 0 ? "there is no committed branch diff" : "the diff is broad or ambiguous",
  };
}

export function resolveVenue(requested) {
  if (!requested || requested === "auto") return suggestQaVenue();
  if (!QA_VENUES.includes(requested)) {
    throw new Error(`Unknown QA venue: ${requested}. Use ${QA_VENUES.join(", ")}, or auto.`);
  }
  return { venue: requested, reason: "explicitly selected" };
}

export function discoverPreviewUrl({
  sha = git(["rev-parse", "HEAD"]),
  branch = currentBranch(),
} = {}) {
  let deployments;
  try {
    deployments = JSON.parse(
      execFileSync(
        "gh",
        ["api", `repos/${GITHUB_REPO}/deployments?sha=${sha}&environment=Preview&per_page=20`],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      ),
    );
  } catch (error) {
    throw new Error(`Could not query GitHub deployments: ${commandError(error)}`);
  }

  for (const deployment of deployments) {
    let statuses;
    try {
      statuses = JSON.parse(
        execFileSync("gh", ["api", deployment.statuses_url], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }),
      );
    } catch {
      continue;
    }
    const ready = statuses.find(
      (status) => status.state === "success" && /^https:\/\//.test(status.environment_url ?? ""),
    );
    if (ready) {
      const stableOrigin = deterministicBranchOrigin(branch);
      if (stableOrigin) return stableOrigin;
      return inspectStableAlias(ready.environment_url) ?? ready.environment_url.replace(/\/$/, "");
    }
  }
  throw new Error(
    `No ready Vercel preview was found for ${sha.slice(0, 7)}. Push the branch and wait for Vercel.`,
  );
}

export function deterministicBranchOrigin(branch) {
  const branchSlug = branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const label = `${VERCEL_PROJECT}-git-${branchSlug}-${VERCEL_TEAM}`;
  return label.length <= 63 ? `https://${label}.vercel.app` : null;
}

function inspectStableAlias(deploymentUrl) {
  try {
    const metadata = JSON.parse(
      execFileSync(
        "vercel",
        [
          "inspect",
          deploymentUrl,
          "--format=json",
          "--scope",
          VERCEL_TEAM,
          "--no-color",
          "--non-interactive",
        ],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
          env: {
            ...process.env,
            XDG_CACHE_HOME:
              process.env.XDG_CACHE_HOME ?? join(tmpdir(), "amourette-vercel-cache"),
          },
        },
      ),
    );
    const alias = metadata.aliases?.find(
      (candidate) => candidate.includes("-git-") && candidate.endsWith(".vercel.app"),
    );
    return alias ? `https://${alias}` : null;
  } catch {
    return null;
  }
}

function commandError(error) {
  return error?.stderr?.toString().trim() || error?.message || "unknown error";
}
