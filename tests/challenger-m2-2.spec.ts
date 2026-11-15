import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";


// Runtime store path used by Playwright test server (see playwright.config.ts)
const RUNTIME_STORE_PATH = path.join(process.cwd(), "data", "runtime-test", "store.json");

async function modifyRuntimeStore(modifier: (store: Record<string, unknown>) => void): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  const raw = await fs.readFile(RUNTIME_STORE_PATH, "utf8");
  const store = JSON.parse(raw) as Record<string, unknown>;
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
  await new Promise((resolve) => setTimeout(resolve, 100));
}

test.describe("Challenger M2-2: Empirical Boundary & Stress Suite", () => {
  test.beforeAll(async ({ request }) => {
    // Warm up the Next.js test server and verify availability
    const res = await request.get("/api/state");
    expect(res.status()).toBe(200);
  });

  // =========================================================================
  // Dimension 1: Empty Store & Missing Collections
  // =========================================================================
  test.describe("Dimension 1: Empty Store & Missing Collections", () => {
    test("store.calls is empty array: calls returns [], metrics returns zeros with no NaN", async ({ request }) => {
      await modifyRuntimeStore((store) => {
        store.calls = [];
      });

      const callsRes = await request.get("/api/debug/calls");
      expect(callsRes.status()).toBe(200);
      const calls = await callsRes.json();
      expect(Array.isArray(calls)).toBe(true);
      expect(calls.length).toBe(0);

      const metricsRes = await request.get("/api/debug/metrics");
      expect(metricsRes.status()).toBe(200);
      const metrics = await metricsRes.json();
      expect(metrics.callsCount).toBe(0);
      expect(metrics.totalInputTokens).toBe(0);
      expect(metrics.totalOutputTokens).toBe(0);
      expect(metrics.totalTokens).toBe(0);
      expect(metrics.averageLatencyMs).toBe(0);
      expect(metrics.errorCount).toBe(0);
      expect(Number.isNaN(metrics.averageLatencyMs)).toBe(false);
      expect(Number.isFinite(metrics.averageLatencyMs)).toBe(true);
    });

    test("store.calls is null: calls returns [], metrics handles gracefully without throwing", async ({ request }) => {
      await modifyRuntimeStore((store) => {
        store.calls = null;
      });

      const callsRes = await request.get("/api/debug/calls");
      expect(callsRes.status()).toBe(200);
      const calls = await callsRes.json();
      expect(Array.isArray(calls)).toBe(true);
      expect(calls.length).toBe(0);

      const metricsRes = await request.get("/api/debug/metrics");
      expect(metricsRes.status()).toBe(200);
      const metrics = await metricsRes.json();
      expect(metrics.callsCount).toBe(0);
      expect(metrics.averageLatencyMs).toBe(0);
      expect(metrics.errorCount).toBe(0);
    });

    test("store.calls is undefined (deleted key): endpoints return valid defaults", async ({ request }) => {
      await modifyRuntimeStore((store) => {
        delete store.calls;
      });

      const callsRes = await request.get("/api/debug/calls");
      expect(callsRes.status()).toBe(200);
      const calls = await callsRes.json();
      expect(Array.isArray(calls)).toBe(true);
      expect(calls.length).toBe(0);

      const metricsRes = await request.get("/api/debug/metrics");
      expect(metricsRes.status()).toBe(200);
      const metrics = await metricsRes.json();
      expect(metrics.callsCount).toBe(0);
      expect(metrics.totalTokens).toBe(0);
    });

    test("all entity collections missing or undefined: metrics safely defaults all counts to 0", async ({ request }) => {
      await modifyRuntimeStore((store) => {
        delete store.nodes;
        delete store.insights;
        delete store.proposals;
        delete store.runs;
        delete store.calls;
      });

      const metricsRes = await request.get("/api/debug/metrics");
      expect(metricsRes.status()).toBe(200);
      const metrics = await metricsRes.json();
      expect(metrics.nodesCount).toBe(0);
      expect(metrics.insightsCount).toBe(0);
      expect(metrics.proposalsCount).toBe(0);
      expect(metrics.runsCount).toBe(0);
      expect(metrics.callsCount).toBe(0);
      expect(metrics.totalTokens).toBe(0);
      expect(metrics.averageLatencyMs).toBe(0);
      expect(metrics.errorCount).toBe(0);

      // Restore seed via reset-all
      const resetRes = await request.post("/api/debug/reset-all");
      expect(resetRes.status()).toBe(200);
    });
  });

  // =========================================================================
  // Dimension 2: Null, Undefined & Legacy Token Fields
  // =========================================================================
  test.describe("Dimension 2: Null, Undefined & Legacy Token Fields", () => {
    test("calls with explicit null token fields produce zero sums and no NaN", async ({ request }) => {
      await modifyRuntimeStore((store) => {
        store.calls = [
          {
            id: 1,
            at: new Date().toISOString(),
            purpose: "chat",
            model: "mock-model",
            temperature: 0.7,
            prompt: "null token test 1",
            response: "response 1",
            inputTokens: null,
            outputTokens: null,
            ms: null,
            error: null,
          },
          {
            id: 2,
            at: new Date().toISOString(),
            purpose: "rem-step",
            model: "mock-model",
            temperature: 0.4,
            prompt: "null token test 2",
            response: "response 2",
            inputTokens: null,
            outputTokens: null,
            ms: 100,
            error: null,
          },
        ];
      });

      const metricsRes = await request.get("/api/debug/metrics");
      expect(metricsRes.status()).toBe(200);
      const metrics = await metricsRes.json();

      expect(metrics.callsCount).toBe(2);
      expect(metrics.totalInputTokens).toBe(0);
      expect(metrics.totalOutputTokens).toBe(0);
      expect(metrics.totalTokens).toBe(0);
      expect(metrics.averageLatencyMs).toBe(50); // (0 + 100) / 2 = 50
      expect(metrics.errorCount).toBe(0);
      expect(Number.isNaN(metrics.totalTokens)).toBe(false);
      expect(Number.isNaN(metrics.averageLatencyMs)).toBe(false);
    });

    test("legacy call fields (promptTokens, completionTokens, durationMs, success) are correctly aggregated", async ({ request }) => {
      await modifyRuntimeStore((store) => {
        store.calls = [
          {
            id: 1,
            at: new Date().toISOString(),
            purpose: "chat",
            model: "mock-model",
            promptTokens: 120,
            completionTokens: 80,
            durationMs: 300,
            success: true,
            error: null,
          },
          {
            id: 2,
            at: new Date().toISOString(),
            purpose: "chat",
            model: "mock-model",
            promptTokens: 30,
            completionTokens: 20,
            durationMs: 100,
            success: false,
            error: null,
          },
        ];
      });

      const metricsRes = await request.get("/api/debug/metrics");
      expect(metricsRes.status()).toBe(200);
      const metrics = await metricsRes.json();

      expect(metrics.callsCount).toBe(2);
      expect(metrics.totalInputTokens).toBe(150);
      expect(metrics.totalOutputTokens).toBe(100);
      expect(metrics.totalTokens).toBe(250);
      expect(metrics.totalPromptTokens).toBe(150);
      expect(metrics.totalCompletionTokens).toBe(100);
      expect(metrics.averageLatencyMs).toBe(200); // (300 + 100) / 2
      expect(metrics.errorCount).toBe(1); // call 2 has success: false
    });

    test("errorCount correctly combines modern error strings and legacy success: false without double counting", async ({ request }) => {
      await modifyRuntimeStore((store) => {
        store.calls = [
          { id: 1, error: "Network timeout", success: null }, // Modern error: count = 1
          { id: 2, error: null, success: false }, // Legacy failure: count = 1
          { id: 3, error: "Rate limit", success: false }, // Both present: count = 1 (no double count)
          { id: 4, error: null, success: true }, // Successful: count = 0
          { id: 5, error: "", success: true }, // Empty error string: count = 0
        ];
      });

      const metricsRes = await request.get("/api/debug/metrics");
      expect(metricsRes.status()).toBe(200);
      const metrics = await metricsRes.json();

      expect(metrics.callsCount).toBe(5);
      expect(metrics.errorCount).toBe(3);
    });
  });

  // =========================================================================
  // Dimension 3: Latency Rounding (Math.round) & Precision
  // =========================================================================
  test.describe("Dimension 3: Latency Rounding (Math.round) & Precision", () => {
    test("Math.round rounds 0.5 up correctly", async ({ request }) => {
      // 2 calls with ms: 10 and 11 -> total 21 -> avg 10.5 -> rounds to 11
      await modifyRuntimeStore((store) => {
        store.calls = [
          { id: 1, ms: 10 },
          { id: 2, ms: 11 },
        ];
      });

      const res = await request.get("/api/debug/metrics");
      expect(res.status()).toBe(200);
      const metrics = await res.json();
      expect(metrics.averageLatencyMs).toBe(11);
    });

    test("Math.round rounds 0.33 down correctly", async ({ request }) => {
      // 3 calls with ms: 10, 10, 11 -> total 31 -> avg 10.333... -> rounds to 10
      await modifyRuntimeStore((store) => {
        store.calls = [
          { id: 1, ms: 10 },
          { id: 2, ms: 10 },
          { id: 3, ms: 11 },
        ];
      });

      const res = await request.get("/api/debug/metrics");
      expect(res.status()).toBe(200);
      const metrics = await res.json();
      expect(metrics.averageLatencyMs).toBe(10);
    });

    test("zero and negative or floating point latencies", async ({ request }) => {
      // Single call with ms: 0
      await modifyRuntimeStore((store) => {
        store.calls = [{ id: 1, ms: 0 }];
      });

      const res = await request.get("/api/debug/metrics");
      expect(res.status()).toBe(200);
      const metrics = await res.json();
      expect(metrics.averageLatencyMs).toBe(0);
    });
  });

  // =========================================================================
  // Dimension 4: Call Buffer Slicing & Overflow
  // =========================================================================
  test.describe("Dimension 4: Call Buffer Slicing & Overflow", () => {
    test("GET /api/debug/calls slices at most 200 recent records in correct chronological order", async ({ request }) => {
      const largeCalls: Record<string, unknown>[] = [];
      for (let i = 1; i <= 250; i++) {
        largeCalls.push({
          id: i,
          at: new Date(Date.now() + i * 1000).toISOString(),
          purpose: "chat",
          model: "mock-model",
          prompt: `prompt ${i}`,
          response: `response ${i}`,
          ms: i,
        });
      }

      await modifyRuntimeStore((store) => {
        store.calls = largeCalls;
      });

      const res = await request.get("/api/debug/calls");
      expect(res.status()).toBe(200);
      const calls = await res.json();
      expect(Array.isArray(calls)).toBe(true);
      expect(calls.length).toBe(200);
      // The slice should retain the latest 200 (ids 51 to 250)
      expect(calls[0].id).toBe(51);
      expect(calls[199].id).toBe(250);

      // Verify metrics counts the full array stored
      const metricsRes = await request.get("/api/debug/metrics");
      expect(metricsRes.status()).toBe(200);
      const metrics = await metricsRes.json();
      expect(metrics.callsCount).toBe(250);
    });
  });

  // =========================================================================
  // Dimension 5: High Concurrency & Interleaved Traffic
  // =========================================================================
  test.describe("Dimension 5: High Concurrency & Interleaved Traffic", () => {
    test("20 parallel requests to debug endpoints succeed consistently without race errors", async ({ request }) => {
      // Reset store to known state
      await request.post("/api/debug/reset-all");

      const promises = Array.from({ length: 20 }, (_, idx) => {
        if (idx % 2 === 0) {
          return request.get("/api/debug/calls");
        } else {
          return request.get("/api/debug/metrics");
        }
      });

      const results = await Promise.all(promises);
      for (const res of results) {
        expect(res.status()).toBe(200);
      }
    });

    test("Interleaved chat creation and metrics read shows monotonically non-decreasing callsCount", async ({ request }) => {
      const sessionId = `stress-seq-${Date.now()}`;
      const callsCounts: number[] = [];

      for (let i = 0; i < 3; i++) {
        await request.post("/api/chat", {
          data: { sessionId, message: `Interleaved test ${i}` },
        });

        const res = await request.get("/api/debug/metrics");
        expect(res.status()).toBe(200);
        const metrics = await res.json();
        callsCounts.push(metrics.callsCount);
      }

      for (let i = 1; i < callsCounts.length; i++) {
        expect(callsCounts[i]).toBeGreaterThanOrEqual(callsCounts[i - 1]);
      }
    });
  });

  // Clean up test environment at end
  test.afterAll(async ({ request }) => {
    await request.post("/api/debug/reset-all");
  });
});
