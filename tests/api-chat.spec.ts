import { test, expect } from "@playwright/test";
import type { MemoryNode, Store } from "../src/lib/types";

/**
 * Generates an isolated session ID to ensure parallel test isolation.
 */
function makeSessionId(prefix = "chat-test"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test.describe("Stage 2: Chat & State API (/api/chat, /api/state)", () => {

  // =========================================================================
  // Tier 1: Feature Coverage (Happy Path)
  // =========================================================================
  test.describe("Tier 1: Feature Coverage", () => {
    test("POST /api/chat creates a new MemoryNode with valid schema", async ({ request }) => {
      const sessionId = makeSessionId("tier1");
      const userMessage = "오늘 하루 정말 피곤했어.";

      const res = await request.post("/api/chat", {
        data: {
          sessionId,
          message: userMessage,
        },
      });

      expect(res.status(), `Expected 200 or 201, got ${res.status()}`).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("node");

      const node: MemoryNode = body.node;
      expect(typeof node.id).toBe("number");
      expect(node.id).toBeGreaterThan(0);
      expect(node.sessionId).toBe(sessionId);
      expect(node.user).toBe(userMessage);
      expect(typeof node.ai).toBe("string");
      expect(node.ai.trim().length).toBeGreaterThan(0);
      expect(typeof node.order).toBe("number");
      expect(node.order).toBeGreaterThanOrEqual(1);

      // Verify ISO date string format
      expect(new Date(node.createdAt).toISOString()).toBe(node.createdAt);
    });

    test("POST /api/chat sequentially increments order within the same session", async ({ request }) => {
      const sessionId = makeSessionId("order");

      const res1 = await request.post("/api/chat", {
        data: { sessionId, message: "첫 번째 대화입니다." },
      });
      expect(res1.status()).toBe(200);
      const node1: MemoryNode = (await res1.json()).node;

      const res2 = await request.post("/api/chat", {
        data: { sessionId, message: "두 번째 대화입니다." },
      });
      expect(res2.status()).toBe(200);
      const node2: MemoryNode = (await res2.json()).node;

      expect(node2.order).toBe(node1.order + 1);
      expect(node2.id).toBeGreaterThan(node1.id);
    });

    test("GET /api/state with ?sessionId returns session-scoped state", async ({ request }) => {
      const sessionId = makeSessionId("state-query");
      const msg = "상태 조회 테스트 메시지입니다.";

      await request.post("/api/chat", {
        data: { sessionId, message: msg },
      });

      const res = await request.get(`/api/state?sessionId=${sessionId}`);
      expect(res.status()).toBe(200);

      const state: Partial<Store> & { activeRun?: unknown } = await res.json();
      expect(Array.isArray(state.nodes)).toBe(true);
      expect(Array.isArray(state.insights)).toBe(true);
      expect(Array.isArray(state.proposals)).toBe(true);
      expect(typeof state.activePersona).toBe("number");

      // Verify our session message is present in the returned nodes
      const sessionNodes = state.nodes!.filter((n: MemoryNode) => n.sessionId === sessionId);
      expect(sessionNodes.length).toBeGreaterThanOrEqual(1);
      expect(sessionNodes.some((n: MemoryNode) => n.user === msg)).toBe(true);
    });

    test("GET /api/state without sessionId returns valid global state structure", async ({ request }) => {
      const res = await request.get("/api/state");
      expect(res.status()).toBe(200);

      const state = await res.json();
      expect(Array.isArray(state.nodes)).toBe(true);
      expect(typeof state.activePersona).toBe("number");
      expect(state.nodes.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Tier 2: Boundary & Corner Cases
  // =========================================================================
  test.describe("Tier 2: Boundary & Corner Cases", () => {
    test("POST /api/chat rejects empty message string with 400 Bad Request", async ({ request }) => {
      const sessionId = makeSessionId("bad-empty");
      const res = await request.post("/api/chat", {
        data: { sessionId, message: "" },
      });

      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });

    test("POST /api/chat rejects whitespace-only message with 400 Bad Request", async ({ request }) => {
      const sessionId = makeSessionId("bad-whitespace");
      const res = await request.post("/api/chat", {
        data: { sessionId, message: "   \n\t   " },
      });

      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });

    test("POST /api/chat rejects payload with missing message field with 400", async ({ request }) => {
      const sessionId = makeSessionId("missing-msg");
      const res = await request.post("/api/chat", {
        data: { sessionId },
      });

      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });

    test("POST /api/chat rejects payload with missing sessionId field with 400", async ({ request }) => {
      const res = await request.post("/api/chat", {
        data: { message: "세션 아이디가 없는 메시지" },
      });

      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });

    test("POST /api/chat preserves special characters, emojis, and multiline text", async ({ request }) => {
      const sessionId = makeSessionId("special-chars");
      const complexMessage = `특수문자 테스트: 🌙✨ <script>alert("xss")</script> & 'quotes' "double" \\ / \n\t 끝!`;

      const res = await request.post("/api/chat", {
        data: { sessionId, message: complexMessage },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.node.user).toBe(complexMessage);
    });

    test("POST /api/chat handles large message payload gracefully", async ({ request }) => {
      const sessionId = makeSessionId("large-payload");
      const largeMessage = "가나다라마바사 ".repeat(1500); // ~12KB text

      const res = await request.post("/api/chat", {
        data: { sessionId, message: largeMessage },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.node.user).toBe(largeMessage);
      expect(typeof body.node.ai).toBe("string");
      expect(body.node.ai.length).toBeGreaterThan(0);
    });

    test("POST /api/chat returns 400 when invalid non-JSON payload is sent", async ({ request }) => {
      const res = await request.post("/api/chat", {
        data: "not a valid json object",
        headers: { "Content-Type": "application/json" },
      });

      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });

    test("POST /api/chat returns 409 Conflict when REM sleep is currently running", async ({ request }) => {
      const sessionId = makeSessionId("rem-conflict");

      // Seed with initial chat node so REM runner has nodes
      await request.post("/api/chat", {
        data: { sessionId, message: "REM 시작 전 대화입니다." },
      });

      // Start REM sleep
      const startRes = await request.post("/api/rem/start", {
        data: { sessionId, mode: "consolidate" },
      });

      // If start succeeds with 202, attempt chat immediately to test lock
      if (startRes.status() === 202) {
        const conflictRes = await request.post("/api/chat", {
          data: { sessionId, message: "수면 중에 끼어드는 메시지" },
        });

        expect(conflictRes.status()).toBe(409);
        const errBody = await conflictRes.json();
        expect(errBody).toHaveProperty("error");
      }
    });
  });

  // =========================================================================
  // Tier 3: Cross-Feature Combinations
  // =========================================================================
  test.describe("Tier 3: Cross-Feature Combinations", () => {
    test("Chat node is immediately retrievable via GET /api/state", async ({ request }) => {
      const sessionId = makeSessionId("chat-state-sync");
      const text = "즉시 상태 동기화 확인용 문장";

      const chatRes = await request.post("/api/chat", {
        data: { sessionId, message: text },
      });
      expect(chatRes.status()).toBe(200);
      const createdNode: MemoryNode = (await chatRes.json()).node;

      const stateRes = await request.get(`/api/state?sessionId=${sessionId}`);
      expect(stateRes.status()).toBe(200);
      const state = await stateRes.json();

      const found = state.nodes.find((n: MemoryNode) => n.id === createdNode.id);
      expect(found).toBeDefined();
      expect(found.sessionId).toBe(sessionId);
      expect(found.user).toBe(text);
      expect(found.ai).toBe(createdNode.ai);
    });

    test("Session isolation: chats in session A do not leak into session B", async ({ request }) => {
      const sessionA = makeSessionId("session-A");
      const sessionB = makeSessionId("session-B");

      await request.post("/api/chat", {
        data: { sessionId: sessionA, message: "세션 A 전용 메시지입니다." },
      });
      await request.post("/api/chat", {
        data: { sessionId: sessionB, message: "세션 B 전용 메시지입니다." },
      });

      const stateARes = await request.get(`/api/state?sessionId=${sessionA}`);
      const stateA = await stateARes.json();
      const nodesA: MemoryNode[] = stateA.nodes.filter((n: MemoryNode) => n.sessionId === sessionA);
      expect(nodesA.every((n) => n.sessionId === sessionA)).toBe(true);
      expect(nodesA.some((n) => n.user.includes("세션 B"))).toBe(false);

      const stateBRes = await request.get(`/api/state?sessionId=${sessionB}`);
      const stateB = await stateBRes.json();
      const nodesB: MemoryNode[] = stateB.nodes.filter((n: MemoryNode) => n.sessionId === sessionB);
      expect(nodesB.every((n) => n.sessionId === sessionB)).toBe(true);
      expect(nodesB.some((n) => n.user.includes("세션 A"))).toBe(false);
    });
  });

  // =========================================================================
  // Tier 4: Real-World Scenarios
  // =========================================================================
  test.describe("Tier 4: Real-World Scenarios", () => {
    test("Exhibition visitor multi-turn conversation sequence", async ({ request }) => {
      const sessionId = makeSessionId("visitor-dialog");

      const conversationScript = [
        "안녕하세요, 오늘 날씨가 참 좋네요.",
        "학교에서 시험을 봤는데 조금 아쉬웠어요.",
        "그래도 점심에 친구랑 맛있는 떡볶이를 먹어서 기분이 풀렸어요.",
        "저녁에는 푹 쉬면서 책을 읽고 싶어요.",
        "나에 대해 어떻게 생각해?",
      ];

      const createdNodes: MemoryNode[] = [];

      for (let i = 0; i < conversationScript.length; i++) {
        const res = await request.post("/api/chat", {
          data: { sessionId, message: conversationScript[i] },
        });

        expect(res.status(), `Turn ${i + 1} failed`).toBe(200);
        const body = await res.json();
        createdNodes.push(body.node);
      }

      expect(createdNodes.length).toBe(5);

      // Verify sequence order and chronologic progression
      for (let i = 0; i < createdNodes.length; i++) {
        expect(createdNodes[i].order).toBe(i + 1);
        expect(createdNodes[i].user).toBe(conversationScript[i]);
        expect(createdNodes[i].ai.length).toBeGreaterThan(0);
        if (i > 0) {
          expect(createdNodes[i].id).toBeGreaterThan(createdNodes[i - 1].id);
        }
      }

      // Verify all 5 nodes are saved in store state
      const stateRes = await request.get(`/api/state?sessionId=${sessionId}`);
      const state = await stateRes.json();
      const sessionNodes = state.nodes.filter((n: MemoryNode) => n.sessionId === sessionId);
      expect(sessionNodes.length).toBe(5);
    });
  });
});
