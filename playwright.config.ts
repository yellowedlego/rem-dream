import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  outputDir: "test-results",
  use: {
    baseURL: "http://localhost:3123",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: "npm run start -- -p 3123",
    url: "http://localhost:3123",
    reuseExistingServer: true,
  },
});
