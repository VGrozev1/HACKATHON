// Demo rehearsal (task C9): `npm run demo:check` clicks through the judges' demo path
// in a real browser. Reuses a running `npm run dev`, or starts one. Set DEMO_URL to
// check a deployed preview instead (no local server is started then).

import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
const DEMO_URL = process.env.DEMO_URL;

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: DEMO_URL ?? `http://localhost:${PORT}`,
    // Laptop size from the demo plan; the projector run is the same flow at 1920.
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // `npm run demo:record` saves a video of the run under test-results/ (a rough backup recording).
    video: process.env.npm_lifecycle_event === "demo:record" ? "on" : "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  webServer: DEMO_URL
    ? undefined
    : {
        command: "npm run dev",
        url: `http://localhost:${PORT}`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
