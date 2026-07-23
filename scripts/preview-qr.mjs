#!/usr/bin/env node
// Print a venue URL on a Vercel preview deployment and a scannable QR code for
// it. Phone testing runs off Vercel previews now, not a LAN `next dev` server.
import { execFileSync } from "node:child_process";
import QRCode from "qrcode";

// Vercel project + team slugs baked into the preview hostname. The Vercel
// project is still named `qr-web-app` even though the repo is amourette-webapp.
const PROJECT = "qr-web-app";
const TEAM = "tothe-moon";
const DEFAULT_VENUE = "test-crowded";

function usage() {
  return `Usage: npm run preview:qr -- [options]

Options:
  --venue <slug>   Venue to open (default: ${DEFAULT_VENUE})
  --branch <name>  Preview branch (default: current git branch)
  --help           Show this help
`;
}

function parseArgs(args) {
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];

    if (option === "--help") {
      options.help = true;
      continue;
    }

    if (option !== "--venue" && option !== "--branch") {
      throw new Error(`Unknown option: ${option}`);
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${option}`);
    }

    const key = option === "--venue" ? "venue" : "branch";
    options[key] = value;
    index += 1;
  }

  return options;
}

// Slugify a branch name the way Vercel does when building a preview hostname:
// lowercase, every run of non-alphanumeric chars becomes a single '-', and
// leading/trailing '-' are trimmed.
function slugify(branch) {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function currentBranch() {
  return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf8",
  }).trim();
}

let options;

try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.message}\n\n${usage()}`);
  process.exit(1);
}

if (options.help) {
  process.stdout.write(usage());
  process.exit(0);
}

const venue = options.venue ?? DEFAULT_VENUE;

if (!/^[a-z0-9-]+$/.test(venue)) {
  process.stderr.write(
    `Invalid venue slug: ${venue}. Use lowercase letters, numbers, and hyphens only.\n`,
  );
  process.exit(1);
}

const branch = options.branch ?? currentBranch();
const slug = slugify(branch);
const label = `${PROJECT}-git-${slug}-${TEAM}`;
const url = `https://${label}.vercel.app/v/${venue}`;

// Beyond 63 chars Vercel truncates the label and appends a hash, so the
// deterministic URL we build here no longer matches the real deployment.
if (label.length > 63) {
  process.stderr.write(
    `warning: preview label is ${label.length} chars (> 63). Vercel truncates ` +
      `and adds a hash beyond that, so the URL below will NOT be exact.\n`,
  );
}

process.stdout.write(`Branch:  ${branch}\n`);
process.stdout.write(`Venue:   ${venue}\n`);
process.stdout.write(`Preview: ${url}\n\n`);

QRCode.toString(url, { type: "terminal", small: true }, (err, qr) => {
  if (err) {
    process.stderr.write(`Failed to render QR code: ${err.message}\n`);
    process.exit(1);
  }
  process.stdout.write(qr + "\n");
});
