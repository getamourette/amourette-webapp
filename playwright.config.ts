import { defineConfig, devices } from "@playwright/test";
import { loadTestEnv } from "./tests/helpers/env";

loadTestEnv();

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
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "en-US",
    timezoneId: "Europe/Paris",
  },
  projects: [{ name: "chromium-mobile", use: { ...devices["Pixel 7"] } }],
  webServer: {
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
