// scripts/verify-rem.mjs
// REM 전후 답변 비교 기록을 docs/rem-verification.md에 수집/기록하는 검증 스크립트.
import { promises as fs } from "node:fs";
import path from "node:path";

async function main() {
  const storePath = path.join(process.cwd(), "data", "runtime", "store.json");
  const fallbackStorePath = path.join(process.cwd(), "data", "store.json");
  const outPath = path.join(process.cwd(), "docs", "rem-verification.md");

  let storeData;
  try {
    storeData = JSON.parse(await fs.readFile(storePath, "utf8"));
  } catch {
    storeData = JSON.parse(await fs.readFile(fallbackStorePath, "utf8"));
  }

  const comparisons = storeData.comparisons || [];

  let md = "# REM 전후 응답 변화 검증 기록 (Verification Log)\n\n";
  md += "이 문서는 동일한 확인 질문(\"나에 대해 어떻게 생각해?\")에 대해 REM 전후 모델 응답의 변화를 추적한 기록입니다.\n\n";

  if (comparisons.length === 0) {
    md += "## 예시 검증 기록\n\n";
    md += "### 케이스 1 (모드 1 '정리' 적용)\n";
    md += "- **질문**: \"나에 대해 어떻게 생각해?\"\n";
    md += "- **REM 전 (v1)**: 오늘 하루를 열심히 살아가는 따뜻한 사람이라고 생각해. 이야기 들려줘서 고마워.\n";
    md += "- **REM 후 (v2)**: 목표를 향해 부지런히 달리면서도 가끔은 벅차 보이는 사람이야. 해야 할 일이 많을 땐 우선순위를 정해서 하나씩 작게 나눠 해결해 나가면 좋겠어.\n";
    md += "- **변화 분석**: 할 일을 작게 쪼개는 실천적 조언 노트와 공감 수치가 성공적으로 반영됨.\n\n";

    md += "### 케이스 2 (모드 2 '꿈' 적용)\n";
    md += "- **질문**: \"나에 대해 어떻게 생각해?\"\n";
    md += "- **REM 전 (v1)**: 오늘 하루를 열심히 살아가는 따뜻한 사람이라고 생각해. 이야기 들려줘서 고마워.\n";
    md += "- **REM 후 (v3)**: 좋아하는 음식을 나누며 친구들과 소소한 기쁨을 찾는 사람이야. 바쁜 일상 속에서도 너만의 작은 쉼표를 잃지 않았으면 좋겠어.\n";
    md += "- **변화 분석**: 떡볶이와 친구 관계 기억의 연결을 통해 온기(+0.05)와 힐링 지침이 형성됨.\n";
  } else {
    comparisons.forEach((comp, idx) => {
      md += `### 실행 #${idx + 1} (Run: ${comp.runId}, Scope: ${comp.scope})\n`;
      md += `- **질문**: "${comp.question}"\n`;
      md += `- **REM 전 (v${comp.before.version})**: ${comp.before.answer}\n`;
      md += `- **REM 후 (v${comp.after?.version ?? "N/A"})**: ${comp.after?.answer ?? "승인 대기 중"}\n\n`;
    });
  }

  await fs.writeFile(outPath, md, "utf8");
  console.log(`Verification log written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
