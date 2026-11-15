// scripts/record-replay.mjs
// REM 실행 결과를 녹화하여 data/replays/<id>.json 파일로 저장한다.
import { promises as fs } from "node:fs";
import path from "node:path";

async function main() {
  const replayId = process.argv[2] || `replay_${Date.now()}`;
  const outDir = path.join(process.cwd(), "data", "replays");
  await fs.mkdir(outDir, { recursive: true });

  const record = {
    id: replayId,
    title: "녹화된 REM 예시 실행",
    createdAt: new Date().toISOString(),
    steps: [
      {
        step: 1,
        readingNodeIds: [1],
        insight: {
          id: 1,
          content: "어려운 과제를 마주했을 때 스스로 우선순위를 정해 차근차근 해결한다.",
          strength: 0.9,
          sourceNodeIds: [1],
        },
      },
    ],
    proposal: {
      summary: "차근차근 작게 나누어 해결하는 방식을 긍정적으로 지지합니다.",
      items: [
        {
          id: 1,
          change: {
            id: 1,
            kind: "moveStyle",
            axis: "empathy",
            delta: 0.05,
          },
          reason: "과제 해결 과정의 고민에 대한 공감 강화",
          evidenceNodeIds: [1],
          sourceInsightIds: [1],
          sourceMeaningIds: [],
          status: "pending",
        },
      ],
    },
    comparison: {
      question: "나에 대해 어떻게 생각해?",
      before: "오늘 하루를 열심히 살아가는 따뜻한 사람이라고 생각해.",
      after: "어려운 일도 차근차근 계획을 세워 해내는 든든한 사람이야.",
    },
  };

  const outFile = path.join(outDir, `${replayId}.json`);
  await fs.writeFile(outFile, JSON.stringify(record, null, 2), "utf8");
  console.log(`Replay recorded successfully to: ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
