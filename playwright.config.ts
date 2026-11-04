import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  outputDir: "test-results",
  // 모든 테스트가 같은 서버·같은 저장소를 쓰므로 한 번에 하나씩 돌린다 (서로의 기억이 섞이지 않게)
  workers: 1,
  fullyParallel: false,
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
      // 테스트는 개발 서버와 다른 실행 저장소를 쓴다 (개발 중 쌓은 기억을 건드리지 않게)
      REM_RUNTIME_DIR: "data/runtime-test",
    },
  },
});
