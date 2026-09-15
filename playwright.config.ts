import { defineConfig, devices } from "@playwright/test";
import { loadTestEnv } from "./tests/helpers/env";

loadTestEnv();
const preview = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: preview ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "en-US",
    timezoneId: "Europe/Paris",
  },
  projects: [{ name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
    ...(process.env.E2E_DESKTOP === "true" ? [{ name: "chromium-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } }] : [])],
  webServer: preview ? undefined : {
    command: "npm run start -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    env: {
      PROFILE_PHOTO_REVIEW_ENABLED: "false",
      EMAIL_DELIVERY_ENABLED: "false",
      OPENAI_API_KEY: "",
      RESEND_API_KEY: "",
    },
    timeout: 120_000,
  },
});
