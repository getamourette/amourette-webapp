import { expect, test } from "@playwright/test";

// TEMPORARY proof for the repeat step, removed before Ready: passes when run once,
// fails on the first attempt of its seventh repetition and passes on retry.
test("deliberately unstable", async ({}, testInfo) => {
  expect(testInfo.repeatEachIndex === 6 && testInfo.retry === 0, "simulated flake").toBe(false);
});
