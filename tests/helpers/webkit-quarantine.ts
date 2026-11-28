import { test } from "@playwright/test";

// Browser tests set aside on WebKit only, each with the issue that tracks it.
// This is the whole list: keep it short, and remove an entry (and its call) when
// the issue is fixed. Chromium still runs every one of these tests.
// docs/workflow.md, "Safari WebKit job (#349)".
export const webkitQuarantine = {
  "#590": "venue details focus after a save races React's commit (product bug)",
  "#594": "chat-preview journey times out at a different step each run, cause not classified",
} as const;

export function quarantinedOnWebKit(issue: keyof typeof webkitQuarantine) {
  test.fixme(test.info().project.name.startsWith("webkit"), `Quarantined on WebKit, ${issue}: ${webkitQuarantine[issue]}`);
}
