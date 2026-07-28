#!/usr/bin/env node
// Print a venue URL on a Vercel preview deployment and a scannable QR code for
// it. Phone testing runs off Vercel previews now, not a LAN `next dev` server.
import QRCode from "qrcode";
import {
  currentBranch,
  DEFAULT_QA_VENUE,
  discoverPreviewUrl,
  git,
} from "./qa-support.mjs";

function usage() {
  return `Usage: npm run preview:qr -- [options]

Options:
  --venue <slug>   Venue to open (default: ${DEFAULT_QA_VENUE})
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

    options[option === "--venue" ? "venue" : "branch"] = value;
    index += 1;
  }

  return options;
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

const venue = options.venue ?? DEFAULT_QA_VENUE;

if (!/^[a-z0-9-]+$/.test(venue)) {
  process.stderr.write(
    `Invalid venue slug: ${venue}. Use lowercase letters, numbers, and hyphens only.\n`,
  );
  process.exit(1);
}

const branch = options.branch ?? currentBranch();
let origin;
try {
  const sha = options.branch
    ? git(["rev-parse", options.branch])
    : undefined;
  origin = discoverPreviewUrl({ sha, branch });
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
const url = `${origin}/v/${venue}`;

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
