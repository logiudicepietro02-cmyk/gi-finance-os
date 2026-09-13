import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT || 3100);
// Uses an installed browser (Edge ships with Windows, Chrome elsewhere); override with PW_CHANNEL.
const channel = process.env.PW_CHANNEL || (process.platform === "win32" ? "msedge" : "chrome");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "it-IT",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "api", testMatch: /api\.spec\.ts$/ },
    { name: "e2e", testMatch: /flow\.spec\.ts$/, use: { channel, viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: `http://localhost:${PORT}/api/health`,
    timeout: 600_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
