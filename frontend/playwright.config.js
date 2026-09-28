import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:5174",
    browserName: "chromium",
    channel: process.env.TEST_BROWSER || "chrome",
    viewport: { width: 1366, height: 768 },
    trace: "retain-on-failure",
  },
});
