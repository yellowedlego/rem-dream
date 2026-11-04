import { Suspense } from "react";
import { connection } from "next/server";
import { readStore } from "@/lib/store";
import styles from "./debug.module.css";

export const metadata = { title: "꿈 시스템 · 디버그" };

const timeFmt = new Intl.DateTimeFormat("ko-KR", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
});
const t = (iso: string) => timeFmt.format(new Date(iso));

const MODE_NAME: Record<string, string> = { consolidate: "모드 1 · 정리", dream: "모드 2 · 꿈" };

async function DebugData() {
  await connection();
  const { nodes, insights, personas, activePersona } = await readStore();

  const stats: [string, string][] = [
    ["기억 노드", String(nodes.length)],
    ["통찰", String(insights.length)],
    ["인격 버전", `v${activePersona}`],
    ["평균 응답 시간", "—"],
    ["오늘 쓴 토큰", "—"],
    ["오류", "—"],
  ];

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1>디버그</h1>
        <span className={styles.sub}>/debug · data/store.json (가짜 데이터)</span>
        {/* 조작 버튼은 3단계(REM)부터 동작한다 */}
        <div className={styles.controls}>
          <select disabled aria-label="REM 모드">
            <option>모드 1 · 정리</option>
            <option>모드 2 · 꿈</option>
          </select>
          <button type="button" disabled>REM 시작</button>
          <button type="button" disabled>중단</button>
          <button type="button" disabled>전체 초기화</button>
        </div>
      </header>

      <dl className={styles.stats}>
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      <main className={styles.grid}>
        <section aria-labelledby="nodes-h" className={styles.card}>
          <h2 id="nodes-h">기억 노드 {nodes.length}개</h2>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>세션</th>
                  <th>순서</th>
                  <th>시각</th>
                  <th>유저 입력</th>
                  <th>AI 답변</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((n) => (
                  <tr key={n.id}>
                    <td className={styles.mono}>{n.id}</td>
                    <td className={styles.mono}>{n.sessionId}</td>
                    <td className={styles.mono}>{n.order}</td>
                    <td className={styles.mono}>{t(n.createdAt)}</td>
                    <td>{n.user}</td>
                    <td className={styles.dim}>{n.ai}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className={styles.side}>
          <section aria-labelledby="ins-h" className={styles.card}>
            <h2 id="ins-h">통찰 {insights.length}개</h2>
            <ul className={styles.list}>
              {insights.map((i) => (
                <li key={i.id}>
                  <div className={styles.rowMeta}>
                    <span className={styles.mono}>#{i.id}</span>
                    <span className={styles.tag}>{MODE_NAME[i.mode] ?? i.mode}</span>
                    <span className={styles.mono}>근거 {i.sourceNodeIds.map((x) => `#${x}`).join(" ")}</span>
                  </div>
                  <p>{i.content}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="per-h" className={styles.card}>
            <h2 id="per-h">인격(시스템 프롬프트) 버전</h2>
            <ul className={styles.list}>
              {[...personas].reverse().map((p) => (
                <li key={p.version}>
                  <div className={styles.rowMeta}>
                    <b className={styles.mono}>v{p.version}</b>
                    {p.version === activePersona && <span className={styles.active}>지금 쓰는 중</span>}
                    <span>
                      {p.parentVersion === null
                        ? "처음 인격"
                        : `v${p.parentVersion}에서 · 통찰 ${p.sourceInsightIds.map((x) => `#${x}`).join(" ")} 근거`}
                    </span>
                    <span className={`${styles.mono} ${styles.right}`}>{t(p.approvedAt)}</span>
                  </div>
                  <pre className={styles.prompt}>{p.systemPrompt}</pre>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}

export default function DebugPage() {
  return (
    <Suspense fallback={null}>
      <DebugData />
    </Suspense>
  );
}
