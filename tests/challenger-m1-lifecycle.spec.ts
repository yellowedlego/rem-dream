import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { RemRun, Store } from "../src/lib/types";

const RUNTIME_STORE_PATH = path.join(process.cwd(), "data", "runtime-test", "store.json");

function makeSessionId(prefix = "challenger-rem"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function getRuntimeStore(): Promise<Store> {
  const raw = await fs.readFile(RUNTIME_STORE_PATH, "utf8");
  return JSON.parse(raw) as Store;
}

async function waitForRunCompletion(
  request: import("@playwright/test").APIRequestContext,
  runId: string,
  timeoutMs = 15000,
  intervalMs = 50
): Promise<RemRun> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await request.get(`/api/rem/status?runId=${runId}`);
    if (res.status() === 200) {
      const run: RemRun = await res.json();
      if (run.status !== "running") {
        return run;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for REM run ${runId} to finish within ${timeoutMs}ms`);
}

test.describe("Challenger M1 Core: Lifecycle, Abort Signal, Concurrency Lock & Node Cap", () => {
  test.beforeEach(async ({ request }) => {
    const resetRes = await request.post("/api/debug/reset-all");
    expect(resetRes.status()).toBe(200);
  });

  // =========================================================================
  // 1. REM Lifecycle & Abort Signal Handling
  // =========================================================================
  test.describe("1. REM Lifecycle & Abort Signal", () => {
    test("starts run in 'running' status and completes to 'done' with valid timestamps and proposal", async ({ request }) => {
      const sessionId = makeSessionId("life-done");

      // Seed 3 nodes
      for (let i = 1; i <= 3; i++) {
        await request.post("/api/chat", {
          data: { sessionId, message: `기억 축적 대화 ${i}: 시험 공부 중` },
        });
      }

      const startRes = await request.post("/api/rem/start", {
        data: { sessionId, mode: "consolidate" },
      });
      expect(startRes.status()).toBe(202);
      const { runId } = await startRes.json();
      expect(typeof runId).toBe("string");

      const finalRun = await waitForRunCompletion(request, runId);
      expect(finalRun.status).toBe("done");
      expect(finalRun.startedAt).toBeTruthy();
      expect(finalRun.finishedAt).toBeTruthy();
      expect(Date.parse(finalRun.finishedAt!)).toBeGreaterThanOrEqual(Date.parse(finalRun.startedAt));
      expect(finalRun.insightIds.length).toBeGreaterThan(0);
      expect(finalRun.proposalId).toBeGreaterThan(0);
      expect(finalRun.error).toBeNull();
    });

    test("POST /api/rem/stop aborts in-flight run transitioning it to 'stopped'", async ({ request }) => {
      const sessionId = makeSessionId("life-abort");

      // Seed 12 nodes so run takes several sequential ticks
      for (let i = 1; i <= 12; i++) {
        await request.post("/api/chat", {
          data: { sessionId, message: `긴 대화 노드 ${i}: 다양한 시험 과제 이야기` },
        });
      }

      const startRes = await request.post("/api/rem/start", {
        data: { sessionId, mode: "consolidate" },
      });
      expect(startRes.status()).toBe(202);
      const { runId } = await startRes.json();

      // Immediately send stop request
      const stopRes = await request.post("/api/rem/stop", {
        data: { runId },
      });
      expect(stopRes.status()).toBe(200);
      const stopBody = await stopRes.json();
      expect(stopBody.ok).toBe(true);

      const finalRun = await waitForRunCompletion(request, runId);
      expect(finalRun.status).toBe("stopped");
      expect(finalRun.finishedAt).toBeTruthy();
    });
  });

  // =========================================================================
  // 2. Concurrency Locking & Isolation
  // =========================================================================
  test.describe("2. Concurrency Locking & Session Isolation", () => {
    test("POST /api/chat returns 409 while REM is active and unlocks when done", async ({ request }) => {
      const sessionId = makeSessionId("lock-test");

      for (let i = 1; i <= 8; i++) {
        await request.post("/api/chat", {
          data: { sessionId, message: `락 검증 대화 노드 ${i}` },
        });
      }

      const startRes = await request.post("/api/rem/start", {
        data: { sessionId, mode: "consolidate" },
      });
      expect(startRes.status()).toBe(202);
      const { runId } = await startRes.json();

      // Send concurrent chat requests during run
      const chatAttempts = await Promise.all([
        request.post("/api/chat", { data: { sessionId, message: "동시 입력 1" } }),
        request.post("/api/chat", { data: { sessionId, message: "동시 입력 2" } }),
        request.post("/api/chat", { data: { sessionId, message: "동시 입력 3" } }),
      ]);

      // At least one or all during active run should receive 409
      const statuses = chatAttempts.map((r) => r.status());
      const has409 = statuses.some((s) => s === 409);
      expect(has409).toBe(true);

      // Wait for run completion
      await waitForRunCompletion(request, runId);

      // Verify chat is unlocked immediately after run completion
      const afterChat = await request.post("/api/chat", {
        data: { sessionId, message: "완료 후 정상 입력" },
      });
      expect(afterChat.status()).toBe(200);
      const afterBody = await afterChat.json();
      expect(afterBody.node.user).toBe("완료 후 정상 입력");
    });

    test("session A running REM does not block chat in session B", async ({ request }) => {
      const sessionA = makeSessionId("lock-sessA");
      const sessionB = makeSessionId("lock-sessB");

      for (let i = 1; i <= 8; i++) {
        await request.post("/api/chat", { data: { sessionId: sessionA, message: `A 대화 ${i}` } });
      }
      await request.post("/api/chat", { data: { sessionId: sessionB, message: "B 초기 대화" } });

      const startRes = await request.post("/api/rem/start", {
        data: { sessionId: sessionA, mode: "consolidate" },
      });
      expect(startRes.status()).toBe(202);
      const { runId } = await startRes.json();

      // Session B must NOT be blocked
      const resB = await request.post("/api/chat", {
        data: { sessionId: sessionB, message: "B는 막히지 않아야 함" },
      });
      expect(resB.status()).toBe(200);

      await waitForRunCompletion(request, runId);
    });
  });

  // =========================================================================
  // 3. Node Cap Enforcement (<= 12 nodes when session has 20+ nodes)
  // =========================================================================
  test.describe("3. Node Cap Enforcement", () => {
    test("processes exactly at most 12 nodes when session has 22 nodes (takes latest 12)", async ({ request }) => {
      const sessionId = makeSessionId("node-cap-22");
      const totalNodes = 22;

      // Seed 22 nodes
      for (let i = 1; i <= totalNodes; i++) {
        await request.post("/api/chat", {
          data: { sessionId, message: `노드 상한 테스트 ${i}` },
        });
      }

      const storeBefore = await getRuntimeStore();
      const sessionNodes = storeBefore.nodes.filter((n) => n.sessionId === sessionId);
      expect(sessionNodes.length).toBe(totalNodes);

      const expectedNodeIds = sessionNodes.slice(-12).map((n) => n.id);

      const startRes = await request.post("/api/rem/start", {
        data: { sessionId, mode: "consolidate" },
      });
      expect(startRes.status()).toBe(202);
      const { runId } = await startRes.json();

      const finalRun = await waitForRunCompletion(request, runId);
      expect(finalRun.status).toBe("done");

      // Verify node cap
      expect(finalRun.currentNodeIds.length).toBe(12);
      // Verify it processed the latest 12 nodes
      expect(finalRun.currentNodeIds).toEqual(expectedNodeIds);
    });
  });

  // =========================================================================
  // 4. Mock Response Resilience (Plain Text and JSON parsing)
  // =========================================================================
  test.describe("4. Mock Response Resilience", () => {
    test("cleanly parses plain text Korean strings into insights without throwing", async ({ request }) => {
      const sessionId = makeSessionId("mock-resilience");

      await request.post("/api/chat", {
        data: { sessionId, message: "오늘 떡볶이와 김치찌개를 맛있게 먹었어." },
      });
      await request.post("/api/chat", {
        data: { sessionId, message: "내일도 친구들과 맛있는 간식 먹으러 가기로 했지." },
      });

      const startRes = await request.post("/api/rem/start", {
        data: { sessionId, mode: "consolidate" },
      });
      expect(startRes.status()).toBe(202);
      const { runId } = await startRes.json();

      const finalRun = await waitForRunCompletion(request, runId);
      expect(finalRun.status).toBe("done");

      const store = await getRuntimeStore();
      const runInsights = store.insights.filter((ins) => finalRun.insightIds.includes(ins.id));
      expect(runInsights.length).toBeGreaterThan(0);

      // Verify all insights have non-empty Korean content and sourceNodeIds
      for (const ins of runInsights) {
        expect(typeof ins.content).toBe("string");
        expect(ins.content.length).toBeGreaterThan(0);
        expect(Array.isArray(ins.sourceNodeIds)).toBe(true);
        expect(ins.sourceNodeIds.length).toBeGreaterThan(0);
      }

      // Verify proposal was generated and parsed correctly
      const proposal = store.proposals.find((p) => p.id === finalRun.proposalId);
      expect(proposal).toBeDefined();
      expect(typeof proposal?.summary).toBe("string");
      expect(typeof proposal?.proposedPrompt).toBe("string");
    });
  });
});
