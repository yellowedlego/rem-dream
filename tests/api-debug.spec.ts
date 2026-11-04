import { test, expect } from "@playwright/test";
import type { ModelCall, MemoryNode } from "../src/lib/types";

function makeSessionId(prefix = "debug-test"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Normalizes calls response whether returned directly as ModelCall[] or wrapped in { calls: ModelCall[] }.
 */
function extractCalls(body: unknown): ModelCall[] {
  if (Array.isArray(body)) {
    return body as ModelCall[];
  }
  if (body && typeof body === "object" && "calls" in body && Array.isArray((body as { calls: unknown }).calls)) {
    return (body as { calls: ModelCall[] }).calls;
  }
  return [];
}

test.describe("Stage 6: Debug & Metrics API (/api/debug/*)", () => {

  // =========================================================================
  // Tier 1: Feature Coverage (Happy Path)
  // =========================================================================
  test.describe("Tier 1: Feature Coverage", () => {
    test("GET /api/debug/calls returns list of recent model invocations with valid schema", async ({ request }) => {
      // Trigger a chat to ensure at least one model call exists
      const sessionId = makeSessionId("call-log");
      await request.post("/api/chat", {
        data: { sessionId, message: "디버그 로그 기록 확인용 대화입니다." },
      });

      const res = await request.get("/api/debug/calls");
      expect(res.status(), `Expected 200, got ${res.status()}`).toBe(200);

      const body = await res.json();
      const calls = extractCalls(body);
      expect(Array.isArray(calls)).toBe(true);
      expect(calls.length).toBeGreaterThanOrEqual(1);

      const latestCall = calls[calls.length - 1];
      expect(typeof latestCall.id).toBe("number");
      expect(typeof latestCall.at).toBe("string");
      expect(["chat", "rem-step", "rem-proposal"]).toContain(latestCall.purpose);
      expect(typeof latestCall.model).toBe("string");
      expect(typeof latestCall.temperature).toBe("number");
      expect(typeof latestCall.prompt).toBe("string");
      expect(typeof latestCall.response).toBe("string");
      expect(typeof latestCall.ms).toBe("number");
      expect(latestCall.ms).toBeGreaterThanOrEqual(0);
    });

    test("GET /api/debug/metrics returns complete operational metrics", async ({ request }) => {
      const res = await request.get("/api/debug/metrics");
      expect(res.status()).toBe(200);

      const metrics = await res.json();
      expect(typeof metrics.nodesCount).toBe("number");
      expect(typeof metrics.insightsCount).toBe("number");
      expect(typeof metrics.proposalsCount).toBe("number");
      expect(typeof metrics.runsCount).toBe("number");
      expect(typeof metrics.callsCount).toBe("number");
      expect(typeof metrics.totalInputTokens).toBe("number");
      expect(typeof metrics.totalOutputTokens).toBe("number");
      expect(typeof metrics.totalTokens).toBe("number");
      expect(typeof metrics.averageLatencyMs).toBe("number");
      expect(typeof metrics.errorCount).toBe("number");

      // Verify non-negative numbers
      expect(metrics.nodesCount).toBeGreaterThanOrEqual(0);
      expect(metrics.callsCount).toBeGreaterThanOrEqual(0);
      expect(metrics.totalTokens).toBeGreaterThanOrEqual(0);
      expect(metrics.errorCount).toBeGreaterThanOrEqual(0);
    });

    test("POST /api/debug/reset-all executes factory reset and returns ok: true", async ({ request }) => {
      const res = await request.post("/api/debug/reset-all");
      expect(res.status()).toBe(200);

      const body = await res.json();
      expect(body).toEqual({ ok: true });

      // State should reflect seed data
      const stateRes = await request.get("/api/state");
      expect(stateRes.status()).toBe(200);
      const state = await stateRes.json();
      expect(Array.isArray(state.nodes)).toBe(true);
      expect(state.nodes.length).toBeGreaterThanOrEqual(20); // 20 seed nodes
    });
  });

  // =========================================================================
  // Tier 2: Boundary & Corner Cases
  // =========================================================================
  test.describe("Tier 2: Boundary & Corner Cases", () => {
    test("Divide-by-zero protection: averageLatencyMs returns 0 when callsCount is 0", async ({ request }) => {
      // Perform factory reset to clear dynamic calls
      await request.post("/api/debug/reset-all");

      const res = await request.get("/api/debug/metrics");
      expect(res.status()).toBe(200);

      const metrics = await res.json();
      expect(Number.isFinite(metrics.averageLatencyMs)).toBe(true);
      expect(Number.isNaN(metrics.averageLatencyMs)).toBe(false);

      if (metrics.callsCount === 0) {
        expect(metrics.averageLatencyMs).toBe(0);
      }
    });

    test("Metric token consistency: totalTokens equals totalInputTokens + totalOutputTokens", async ({ request }) => {
      const res = await request.get("/api/debug/metrics");
      const metrics = await res.json();

      expect(metrics.totalTokens).toBe(metrics.totalInputTokens + metrics.totalOutputTokens);
    });

    test("POST /api/debug/reset-all is idempotent and succeeds across multiple consecutive calls", async ({ request }) => {
      const res1 = await request.post("/api/debug/reset-all");
      expect(res1.status()).toBe(200);

      const res2 = await request.post("/api/debug/reset-all");
      expect(res2.status()).toBe(200);

      const res3 = await request.post("/api/debug/reset-all");
      expect(res3.status()).toBe(200);
    });

    test("Model calls buffer is pruned and never exceeds 200 items", async ({ request }) => {
      const res = await request.get("/api/debug/calls");
      expect(res.status()).toBe(200);
      const calls = extractCalls(await res.json());

      // Per specification (PROJECT.md Line 46: up to 200 items in store buffer)
      expect(calls.length).toBeLessThanOrEqual(200);
    });
  });

  // =========================================================================
  // Tier 3: Cross-Feature Combinations
  // =========================================================================
  test.describe("Tier 3: Cross-Feature Combinations", () => {
    test("Chat interactions immediately increment callsCount and record call with purpose='chat'", async ({ request }) => {
      const beforeMetricsRes = await request.get("/api/debug/metrics");
      const beforeMetrics = await beforeMetricsRes.json();

      const sessionId = makeSessionId("metrics-increment");
      const chatMsg = "메트릭 증가 확인용 질문입니다.";
      const chatRes = await request.post("/api/chat", {
        data: { sessionId, message: chatMsg },
      });
      expect(chatRes.status()).toBe(200);

      const afterMetricsRes = await request.get("/api/debug/metrics");
      const afterMetrics = await afterMetricsRes.json();

      expect(afterMetrics.callsCount).toBe(beforeMetrics.callsCount + 1);
      expect(afterMetrics.nodesCount).toBe(beforeMetrics.nodesCount + 1);

      // Verify the recorded call in /api/debug/calls
      const callsRes = await request.get("/api/debug/calls");
      const calls = extractCalls(await callsRes.json());
      const matchingCall = calls.find((c: ModelCall) => c.prompt.includes(chatMsg) || c.purpose === "chat");
      expect(matchingCall).toBeDefined();
      expect(matchingCall!.purpose).toBe("chat");
      expect(matchingCall!.response.length).toBeGreaterThan(0);
    });

    test("Factory reset cleans dynamic state and restores initial seed configuration", async ({ request }) => {
      // 1. Add unique custom node
      const sessionId = makeSessionId("dynamic-dirt");
      await request.post("/api/chat", {
        data: { sessionId, message: "초기화 전 오염용 데이터입니다." },
      });

      // 2. Perform factory reset
      const resetRes = await request.post("/api/debug/reset-all");
      expect(resetRes.status()).toBe(200);

      // 3. Verify custom node is removed
      const stateRes = await request.get(`/api/state?sessionId=${sessionId}`);
      const state = await stateRes.json();
      const residualNodes = state.nodes.filter((n: MemoryNode) => n.sessionId === sessionId);
      expect(residualNodes.length).toBe(0);
    });
  });

  // =========================================================================
  // Tier 4: Real-World Scenarios
  // =========================================================================
  test.describe("Tier 4: Real-World Scenarios", () => {
    test("Exhibition daily closing maintenance and operational health check", async ({ request }) => {
      // Step 1: Administrator fetches operational dashboard metrics
      const metricsRes = await request.get("/api/debug/metrics");
      expect(metricsRes.status()).toBe(200);
      const metrics = await metricsRes.json();

      expect(metrics.errorCount).toBeGreaterThanOrEqual(0);
      expect(metrics.averageLatencyMs).toBeGreaterThanOrEqual(0);

      // Step 2: Administrator inspects recent call logs for model health
      const callsRes = await request.get("/api/debug/calls");
      expect(callsRes.status()).toBe(200);
      const calls = extractCalls(await callsRes.json());
      expect(Array.isArray(calls)).toBe(true);

      // Step 3: Administrator runs reset-all to ready the installation for tomorrow
      const resetRes = await request.post("/api/debug/reset-all");
      expect(resetRes.status()).toBe(200);

      // Step 4: Verify pristine baseline state
      const postStateRes = await request.get("/api/state");
      expect(postStateRes.status()).toBe(200);
      const postState = await postStateRes.json();
      expect(postState.activePersona).toBeGreaterThanOrEqual(1);
    });
  });
});
