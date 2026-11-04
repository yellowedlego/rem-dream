import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  outputDir: "test-results",
  use: {
    baseURL: "http://localhost:3123",
  },
  webServer: {
    command: process.platform === "win32" ? "npm.cmd run start -- -p 3123" : "npm run start -- -p 3123",
    url: "http://localhost:3123",
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      MODEL_MOCK: "1",
      ...process.env,
    },
  },
});
