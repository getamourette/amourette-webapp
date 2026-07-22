#!/usr/bin/env node
// Print the Vercel preview URL of the current git branch (or one passed as an
// argument) and a scannable QR code for it, so a phone can open the branch's
// preview deployment directly. Phone testing runs off Vercel previews now, not
// a LAN `next dev` server.
import { execSync } from "node:child_process";
import QRCode from "qrcode";

// Vercel project + team slugs baked into the preview hostname. The Vercel
// project is still named `qr-web-app` even though the repo is amourette-webapp.
const PROJECT = "qr-web-app";
const TEAM = "tothe-moon";

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
  return execSync("git rev-parse --abbrev-ref HEAD", {
    encoding: "utf8",
  }).trim();
}

const branch = process.argv[2] ?? currentBranch();
const slug = slugify(branch);
const label = `${PROJECT}-git-${slug}-${TEAM}`;
const url = `https://${label}.vercel.app`;

// Beyond 63 chars Vercel truncates the label and appends a hash, so the
// deterministic URL we build here no longer matches the real deployment.
if (label.length > 63) {
  process.stderr.write(
    `warning: preview label is ${label.length} chars (> 63). Vercel truncates ` +
      `and adds a hash beyond that, so the URL below will NOT be exact.\n`,
  );
}

process.stdout.write(`Branch:  ${branch}\n`);
process.stdout.write(`Preview: ${url}\n\n`);

QRCode.toString(url, { type: "terminal", small: true }, (err, qr) => {
  if (err) {
    process.stderr.write(`Failed to render QR code: ${err.message}\n`);
    process.exit(1);
  }
  process.stdout.write(qr + "\n");
});
