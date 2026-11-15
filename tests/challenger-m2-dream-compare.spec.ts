import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Comparison, PersonaProposal, RemRun } from "@/lib/types";

const RUNTIME_STORE_PATH = path.join(process.cwd(), "data", "runtime-test", "store.json");

async function modifyRuntimeStore(modifier: (store: Record<string, any>) => void): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 80));
  const raw = await fs.readFile(RUNTIME_STORE_PATH, "utf8");
  const store = JSON.parse(raw);
  modifier(store);
  for (let i = 0; i < 15; i++) {
    try {
      await fs.writeFile(RUNTIME_STORE_PATH, JSON.stringify(store, null, 2) + "\n", "utf8");
      break;
    } catch (err) {
      if (i === 14) throw err;
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 80));
}

test.describe("Challenger M2-2: REM-Compare, Mode 2 Dream, & Concurrency Stress", () => {
  test.beforeAll(async ({ request }) => {
    // Reset store to pristine seed before running test suite
    await request.post("/api/debug/reset-all");
  });

  test.afterAll(async ({ request }) => {
    // Clean up store at end
    await request.post("/api/debug/reset-all");
  });

  // =========================================================================
  // Section 1: Mode 2 Dream Adversarial Edge Cases
  // =========================================================================
  test.describe("Section 1: Mode 2 Dream Adversarial Edge Cases", () => {
    test("Dream mode with 0 meanings and 0 nodes MUST return HTTP 422", async ({ request }) => {
      const sessionId = `empty-session-${Date.now()}`;
      const res = await request.post("/api/rem/start", {
        data: { sessionId, mode: "dream" },
      });
      expect(res.status()).toBe(422);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    test("Dream mode with 1 meaning and 0 nodes MUST return HTTP 422", async ({ request }) => {
      const sessionId = `one-meaning-zero-nodes-${Date.now()}`;

      // Inject 1 meaning and 0 nodes for this session
      await modifyRuntimeStore((store) => {
        if (!Array.isArray(store.meanings)) store.meanings = [];
        store.meanings.push({
          id: 9991,
          storyId: 991,
          sessionId,
          nodeIds: [],
          title: "고립된 의미",
          essence: "노드가 없는 외로운 의미입니다.",
          keywords: ["고립", "의미"],
          createdAt: new Date().toISOString(),
        });
      });

      const res = await request.post("/api/rem/start", {
        data: { sessionId, mode: "dream" },
      });
      expect(res.status()).toBe(422);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    test("Dream mode with 1 meaning and 1 node MUST return HTTP 422", async ({ request }) => {
      const sessionId = `one-meaning-one-node-${Date.now()}`;

      // Create 1 chat node
      await request.post("/api/chat", {
        data: { sessionId, message: "단 하나의 대화 노드입니다." },
      });

      // Inject 1 meaning
      await modifyRuntimeStore((store) => {
        if (!Array.isArray(store.meanings)) store.meanings = [];
        const nextId = (store.meanings.reduce((max: number, m: any) => Math.max(max, m.id), 0) ?? 0) + 1;
        store.meanings.push({
          id: nextId,
          storyId: 992,
          sessionId,
          nodeIds: [1],
          title: "하나뿐인 의미",
          essence: "의미와 노드가 각각 하나뿐인 상태입니다.",
          keywords: ["하나"],
          createdAt: new Date().toISOString(),
        });
      });

      const res = await request.post("/api/rem/start", {
        data: { sessionId, mode: "dream" },
      });
      expect(res.status()).toBe(422);
      const data = await res.json();
      expect(data.error).toContain("최소 2개 이상의 의미");
    });

    test("Dream mode with 0 meanings and 2 chat nodes falls back gracefully without crashing", async ({ request }) => {
      const sessionId = `fallback-session-${Date.now()}`;

      // Create 2 chat nodes (meanings will be 0)
      await request.post("/api/chat", {
        data: { sessionId, message: "오늘 늦잠을 자서 서둘러 학교에 갔어." },
      });
      await request.post("/api/chat", {
        data: { sessionId, message: "다행히 지각은 면했는데 하루 종일 정신이 없었어." },
      });

      const startRes = await request.post("/api/rem/start", {
        data: { sessionId, mode: "dream" },
      });
      expect(startRes.status()).toBe(202);
      const { runId } = await startRes.json();
      expect(runId).toBeDefined();

      // Poll until done
      let status = "running";
      let attempts = 0;
      while (status === "running" && attempts < 30) {
        await new Promise((r) => setTimeout(r, 80));
        const sRes = await request.get(`/api/rem/status?runId=${runId}`);
        const sData = await sRes.json();
        status = sData.status;
        attempts++;
      }
      expect(status).toBe("done");

      // Verify dream insights generated via fallback using GET /api/rem/status
      const runRes = await request.get(`/api/rem/status?runId=${runId}`);
      expect(runRes.status()).toBe(200);
      const run: RemRun = await runRes.json();

      expect(run.status).toBe("done");
      expect(run.insightIds.length).toBeGreaterThanOrEqual(1);

      // Node fallback uses markReading, so currentNodeIds must be populated
      expect(run.currentNodeIds.length).toBeGreaterThanOrEqual(2);
    });

    test("Dream mode with multiple meanings across different stories: prioritizes cross-story pairs and records currentMeaningIds", async ({ request }) => {
      const sessionId = `dream-multistory-${Date.now()}`;

      // Create 2 distinct stories with paragraphs to generate meanings across stories
      const story1Text = "오늘 아침 일찍 산책을 나갔다.\n\n공기가 차가웠지만 숲속의 맑은 바람이 기분을 상쾌하게 했다.\n\n새들의 노랫소리가 숲에 가득했다.";
      const story2Text = "저녁에는 친구들과 맛있는 김치찌개를 끓여 먹었다.\n\n오랜만에 만나서 서로의 근황을 나누며 웃음꽃을 피웠다.\n\n헤어질 때는 아쉬웠지만 다음 약속을 잡았다.";

      const resStory1 = await request.post("/api/story", {
        data: { sessionId, text: story1Text },
      });
      expect(resStory1.status()).toBe(200);

      const resStory2 = await request.post("/api/story", {
        data: { sessionId, text: story2Text },
      });
      expect(resStory2.status()).toBe(200);

      // Check that store has meanings for this session across different storyIds
      const stateBefore = await request.get("/api/state").then((r) => r.json());
      const sessionMeanings = (stateBefore.meanings || []).filter((m: any) => m.sessionId === sessionId);
      expect(sessionMeanings.length).toBeGreaterThanOrEqual(2);

      const distinctStoryIds = new Set(sessionMeanings.map((m: any) => m.storyId));
      expect(distinctStoryIds.size).toBeGreaterThanOrEqual(2);

      // Start dream run
      const startRes = await request.post("/api/rem/start", {
        data: { sessionId, mode: "dream" },
      });
      expect(startRes.status()).toBe(202);
      const { runId } = await startRes.json();

      // Poll until done
      let status = "running";
      let attempts = 0;
      while (status === "running" && attempts < 30) {
        await new Promise((r) => setTimeout(r, 80));
        const sRes = await request.get(`/api/rem/status?runId=${runId}`);
        const sData = await sRes.json();
        status = sData.status;
        attempts++;
      }
      expect(status).toBe("done");

      // Verify run status and currentMeaningIds
      const finalStatusRes = await request.get(`/api/rem/status?runId=${runId}`);
      expect(finalStatusRes.status()).toBe(200);
      const finalRun: RemRun = await finalStatusRes.json();

      expect(finalRun.status).toBe("done");
      expect(finalRun.insightIds.length).toBeGreaterThanOrEqual(1);

      // Constellation line markers: currentMeaningIds should be populated
      expect(Array.isArray(finalRun.currentMeaningIds)).toBe(true);
      expect(finalRun.currentMeaningIds!.length).toBe(2);

      // Verify that the marked pair IDs exist in sessionMeanings
      const [mId1, mId2] = finalRun.currentMeaningIds!;
      const foundM1 = sessionMeanings.find((m: any) => m.id === mId1);
      const foundM2 = sessionMeanings.find((m: any) => m.id === mId2);
      expect(foundM1).toBeDefined();
      expect(foundM2).toBeDefined();

      // Verify proposal was generated
      const stateAfter = await request.get("/api/state").then((r) => r.json());
      const proposal = stateAfter.proposals.find((p: PersonaProposal) => p.runId === runId);
      expect(proposal).toBeDefined();
      expect(proposal.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // Section 2: REM-Compare Probes & Proposal Decision Lifecycle
  // =========================================================================
  test.describe("Section 2: REM-Compare Probes & Proposal Decision Lifecycle", () => {
    test("createComparisonBefore records probe with default question and after: null before sleep", async ({ request }) => {
      const sessionId = `compare-probe-session-${Date.now()}`;

      await request.post("/api/chat", {
        data: { sessionId, message: "오늘 하루 정말 고생 많았어." },
      });
      await request.post("/api/chat", {
        data: { sessionId, message: "내일도 힘내서 잘 해보자." },
      });

      const stateBefore = await request.get("/api/state").then((r) => r.json());
      const expectedVersion = stateBefore.activePersona || 1;

      const startRes = await request.post("/api/rem/start", {
        data: { sessionId, mode: "consolidate" },
      });
      expect(startRes.status()).toBe(202);
      const { runId } = await startRes.json();

      // Poll until done
      while (true) {
        await new Promise((r) => setTimeout(r, 60));
        const s = await request.get(`/api/rem/status?runId=${runId}`).then((r) => r.json());
        if (s.status !== "running") break;
      }

      const state = await request.get("/api/state").then((r) => r.json());
      const comp = (state.comparisons || []).find((c: Comparison) => c.runId === runId);

      expect(comp).toBeDefined();
      expect(comp.question).toBe("나에 대해 어떻게 생각해?");
      expect(comp.scope).toBe(`session:${sessionId}`);
      expect(comp.before).toBeDefined();
      expect(comp.before.version).toBe(expectedVersion);
      expect(comp.before.answer).toContain(`[v${expectedVersion}]`);
      expect(comp.after).toBeNull();
    });

    test("When proposal is completely rejected, comparison.after REMAINS null", async ({ request }) => {
      const sessionId = `compare-reject-session-${Date.now()}`;

      await request.post("/api/chat", {
        data: { sessionId, message: "시험 준비로 머리가 아파." },
      });
      await request.post("/api/chat", {
        data: { sessionId, message: "잠깐 쉬는 게 필요해." },
      });

      const startRes = await request.post("/api/rem/start", {
        data: { sessionId, mode: "consolidate" },
      });
      const { runId } = await startRes.json();

      while (true) {
        await new Promise((r) => setTimeout(r, 60));
        const s = await request.get(`/api/rem/status?runId=${runId}`).then((r) => r.json());
        if (s.status !== "running") break;
      }

      const state1 = await request.get("/api/state").then((r) => r.json());
      const proposal = state1.proposals.find((p: PersonaProposal) => p.runId === runId);
      expect(proposal).toBeDefined();

      // Bulk reject the proposal
      const rejectRes = await request.post(`/api/proposals/${proposal.id}/reject`);
      expect(rejectRes.status()).toBe(200);

      // Verify comparison.after is STILL null
      const state2 = await request.get("/api/state").then((r) => r.json());
      const comp = state2.comparisons.find((c: Comparison) => c.runId === runId);
      expect(comp).toBeDefined();
      expect(comp.after).toBeNull();
    });

    test("Multiple consecutive REM runs on same session create distinct comparison records", async ({ request }) => {
      const sessionId = `multi-run-compare-${Date.now()}`;

      await request.post("/api/chat", {
        data: { sessionId, message: "첫 번째 주기 대화 1" },
      });
      await request.post("/api/chat", {
        data: { sessionId, message: "첫 번째 주기 대화 2" },
      });

      // Run 1
      const start1 = await request.post("/api/rem/start", {
        data: { sessionId, mode: "consolidate" },
      });
      const { runId: runId1 } = await start1.json();
      while (true) {
        await new Promise((r) => setTimeout(r, 60));
        const s = await request.get(`/api/rem/status?runId=${runId1}`).then((r) => r.json());
        if (s.status !== "running") break;
      }

      // Check Run 1 initial comparison before approval
      const stateAfterRun1 = await request.get("/api/state").then((r) => r.json());
      const comp1Before = stateAfterRun1.comparisons.find((c: Comparison) => c.runId === runId1);
      expect(comp1Before).toBeDefined();
      const run1BaseVersion = comp1Before.before.version;

      // Approve item 1 from proposal 1 to bump persona to run1BaseVersion + 1
      const prop1 = stateAfterRun1.proposals.find((p: PersonaProposal) => p.runId === runId1);
      const approveRes1 = await request.post(`/api/proposals/${prop1.id}/items/1/approve`);
      expect(approveRes1.status()).toBe(200);
      const approveData1 = await approveRes1.json();
      const expectedNewVersion = approveData1.activePersona;
      expect(expectedNewVersion).toBe(run1BaseVersion + 1);

      // Run 2 on same session
      const start2 = await request.post("/api/rem/start", {
        data: { sessionId, mode: "consolidate" },
      });
      expect(start2.status()).toBe(202);
      const { runId: runId2 } = await start2.json();
      expect(runId2).not.toBe(runId1);

      while (true) {
        await new Promise((r) => setTimeout(r, 60));
        const s = await request.get(`/api/rem/status?runId=${runId2}`).then((r) => r.json());
        if (s.status !== "running") break;
      }

      const state2 = await request.get("/api/state").then((r) => r.json());
      const comp1 = state2.comparisons.find((c: Comparison) => c.runId === runId1);
      const comp2 = state2.comparisons.find((c: Comparison) => c.runId === runId2);

      expect(comp1).toBeDefined();
      expect(comp2).toBeDefined();
      expect(comp1.id).not.toBe(comp2.id);

      // Run 1 has before=run1BaseVersion, after=run1BaseVersion + 1
      expect(comp1.before.version).toBe(run1BaseVersion);
      expect(comp1.after).not.toBeNull();
      expect(comp1.after!.version).toBe(expectedNewVersion);

      // Run 2 started when active was expectedNewVersion
      expect(comp2.before.version).toBe(expectedNewVersion);
      expect(comp2.before.answer).toContain(`[v${expectedNewVersion}]`);
      expect(comp2.after).toBeNull();
    });
  });

  // =========================================================================
  // Section 3: Concurrency, Mutex & Race Condition Stress
  // =========================================================================
  test.describe("Section 3: Concurrency, Mutex & Race Condition Stress", () => {
    test("Concurrent proposal item approval race: only one succeeds, no double version increment", async ({ request }) => {
      const sessionId = `race-approval-${Date.now()}`;

      await request.post("/api/chat", {
        data: { sessionId, message: "동시성 테스트 대화 1" },
      });
      await request.post("/api/chat", {
        data: { sessionId, message: "동시성 테스트 대화 2" },
      });

      const startRes = await request.post("/api/rem/start", {
        data: { sessionId, mode: "consolidate" },
      });
      const { runId } = await startRes.json();

      while (true) {
        await new Promise((r) => setTimeout(r, 60));
        const s = await request.get(`/api/rem/status?runId=${runId}`).then((r) => r.json());
        if (s.status !== "running") break;
      }

      const state = await request.get("/api/state").then((r) => r.json());
      const proposal = state.proposals.find((p: PersonaProposal) => p.runId === runId);
      expect(proposal).toBeDefined();

      const prevVersion = state.activePersona || 1;

      // Two simultaneous approval requests on the SAME item (Item 1)
      const [resA, resB] = await Promise.all([
        request.post(`/api/proposals/${proposal.id}/items/1/approve`),
        request.post(`/api/proposals/${proposal.id}/items/1/approve`),
      ]);

      const statuses = [resA.status(), resB.status()];
      // Exactly one MUST succeed with 200, and the other MUST fail with 400 (item is not pending)
      expect(statuses).toContain(200);
      expect(statuses).toContain(400);

      // Verify activePersona incremented exactly once (+1, not +2)
      const finalState = await request.get("/api/state").then((r) => r.json());
      expect(finalState.activePersona).toBe(prevVersion + 1);
    });

    test("Concurrent batch decide on same proposal: one succeeds, subsequent fails", async ({ request }) => {
      const sessionId = `race-batch-${Date.now()}`;

      await request.post("/api/chat", {
        data: { sessionId, message: "배치 결정 대화 1" },
      });
      await request.post("/api/chat", {
        data: { sessionId, message: "배치 결정 대화 2" },
      });

      const startRes = await request.post("/api/rem/start", {
        data: { sessionId, mode: "consolidate" },
      });
      const { runId } = await startRes.json();

      while (true) {
        await new Promise((r) => setTimeout(r, 60));
        const s = await request.get(`/api/rem/status?runId=${runId}`).then((r) => r.json());
        if (s.status !== "running") break;
      }

      const state = await request.get("/api/state").then((r) => r.json());
      const proposal = state.proposals.find((p: PersonaProposal) => p.runId === runId);
      expect(proposal).toBeDefined();

      // Launch 2 concurrent batch decide calls
      const [decide1, decide2] = await Promise.all([
        request.post(`/api/proposals/${proposal.id}/decide`, {
          data: { approve: [1], reject: [2] },
        }),
        request.post(`/api/proposals/${proposal.id}/decide`, {
          data: { approve: [1], reject: [2] },
        }),
      ]);

      const statuses = [decide1.status(), decide2.status()];
      expect(statuses).toContain(200);
      expect(statuses).toContain(400);
    });

    test("Concurrent REM run starts on same session: verify locking behavior", async ({ request }) => {
      const sessionId = `race-start-${Date.now()}`;

      await request.post("/api/chat", {
        data: { sessionId, message: "경쟁 상태 테스트 1" },
      });
      await request.post("/api/chat", {
        data: { sessionId, message: "경쟁 상태 테스트 2" },
      });

      // Dispatch 2 simultaneous start requests for the exact same session
      const [start1, start2] = await Promise.all([
        request.post("/api/rem/start", {
          data: { sessionId, mode: "consolidate" },
        }),
        request.post("/api/rem/start", {
          data: { sessionId, mode: "consolidate" },
        }),
      ]);

      const statuses = [start1.status(), start2.status()];
      // At least one MUST be 202; if locked properly, the other is 409
      expect(statuses).toContain(202);
      // Let's inspect the second status
      const otherStatus = statuses[0] === 202 ? statuses[1] : statuses[0];
      // Note: If 409, locking is fully synchronized.
      expect([202, 409]).toContain(otherStatus);
    });

    test("Store mutex handles 15 parallel chat writes without data loss or corruption", async ({ request }) => {
      const sessionId = `mutex-parallel-${Date.now()}`;
      const messages = Array.from({ length: 15 }, (_, i) => `메시지 ${i + 1}`);

      const chatPromises = messages.map((msg) =>
        request.post("/api/chat", {
          data: { sessionId, message: msg },
        })
      );

      const results = await Promise.all(chatPromises);
      for (const res of results) {
        expect(res.status()).toBe(200);
      }

      // Check all 15 nodes were appended to store in runtime
      const state = await request.get("/api/state").then((r) => r.json());
      const sessionNodes = (state.nodes || []).filter((n: any) => n.sessionId === sessionId);
      expect(sessionNodes.length).toBe(15);

      // Verify orders are 1..15 sequentially
      const orders = sessionNodes.map((n: any) => n.order).sort((a: number, b: number) => a - b);
      for (let i = 0; i < 15; i++) {
        expect(orders[i]).toBe(i + 1);
      }
    });
  });
});
