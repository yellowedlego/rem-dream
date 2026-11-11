// 관리자 비밀번호를 해시로 바꿔 .env.local에 넣을 한 줄을 출력한다. 비밀번호 자체는 어디에도 저장하지 않는다.
// 실행: node scripts/hash-password.mjs   (입력 창에 비밀번호를 치고 Enter)
// 출력된 ADMIN_PASSWORD_HASH=... 줄을 .env.local에 붙여 넣는다. 이 값도 git·채팅에 올리지 않는다.
import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
rl.stdoutMuted = true;
rl._writeToOutput = function (s) {
  if (!this.stdoutMuted || s.includes("비밀번호")) this.output.write(s);
};
rl.question("관리자 비밀번호: ", (pw) => {
  rl.close();
  process.stderr.write("\n");
  if (pw.length < 8) {
    process.stderr.write("8자 이상으로 정해 주세요.\n");
    process.exit(1);
  }
  const salt = randomBytes(16);
  const hash = scryptSync(pw.normalize("NFC"), salt, 32, { N: 16384, r: 8, p: 1 });
  // 모양: scrypt$N$r$p$소금(base64url)$해시(base64url) — 서버(B-12)는 같은 값으로 다시 계산해 timingSafeEqual로 비교한다
  console.log(`ADMIN_PASSWORD_HASH=scrypt$16384$8$1$${salt.toString("base64url")}$${hash.toString("base64url")}`);
});
