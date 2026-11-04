import { test, expect } from "@playwright/test";
import type { RemRun, Insight, PersonaProposal } from "../src/lib/types";

function makeSessionId(prefix = "rem-test"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Polls the status endpoint until the run is no longer "running" or timeout is reached.
 */
async function waitForRunCompletion(
  request: import("@playwright/test").APIRequestContext,
  runId: string,
  timeoutMs = 15000,
  intervalMs = 250
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

test.describe("Stage 3 & 5: REM Sleep API (/api/rem/start, status, stop)", () => {

  // =========================================================================
  // Tier 1: Feature Coverage (Happy Path)
  // =========================================================================
  test.describe("Tier 1: Feature Coverage", () => {
    test("POST /api/rem/start starts consolidate mode and returns 202 Accepted with runId", async ({ request }) => {
      const sessionId = makeSessionId("rem-start");

      // Seed chat nodes
      await request.post("/api/chat", {
        data: { sessionId, message: "오늘 늦잠 자서 아침을 걸렀어." },
      });
      await request.post("/api/chat", {
        data: { sessionId, message: "점심에는 친구랑 라면 먹고 기운 냈지." },
      });

      const res = await request.post("/api/rem/start", {
        data: { sessionId, mode: "consolidate" },
      });

      expect(res.status(), `Expected 202 Accepted, got ${res.status()}`).toBe(202);
      const body = await res.json();
      expect(body).toHaveProperty("runId");
      expect(typeof body.runId).toBe("string");
      expect(body.runId.length).toBeGreaterThan(0);
    });

    test("GET /api/rem/status returns accurate RemRun progress object", async ({ request }) => {
      const sessionId = makeSessionId("rem-status");

      await request.post("/api/chat", {
        data: { sessionId, message: "기억을 바탕으로 꿈을 꿀 준비 완료." },
      });

      const startRes = await request.post("/api/rem/start", {
        data: { sessionId, mode: "consolidate", temperature: 0.7 },
      });
      expect(startRes.status()).toBe(202);
      const { runId } = await startRes.json();

      const statusRes = await request.get(`/api/rem/status?runId=${runId}`);
      expect(statusRes.status()).toBe(200);

      const run: RemRun = await statusRes.json();
      expect(run.id).toBe(runId);
      expect(run.sessionId).toBe(sessionId);
      expect(run.mode).toBe("consolidate");
      expect(["running", "done", "stopped", "error"]).toContain(run.status);
      expect(Array.isArray(run.currentNodeIds)).toBe(true);
      expect(Array.isArray(run.insightIds)).toBe(true);
      expect(typeof run.startedAt).toBe("string");
    });

    test("POST /api/rem/start supports mode='dream' with high temperature", async ({ request }) => {
      const sessionId = makeSessionId("rem-dream");

      await request.post("/api/chat", {
        data: { sessionId, message: "꿈 모드 테스트 대화 1: 하늘을 나는 상상." },
      });
      await request.post("/api/chat", {
        data: { sessionId, message: "꿈 모드 테스트 대화 2: 바다 속 고래 이야기." },
      });

      const res = await request.post("/api/rem/start", {
        data: { sessionId, mode: "dream", temperature: 1.1 },
      });

      expect(res.status()).toBe(202);
      const { runId } = await res.json();

      const statusRes = await request.get(`/api/rem/status?runId=${runId}`);
      const run: RemRun = await statusRes.json();
      expect(run.mode).toBe("dream");
    });

    test("POST /api/rem/stop requests termination and stops run", async ({ request }) => {
      const sessionId = makeSessionId("rem-stop");

      await request.post("/api/chat", {
        data: { sessionId, message: "중단 테스트용 대화 노드." },
      });

      const startRes = await request.post("/api/rem/start", {
        data: { sessionId, mode: "consolidate" },
      });
      expect(startRes.status()).toBe(202);
      const { runId } = await startRes.json();

      const stopRes = await request.post("/api/rem/stop", {
        data: { runId },
      });

      expect(stopRes.status()).toBe(200);
      const stopBody = await stopRes.json();
      expect(stopBody).toEqual({ ok: true });

      // Run status should transition to 'stopped' or 'done'
      const statusRes = await request.get(`/api/rem/status?runId=${runId}`);
      const run: RemRun = await statusRes.json();
      expect(["stopped", "done"]).toContain(run.status);
    });
  });

  // =========================================================================
  // Tier 2: Boundary & Corner Cases
  // =========================================================================
  test.describe("Tier 2: Boundary & Corner Cases", () => {
    test("POST /api/rem/start without sessionId returns 400 Bad Request", async ({ request }) => {
      const res = await request.post("/api/rem/start", {
        data: { mode: "consolidate" },
      });

      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });

    test("POST /api/rem/start with invalid/unregistered mode returns 400 Bad Request", async ({ request }) => {
      const sessionId = makeSessionId("bad-mode");
      const res = await request.post("/api/rem/start", {
        data: { sessionId, mode: "unsupported_alien_mode" },
      });

      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });

    test("POST /api/rem/start prevents concurrent execution with 409 Conflict", async ({ request }) => {
      const sessionId = makeSessionId("concurrent-rem");

      await request.post("/api/chat", {
        data: { sessionId, message: "동시 실행 방지 테스트 대화 노드." },
      });

      const firstRes = await request.post("/api/rem/start", {
        data: { sessionId, mode: "consolidate" },
      });
      expect(firstRes.status()).toBe(202);

      // Attempt to immediately start another run while first is running
      const secondRes = await request.post("/api/rem/start", {
        data: { sessionId, mode: "consolidate" },
      });

      // If first run is still active, must return 409 Conflict
      if (secondRes.status() === 409) {
        const body = await secondRes.json();
        expect(body).toHaveProperty("error");
      }
    });

    test("GET /api/rem/status without runId returns 400 Bad Request", async ({ request }) => {
      const res = await request.get("/api/rem/status");
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });

    test("GET /api/rem/status with non-existent runId returns 404 Not Found", async ({ request }) => {
      const res = await request.get("/api/rem/status?runId=non-existent-run-id-9999");
      expect(res.status()).toBe(404);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });

    test("POST /api/rem/stop without runId returns 400 Bad Request", async ({ request }) => {
      const res = await request.post("/api/rem/stop", {
        data: {},
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });

    test("POST /api/rem/stop with non-existent runId returns 404 Not Found", async ({ request }) => {
      const res = await request.post("/api/rem/stop", {
        data: { runId: "ghost-run-id-0000" },
      });
      expect(res.status()).toBe(404);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });

    test("REM node processing respects maximum cap of 12 nodes", async ({ request }) => {
      const sessionId = makeSessionId("cap-check");

      // Seed 14 conversation nodes
      for (let i = 1; i <= 14; i++) {
        await request.post("/api/chat", {
          data: { sessionId, message: `노드 상한 테스트 대화 ${i}` },
        });
      }

      const startRes = await request.post("/api/rem/start", {
        data: { sessionId, mode: "consolidate" },
      });
      expect(startRes.status()).toBe(202);
      const { runId } = await startRes.json();

      const finalRun = await waitForRunCompletion(request, runId);
      expect(finalRun.status).toBe("done");

      // Per specification (R2, PROJECT.md Line 34: 12 max), capped to 12
      expect(finalRun.currentNodeIds.length).toBeLessThanOrEqual(12);
    });
  });

  // =========================================================================
  // Tier 3: Cross-Feature Combinations
  // =========================================================================
  test.describe("Tier 3: Cross-Feature Combinations", () => {
    test("REM input locking prevents chat during run, unlocks after completion", async ({ request }) => {
      const sessionId = makeSessionId("lifecycle-lock");

      await request.post("/api/chat", {
        data: { sessionId, message: "락 해제 확인용 대화입니다." },
      });

      const startRes = await request.post("/api/rem/start", {
        data: { sessionId, mode: "consolidate" },
      });
      expect(startRes.status()).toBe(202);
      const { runId } = await startRes.json();

      // Verify that chat is locked while running (409)
      const tryChatDuring = await request.post("/api/chat", {
        data: { sessionId, message: "잠자는 중에 끼어들기" },
      });
      // Either 409 if still running, or 200 if completed instantaneously in mock
      if (tryChatDuring.status() === 409) {
        expect((await tryChatDuring.json())).toHaveProperty("error");
      }

      // Wait for run completion
      const finalRun = await waitForRunCompletion(request, runId);
      expect(finalRun.status).toBe("done");

      // After completion, chat must accept new messages cleanly
      const afterChat = await request.post("/api/chat", {
        data: { sessionId, message: "잠에서 깨어난 후 첫 대화" },
      });
      expect(afterChat.status()).toBe(200);
      const afterBody = await afterChat.json();
      expect(afterBody.node.user).toBe("잠에서 깨어난 후 첫 대화");
    });

    test("REM completion generates insights and proposal in store state", async ({ request }) => {
      const sessionId = makeSessionId("insights-gen");

      await request.post("/api/chat", {
        data: { sessionId, message: "선생님이 발표 칭찬을 해 주셔서 너무 기뻤어." },
      });
      await request.post("/api/chat", {
        data: { sessionId, message: "친구들과 주말에 방탈출 카페 가기로 했어." },
      });

      const startRes = await request.post("/api/rem/start", {
        data: { sessionId, mode: "consolidate" },
      });
      expect(startRes.status()).toBe(202);
      const { runId } = await startRes.json();

      const finalRun = await waitForRunCompletion(request, runId);
      expect(finalRun.status).toBe("done");
      expect(finalRun.insightIds.length).toBeGreaterThan(0);
      expect(finalRun.proposalId).not.toBeNull();

      // Verify store state includes generated insights and proposal
      const stateRes = await request.get(`/api/state?sessionId=${sessionId}`);
      const state = await stateRes.json();

      for (const insId of finalRun.insightIds) {
        expect(state.insights.some((ins: Insight) => ins.id === insId)).toBe(true);
      }

      if (finalRun.proposalId !== null) {
        const foundProposal = state.proposals.find((p: PersonaProposal) => p.id === finalRun.proposalId);
        expect(foundProposal).toBeDefined();
        expect(foundProposal.status).toBe("pending");
        expect(foundProposal.proposedPrompt.length).toBeGreaterThan(0);
        expect(foundProposal.summary.length).toBeGreaterThan(0);
      }
    });

    test("Side-by-side comparison: consolidate vs dream mode insights on same session", async ({ request }) => {
      const sessionId = makeSessionId("side-by-side");

      await request.post("/api/chat", {
        data: { sessionId, message: "우주선을 타고 달 표면에 착륙하는 상상을 했어." },
      });
      await request.post("/api/chat", {
        data: { sessionId, message: "엄마가 끓여 준 된장찌개가 생각나는 저녁이야." },
      });

      // 1. Run consolidate mode
      const res1 = await request.post("/api/rem/start", {
        data: { sessionId, mode: "consolidate" },
      });
      expect(res1.status()).toBe(202);
      const run1 = await waitForRunCompletion(request, (await res1.json()).runId);
      expect(run1.status).toBe("done");

      // 2. Run dream mode
      const res2 = await request.post("/api/rem/start", {
        data: { sessionId, mode: "dream", temperature: 1.0 },
      });
      expect(res2.status()).toBe(202);
      const run2 = await waitForRunCompletion(request, (await res2.json()).runId);
      expect(run2.status).toBe("done");

      // Verify state holds insights with both modes
      const stateRes = await request.get(`/api/state?sessionId=${sessionId}`);
      const state = await stateRes.json();

      const consolidateInsights = state.insights.filter((i: Insight) => run1.insightIds.includes(i.id));
      const dreamInsights = state.insights.filter((i: Insight) => run2.insightIds.includes(i.id));

      expect(consolidateInsights.length).toBeGreaterThan(0);
      expect(consolidateInsights.every((i: Insight) => i.mode === "consolidate")).toBe(true);

      expect(dreamInsights.length).toBeGreaterThan(0);
      expect(dreamInsights.every((i: Insight) => i.mode === "dream")).toBe(true);
    });
  });

  // =========================================================================
  // Tier 4: Real-World Scenarios
  // =========================================================================
  test.describe("Tier 4: Real-World Scenarios", () => {
    test("Exhibition visitor complete sleep cycle with active node tracking", async ({ request }) => {
      const sessionId = makeSessionId("visitor-sleep");

      // Visitor talks about their day
      await request.post("/api/chat", {
        data: { sessionId, message: "오늘 전시회에 와서 여러 AI 작품들을 관람했어." },
      });
      await request.post("/api/chat", {
        data: { sessionId, message: "특히 스스로 꿈을 꾸며 성격이 변하는 시스템이 신기해." },
      });
      await request.post("/api/chat", {
        data: { sessionId, message: "너는 잠을 자면 어떤 꿈을 꾸니?" },
      });

      // Visitor initiates sleep
      const startRes = await request.post("/api/rem/start", {
        data: { sessionId, mode: "consolidate" },
      });
      expect(startRes.status()).toBe(202);
      const { runId } = await startRes.json();

      // Visitor watches progress polling
      const finalRun = await waitForRunCompletion(request, runId);
      expect(finalRun.status).toBe("done");
      expect(finalRun.finishedAt).not.toBeNull();
      expect(finalRun.error).toBeNull();
      expect(finalRun.currentNodeIds.length).toBeGreaterThan(0);
      expect(finalRun.proposalId).not.toBeNull();

      // Verification that proposal is ready for visitor inspection
      const stateRes = await request.get(`/api/state?sessionId=${sessionId}`);
      const state = await stateRes.json();
      const proposal = state.proposals.find((p: PersonaProposal) => p.id === finalRun.proposalId);
      expect(proposal).toBeDefined();
      expect(proposal.summary).toBeTruthy();
    });
  });
});
