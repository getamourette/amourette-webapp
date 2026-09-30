import { appendFileSync } from "node:fs";
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";

// Add a diagnosis without changing Playwright's failure status or retry policy.
export default class InfrastructureReporter implements Reporter {
  private counts = { password: 0, anonymous: 0 };
  onTestEnd(test: TestCase, result: TestResult) {
    const annotation = test.annotations.find(item => item.type === "fixture-auth-counts");
    if (annotation?.description) {
      const counts = JSON.parse(annotation.description) as { password: number; anonymous: number };
      this.counts.password += counts.password;
      this.counts.anonymous += counts.anonymous;
    }
    if (result.errors.some(error => /rate limit|\b429\b/i.test(error.message ?? ""))) {
      console.error("::error title=Supabase infrastructure limitation::Auth/Supabase rate limiting observed. This run FAILED; it is not evidence of a functional regression or successful validation. Inspect the report and cleanup before a deliberate rerun.");
    }
  }
  onEnd() {
    const report = `Fixture accounts created: ${this.counts.password} password, ${this.counts.anonymous} anonymous. All remain subject to owned-fixture teardown.`;
    console.log(report);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n");
  }
}
