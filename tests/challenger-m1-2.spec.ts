import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { generateMockResponse } from "../src/lib/model/mock";
import type { Store } from "../src/lib/types";

const RUNTIME_STORE_PATH = path.join(process.cwd(), "data", "runtime", "store.json");

function makeSessionId(prefix = "challenge"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function modifyRuntimeStore(modifier: (store: Store) => void): Promise<void> {
  // Wait brief tick for any pending server writes to drain
  await new Promise((resolve) => setTimeout(resolve, 100));
  const raw = await fs.readFile(RUNTIME_STORE_PATH, "utf8");
  const store = JSON.parse(raw) as Store;
  modifier(store);
  const targetDir = path.dirname(RUNTIME_STORE_PATH);
  const tmpPath = path.join(targetDir, `store.json.tmp.test.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`);
  await fs.writeFile(tmpPath, JSON.stringify(store, null, 2) + "\n", "utf8");

  let renamed = false;
  let lastErr: unknown = null;
  for (let i = 0; i < 15; i++) {
    try {
      await fs.rename(tmpPath, RUNTIME_STORE_PATH);
      renamed = true;
      break;
    } catch (err) {
      lastErr = err;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  if (!renamed) {
    try { await fs.unlink(tmpPath); } catch {}
    throw new Error(`Failed to atomically rename ${tmpPath} to ${RUNTIME_STORE_PATH}: ${String(lastErr)}`);
  }
  // Brief stabilization pause
  await new Promise((resolve) => setTimeout(resolve, 100));
}

test.describe("Challenger M1-2: Empirical Verification & Stress Harness", () => {
  test.beforeAll(async ({ request }) => {
    // Warm up Next.js server and initialize store so orphan run recovery runs before tests
    const res = await request.get("/api/state");
    expect(res.status()).toBe(200);
  });
  // =========================================================================
  // 1. mock.ts Unit-Level Persona Response Discrimination
  // =========================================================================
  test.describe("mock.ts: Persona Response Discrimination", () => {
    const v1Prompt = "너는 관람객의 하루 이야기를 들어 주는 친절한 대화 상대야. 짧고 따뜻하게 답한다.";
    const v2Prompt = "너는 관람객의 하루 이야기를 들어 주는 친절한 대화 상대야. 짧고 따뜻하게 답한다.\n상대가 급해 보이면 먼저 할 일을 작게 나눠 준다.";
    const v3Prompt = "너는 관람객의 하루 이야기를 들어 주는 친절한 대화 상대야. 짧고 따뜻하게 답한다.\n상대가 급해 보이면 먼저 할 일을 작게 나눠 준다.\n맛있는 음식이나 좋아하는 것을 언급하며 기운을 북돋운다.";

    test("generates distinct deterministic responses for v1, v2, v3 when asked '나에 대해 어떻게 생각해?'", async () => {
      const resV1 = await generateMockResponse({
        prompt: "나에 대해 어떻게 생각해?",
        systemInstruction: v1Prompt,
        purpose: "chat",
      });

      const resV2 = await generateMockResponse({
        prompt: "나에 대해 어떻게 생각해?",
        systemInstruction: v2Prompt,
        purpose: "chat",
      });

      const resV3 = await generateMockResponse({
        prompt: "나에 대해 어떻게 생각해?",
        systemInstruction: v3Prompt,
        purpose: "chat",
      });

      // 1. Verify exact expected texts
      expect(resV1.text).toBe("오늘 하루를 열심히 살아가는 따뜻한 사람이라고 생각해. 이야기 들려줘서 고마워.");
      expect(resV2.text).toBe("목표를 향해 부지런히 달리면서도 가끔은 벅차 보이는 사람이야. 해야 할 일이 많을 땐 우선순위를 정해서 하나씩 작게 나눠 해결해 나가면 좋겠어.");
      expect(resV3.text).toBe("오늘도 많이 애쓴 사람이야. 열심히 하는 것도 좋지만, 좋아하는 맛있는 음식 챙겨 먹으면서 잠시 숨 돌리는 시간도 가졌으면 좋겠어.");

      // 2. Verify all 3 responses are pairwise distinct
      expect(resV1.text).not.toBe(resV2.text);
      expect(resV2.text).not.toBe(resV3.text);
      expect(resV1.text).not.toBe(resV3.text);
    });

    test("handles prompt variations (whitespace, missing punctuation, internal spaces)", async () => {
      const variations = [
        "나에 대해 어떻게 생각해?",
        " 나에 대해 어떻게 생각해? ",
        "나에대해어떻게생각해?",
        "나에 대해 어떻게 생각해",
        "나에  대해   어떻게    생각해?",
        "나에\t대해\n어떻게 생각해?",
      ];

      for (const query of variations) {
        const v1 = await generateMockResponse({
          prompt: query,
          systemInstruction: v1Prompt,
          purpose: "chat",
        });
        const v2 = await generateMockResponse({
          prompt: query,
          systemInstruction: v2Prompt,
          purpose: "chat",
        });
        const v3 = await generateMockResponse({
          prompt: query,
          systemInstruction: v3Prompt,
          purpose: "chat",
        });

        expect(v1.text, `Failed for query: "${query}" on v1`).toBe("오늘 하루를 열심히 살아가는 따뜻한 사람이라고 생각해. 이야기 들려줘서 고마워.");
        expect(v2.text, `Failed for query: "${query}" on v2`).toBe("목표를 향해 부지런히 달리면서도 가끔은 벅차 보이는 사람이야. 해야 할 일이 많을 땐 우선순위를 정해서 하나씩 작게 나눠 해결해 나가면 좋겠어.");
        expect(v3.text, `Failed for query: "${query}" on v3`).toBe("오늘도 많이 애쓴 사람이야. 열심히 하는 것도 좋지만, 좋아하는 맛있는 음식 챙겨 먹으면서 잠시 숨 돌리는 시간도 가졌으면 좋겠어.");
      }
    });
  });

  // =========================================================================
  // 2. Empirical Verification of HTTP 409 Conflict on Active REM Run
  // =========================================================================
  test.describe("HTTP /api/chat: REM 409 Conflict Locking", () => {
    test("POST /api/chat returns HTTP 409 Conflict when a session-specific REM run is 'running'", async ({ request }) => {
      const targetSession = makeSessionId("rem-running-target");
      const runId = `run-${Date.now()}`;

      // Inject a running REM run into runtime store
      await modifyRuntimeStore((store) => {
        if (!store.runs) store.runs = [];
        store.runs.push({
          id: runId,
          sessionId: targetSession,
          mode: "consolidate",
          temperature: 0.7,
          status: "running",
          startedAt: new Date().toISOString(),
          finishedAt: null,
          currentNodeIds: [1],
          insightIds: [],
          proposalId: null,
          error: null,
        });
      });

      try {
        // Attempt chat in the locked session
        const res = await request.post("/api/chat", {
          data: {
            sessionId: targetSession,
            message: "수면 중에 끼어들기 시도",
          },
        });

        expect(res.status()).toBe(409);
        const body = await res.json();
        expect(body).toEqual({ error: "REM is in progress. Input is blocked." });
      } finally {
        // Clean up injected run
        await modifyRuntimeStore((store) => {
          store.runs = store.runs.filter((r) => r.id !== runId);
        });
      }
    });

    test("POST /api/chat returns HTTP 409 Conflict when a global (unscoped) REM run is 'running'", async ({ request }) => {
      const anySession = makeSessionId("any-session");
      const runId = `global-run-${Date.now()}`;

      // Inject a global running run (no sessionId)
      await modifyRuntimeStore((store) => {
        if (!store.runs) store.runs = [];
        store.runs.push({
          id: runId,
          sessionId: undefined as unknown as string,
          mode: "consolidate",
          temperature: 0.7,
          status: "running",
          startedAt: new Date().toISOString(),
          finishedAt: null,
          currentNodeIds: [],
          insightIds: [],
          proposalId: null,
          error: null,
        });
      });

      try {
        const res = await request.post("/api/chat", {
          data: {
            sessionId: anySession,
            message: "글로벌 수면 중 채팅 시도",
          },
        });

        expect(res.status()).toBe(409);
        const body = await res.json();
        expect(body.error).toContain("REM is in progress");
      } finally {
        // Clean up
        await modifyRuntimeStore((store) => {
          store.runs = store.runs.filter((r) => r.id !== runId);
        });
      }
    });

    test("POST /api/chat succeeds (200) for session B when REM is running only in session A", async ({ request }) => {
      const sessionA = makeSessionId("session-A");
      const sessionB = makeSessionId("session-B");
      const runId = `run-session-a-${Date.now()}`;

      // Inject running run in session A
      await modifyRuntimeStore((store) => {
        if (!store.runs) store.runs = [];
        store.runs.push({
          id: runId,
          sessionId: sessionA,
          mode: "consolidate",
          temperature: 0.7,
          status: "running",
          startedAt: new Date().toISOString(),
          finishedAt: null,
          currentNodeIds: [],
          insightIds: [],
          proposalId: null,
          error: null,
        });
      });

      try {
        // Chat in session A should be blocked (409)
        const resA = await request.post("/api/chat", {
          data: { sessionId: sessionA, message: "A 세션 대화" },
        });
        expect(resA.status()).toBe(409);

        // Chat in session B should SUCCEED (200)
        const resB = await request.post("/api/chat", {
          data: { sessionId: sessionB, message: "B 세션은 자유롭게 대화 가능" },
        });
        expect(resB.status()).toBe(200);
        const bodyB = await resB.json();
        expect(bodyB.node.user).toBe("B 세션은 자유롭게 대화 가능");
      } finally {
        // Clean up
        await modifyRuntimeStore((store) => {
          store.runs = store.runs.filter((r) => r.id !== runId);
        });
      }
    });

    test("POST /api/chat succeeds (200) when REM run has completed (status: 'done' or 'error')", async ({ request }) => {
      const completedSession = makeSessionId("rem-done-session");
      const runId = `run-done-${Date.now()}`;

      // Inject finished run
      await modifyRuntimeStore((store) => {
        if (!store.runs) store.runs = [];
        store.runs.push({
          id: runId,
          sessionId: completedSession,
          mode: "consolidate",
          temperature: 0.7,
          status: "done",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          currentNodeIds: [],
          insightIds: [],
          proposalId: null,
          error: null,
        });
      });

      try {
        const res = await request.post("/api/chat", {
          data: { sessionId: completedSession, message: "수면 종료 후 대화" },
        });
        expect(res.status()).toBe(200);
      } finally {
        await modifyRuntimeStore((store) => {
          store.runs = store.runs.filter((r) => r.id !== runId);
        });
      }
    });
  });

  // =========================================================================
  // 3. Empirical Verification of HTTP 400 Rejections
  // =========================================================================
  test.describe("HTTP /api/chat: Input Validation 400 Bad Request", () => {
    test("rejects various invalid sessionId inputs with 400", async ({ request }) => {
      const invalidSessionCases = [
        { data: { message: "msg without sessionId" }, desc: "missing sessionId field" },
        { data: { sessionId: "", message: "msg" }, desc: "empty sessionId" },
        { data: { sessionId: "   \t\n  ", message: "msg" }, desc: "whitespace-only sessionId" },
        { data: { sessionId: null, message: "msg" }, desc: "null sessionId" },
        { data: { sessionId: 12345, message: "msg" }, desc: "numeric sessionId" },
        { data: { sessionId: false, message: "msg" }, desc: "boolean sessionId" },
        { data: { sessionId: {}, message: "msg" }, desc: "object sessionId" },
        { data: { sessionId: ["arr"], message: "msg" }, desc: "array sessionId" },
      ];

      for (const c of invalidSessionCases) {
        const res = await request.post("/api/chat", { data: c.data });
        expect(res.status(), `Case: ${c.desc}`).toBe(400);
        const body = await res.json();
        expect(body).toHaveProperty("error");
      }
    });

    test("rejects various invalid message inputs with 400", async ({ request }) => {
      const validSession = makeSessionId("valid-session");
      const invalidMessageCases = [
        { data: { sessionId: validSession }, desc: "missing message field" },
        { data: { sessionId: validSession, message: "" }, desc: "empty message" },
        { data: { sessionId: validSession, message: "   \t\n\r  " }, desc: "whitespace-only message" },
        { data: { sessionId: validSession, message: null }, desc: "null message" },
        { data: { sessionId: validSession, message: 9999 }, desc: "numeric message" },
        { data: { sessionId: validSession, message: true }, desc: "boolean message" },
        { data: { sessionId: validSession, message: { text: "nested" } }, desc: "object message" },
        { data: { sessionId: validSession, message: ["msg1", "msg2"] }, desc: "array message" },
      ];

      for (const c of invalidMessageCases) {
        const res = await request.post("/api/chat", { data: c.data });
        expect(res.status(), `Case: ${c.desc}`).toBe(400);
        const body = await res.json();
        expect(body).toHaveProperty("error");
      }
    });

    test("rejects malformed payloads with 400", async ({ request }) => {
      // 1. Non-JSON string
      const res1 = await request.post("/api/chat", {
        data: "plain text string, not json",
        headers: { "Content-Type": "application/json" },
      });
      expect(res1.status()).toBe(400);

      // 2. Empty raw body
      const res2 = await request.post("/api/chat", {
        data: "",
        headers: { "Content-Type": "application/json" },
      });
      expect(res2.status()).toBe(400);

      // 3. Non-object primitive JSON (e.g. number 123)
      const res3 = await request.post("/api/chat", {
        data: 12345,
        headers: { "Content-Type": "application/json" },
      });
      expect(res3.status()).toBe(400);

      // 4. JSON array without fields
      const res4 = await request.post("/api/chat", {
        data: [{ sessionId: "test", message: "hi" }],
      });
      expect(res4.status()).toBe(400);
    });
  });

  // =========================================================================
  // 4. End-to-End Persona Verification through live HTTP /api/chat
  // =========================================================================
  test.describe("HTTP /api/chat: Live Active Persona Verification", () => {
    test("returns matching persona responses through /api/chat as activePersona changes", async ({ request }) => {
      const sessionId = makeSessionId("e2e-persona");

      // Record initial activePersona
      const rawStore = await fs.readFile(RUNTIME_STORE_PATH, "utf8");
      const initialStore = JSON.parse(rawStore) as Store;
      const initialActivePersona = initialStore.activePersona;

      try {
        // --- 1. Test Persona v1 ---
        await modifyRuntimeStore((store) => {
          store.activePersona = 1;
        });

        const resV1 = await request.post("/api/chat", {
          data: {
            sessionId,
            message: "나에 대해 어떻게 생각해?",
          },
        });
        expect(resV1.status()).toBe(200);
        const bodyV1 = await resV1.json();
        expect(bodyV1.node.ai).toBe("오늘 하루를 열심히 살아가는 따뜻한 사람이라고 생각해. 이야기 들려줘서 고마워.");

        // --- 2. Test Persona v2 ---
        await modifyRuntimeStore((store) => {
          store.activePersona = 2;
        });

        const resV2 = await request.post("/api/chat", {
          data: {
            sessionId,
            message: "나에 대해 어떻게 생각해?",
          },
        });
        expect(resV2.status()).toBe(200);
        const bodyV2 = await resV2.json();
        expect(bodyV2.node.ai).toBe("목표를 향해 부지런히 달리면서도 가끔은 벅차 보이는 사람이야. 해야 할 일이 많을 땐 우선순위를 정해서 하나씩 작게 나눠 해결해 나가면 좋겠어.");

        // --- 3. Test Persona v3 ---
        // Ensure persona version 3 exists in store
        await modifyRuntimeStore((store) => {
          let p3 = store.personas.find((p) => p.version === 3);
          if (!p3) {
            p3 = {
              version: 3,
              systemPrompt: "너는 관람객의 하루 이야기를 들어 주는 친절한 대화 상대야. 짧고 따뜻하게 답한다.\n상대가 급해 보이면 먼저 할 일을 작게 나눠 준다.\n맛있는 음식이나 좋아하는 것을 언급하며 기운을 북돋운다.",
              sourceInsightIds: [1, 3],
              approvedAt: new Date().toISOString(),
              parentVersion: 2,
            };
            store.personas.push(p3);
          }
          store.activePersona = 3;
        });

        const resV3 = await request.post("/api/chat", {
          data: {
            sessionId,
            message: "나에 대해 어떻게 생각해?",
          },
        });
        expect(resV3.status()).toBe(200);
        const bodyV3 = await resV3.json();
        expect(bodyV3.node.ai).toBe("오늘도 많이 애쓴 사람이야. 열심히 하는 것도 좋지만, 좋아하는 맛있는 음식 챙겨 먹으면서 잠시 숨 돌리는 시간도 가졌으면 좋겠어.");

        // Verify distinctness of HTTP responses
        expect(bodyV1.node.ai).not.toBe(bodyV2.node.ai);
        expect(bodyV2.node.ai).not.toBe(bodyV3.node.ai);
        expect(bodyV1.node.ai).not.toBe(bodyV3.node.ai);
      } finally {
        // Restore initial store state
        await modifyRuntimeStore((store) => {
          store.activePersona = initialActivePersona;
          store.personas = store.personas.filter((p) => p.version <= 2);
        });
      }
    });
  });

  // =========================================================================
  // 5. Concurrency & Stress Harness
  // =========================================================================
  test.describe("Concurrency Stress: Multiple Simultaneous Chat Requests", () => {
    test("handles 10 simultaneous chat requests without order collisions or data corruption", async ({ request }) => {
      const sessionId = makeSessionId("stress-concurrent");
      const concurrency = 10;

      // Dispatch 10 concurrent requests at the exact same instant
      const promises = Array.from({ length: concurrency }, (_, i) =>
        request.post("/api/chat", {
          data: {
            sessionId,
            message: `동시성 스트레스 테스트 메시지 #${i + 1}`,
          },
        })
      );

      const responses = await Promise.all(promises);

      // Verify all 10 completed with 200 OK
      for (let i = 0; i < concurrency; i++) {
        expect(responses[i].status(), `Request #${i + 1} did not return 200`).toBe(200);
      }

      // Collect returned nodes
      const nodes = await Promise.all(responses.map((r) => r.json().then((b) => b.node)));

      // Verify unique IDs
      const ids = nodes.map((n) => n.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size, "Found duplicate IDs among concurrent requests").toBe(concurrency);

      // Verify sequential orders without gaps or collisions (1 through 10)
      const orders = nodes.map((n) => n.order).sort((a, b) => a - b);
      expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      // Verify state endpoint returns all 10 nodes
      const stateRes = await request.get(`/api/state?sessionId=${sessionId}`);
      expect(stateRes.status()).toBe(200);
      const stateBody = await stateRes.json();
      const sessionNodes = stateBody.nodes.filter((n: { sessionId: string }) => n.sessionId === sessionId);
      expect(sessionNodes.length).toBe(concurrency);
    });
  });
});

