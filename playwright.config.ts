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
      ...process.env,
      MODEL_MOCK: "1",
      // 테스트는 개발 서버와 다른 실행 저장소를 쓴다 (개발 중 쌓은 기억을 건드리지 않게)
      REM_RUNTIME_DIR: "data/runtime-test",
      // 테스트는 절대 실제 메일을 보내지 않는다 (outbox 폴더에 파일로만 남긴다)
      MAIL_MOCK: "1",
      // 테스트 서버는 관리자 잠금을 끈다 (.env.local의 진짜 비밀번호 해시를 테스트가 쓰지 않게).
      // 잠금 동작(로그인 뒤 쿠키로 통과, 없으면 401)은 개발 서버에서 따로 확인한다
      ADMIN_PASSWORD_HASH: "",
    },
  },
});
