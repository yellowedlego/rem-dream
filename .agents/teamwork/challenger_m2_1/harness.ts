import { promises as fs } from "node:fs";
import path from "node:path";

// Mock server-only so we can import server modules in test runner
require.cache[require.resolve("server-only")] = { exports: {} };

// Mock next/server connection() to simulate dynamic request context
const nextServer = require("next/server");
const modNext = {
  ...nextServer,
  connection: async () => {},
};
require.cache[require.resolve("next/server")] = { exports: modNext };

// Set isolated runtime directory for store operations
const TEST_RUNTIME_DIR = path.resolve(process.cwd(), "data", "runtime-challenger");
process.env.REM_RUNTIME_DIR = "data/runtime-challenger";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: Record<string, unknown>;
}

const results: TestResult[] = [];

function assert(condition: boolean, msg: string, details?: Record<string, unknown>) {
  if (!condition) {
    throw new Error(msg + (details ? " - " + JSON.stringify(details) : ""));
  }
}

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`[PASS] ${name}`);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, error: errorMsg });
    console.error(`[FAIL] ${name}: ${errorMsg}`);
  }
}

async function setupCleanStore(initialCalls: any[] = []) {
  await fs.mkdir(TEST_RUNTIME_DIR, { recursive: true });
  const seedPath = path.join(process.cwd(), "data", "store.json");
  const rawSeed = await fs.readFile(seedPath, "utf8");
  const seed = JSON.parse(rawSeed);
  seed.calls = initialCalls;
  const targetPath = path.join(TEST_RUNTIME_DIR, "store.json");
  await fs.writeFile(targetPath, JSON.stringify(seed, null, 2), "utf8");
}

async function main() {
  console.log("=== EMPIRICAL STRESS TEST HARNESS FOR MILESTONE 2 ===");

  const storeModule = require("../../../src/lib/store.ts");
  const metricsRoute = require("../../../src/app/api/debug/metrics/route.ts");
  const callsRoute = require("../../../src/app/api/debug/calls/route.ts");

  // -------------------------------------------------------------------------
  // SUITE 1: Divide-by-zero protection under 0 calls
  // -------------------------------------------------------------------------
  await runTest("Suite 1.1: Divide-by-zero with 0 calls (calls = [])", async () => {
    await setupCleanStore([]);
    const res = await metricsRoute.GET();
    assert(res.status === 200, "Expected status 200");
    const data = await res.json();

    assert(data.callsCount === 0, `Expected callsCount 0, got ${data.callsCount}`);
    assert(data.averageLatencyMs === 0, `Expected averageLatencyMs 0, got ${data.averageLatencyMs}`);
    assert(Number.isFinite(data.averageLatencyMs), "averageLatencyMs is not finite");
    assert(!Number.isNaN(data.averageLatencyMs), "averageLatencyMs is NaN");
    assert(data.totalTokens === 0, `Expected totalTokens 0, got ${data.totalTokens}`);
    assert(data.errorCount === 0, `Expected errorCount 0, got ${data.errorCount}`);
  });

  await runTest("Suite 1.2: Latency averaging with 1 call (callsCount = 1)", async () => {
    await setupCleanStore([
      { id: 1, at: new Date().toISOString(), purpose: "chat", model: "mock", temperature: 0.7, prompt: "hi", response: "hello", inputTokens: 10, outputTokens: 20, ms: 145, error: null }
    ]);
    const res = await metricsRoute.GET();
    assert(res.status === 200, "Expected status 200");
    const data = await res.json();

    assert(data.callsCount === 1, `Expected callsCount 1, got ${data.callsCount}`);
    assert(data.averageLatencyMs === 145, `Expected averageLatencyMs 145, got ${data.averageLatencyMs}`);
    assert(Number.isFinite(data.averageLatencyMs), "averageLatencyMs is not finite");
    assert(!Number.isNaN(data.averageLatencyMs), "averageLatencyMs is NaN");
  });

  await runTest("Suite 1.3: Latency averaging with ms = 0 across calls", async () => {
    await setupCleanStore([
      { id: 1, at: new Date().toISOString(), purpose: "chat", model: "mock", temperature: 0.7, prompt: "1", response: "1", ms: 0, error: null },
      { id: 2, at: new Date().toISOString(), purpose: "chat", model: "mock", temperature: 0.7, prompt: "2", response: "2", ms: 0, error: null }
    ]);
    const res = await metricsRoute.GET();
    const data = await res.json();
    assert(data.callsCount === 2, `Expected callsCount 2, got ${data.callsCount}`);
    assert(data.averageLatencyMs === 0, `Expected averageLatencyMs 0, got ${data.averageLatencyMs}`);
    assert(Number.isFinite(data.averageLatencyMs), "averageLatencyMs is not finite");
    assert(!Number.isNaN(data.averageLatencyMs), "averageLatencyMs is NaN");
  });

  // -------------------------------------------------------------------------
  // SUITE 2: Token Invariant Checks (totalTokens === totalInputTokens + totalOutputTokens)
  // -------------------------------------------------------------------------
  await runTest("Suite 2.1: Token invariant with 0 calls", async () => {
    await setupCleanStore([]);
    const res = await metricsRoute.GET();
    const data = await res.json();
    assert(data.totalTokens === data.totalInputTokens + data.totalOutputTokens, "Token invariant failed for 0 calls", data);
    assert(data.totalPromptTokens === data.totalInputTokens, "Alias totalPromptTokens mismatch");
    assert(data.totalCompletionTokens === data.totalOutputTokens, "Alias totalCompletionTokens mismatch");
  });

  await runTest("Suite 2.2: Token invariant with 1 call (standard fields)", async () => {
    await setupCleanStore([
      { id: 1, at: new Date().toISOString(), purpose: "chat", model: "mock", temperature: 0.7, prompt: "a", response: "b", inputTokens: 125, outputTokens: 85, ms: 50, error: null }
    ]);
    const res = await metricsRoute.GET();
    const data = await res.json();
    assert(data.totalInputTokens === 125, `Expected 125 input tokens, got ${data.totalInputTokens}`);
    assert(data.totalOutputTokens === 85, `Expected 85 output tokens, got ${data.totalOutputTokens}`);
    assert(data.totalTokens === 210, `Expected 210 total tokens, got ${data.totalTokens}`);
    assert(data.totalTokens === data.totalInputTokens + data.totalOutputTokens, "Token invariant failed");
  });

  await runTest("Suite 2.3: Token invariant with 1 call (legacy promptTokens / completionTokens)", async () => {
    await setupCleanStore([
      { id: 1, at: new Date().toISOString(), purpose: "chat", model: "mock", temperature: 0.7, prompt: "a", response: "b", promptTokens: 300, completionTokens: 450, ms: 50, error: null }
    ]);
    const res = await metricsRoute.GET();
    const data = await res.json();
    assert(data.totalInputTokens === 300, `Expected 300 input tokens, got ${data.totalInputTokens}`);
    assert(data.totalOutputTokens === 450, `Expected 450 output tokens, got ${data.totalOutputTokens}`);
    assert(data.totalTokens === 750, `Expected 750 total tokens, got ${data.totalTokens}`);
    assert(data.totalTokens === data.totalInputTokens + data.totalOutputTokens, "Token invariant failed");
  });

  await runTest("Suite 2.4: Token invariant with 10 mixed calls (standard, legacy, null, undefined)", async () => {
    const calls = [];
    let expectedIn = 0;
    let expectedOut = 0;
    for (let i = 1; i <= 10; i++) {
      if (i % 3 === 0) {
        // legacy
        const pt = i * 10;
        const ct = i * 5;
        expectedIn += pt;
        expectedOut += ct;
        calls.push({ id: i, at: new Date().toISOString(), purpose: "chat", model: "mock", promptTokens: pt, completionTokens: ct, ms: 10, error: null });
      } else if (i % 3 === 1) {
        // standard
        const it = i * 20;
        const ot = i * 15;
        expectedIn += it;
        expectedOut += ot;
        calls.push({ id: i, at: new Date().toISOString(), purpose: "chat", model: "mock", inputTokens: it, outputTokens: ot, ms: 10, error: null });
      } else {
        // null / undefined tokens
        calls.push({ id: i, at: new Date().toISOString(), purpose: "chat", model: "mock", inputTokens: null, outputTokens: null, ms: 10, error: null });
      }
    }
    await setupCleanStore(calls);
    const res = await metricsRoute.GET();
    const data = await res.json();
    assert(data.callsCount === 10, `Expected 10 calls, got ${data.callsCount}`);
    assert(data.totalInputTokens === expectedIn, `Expected totalInputTokens ${expectedIn}, got ${data.totalInputTokens}`);
    assert(data.totalOutputTokens === expectedOut, `Expected totalOutputTokens ${expectedOut}, got ${data.totalOutputTokens}`);
    assert(data.totalTokens === expectedIn + expectedOut, `Expected totalTokens ${expectedIn + expectedOut}, got ${data.totalTokens}`);
    assert(data.totalTokens === data.totalInputTokens + data.totalOutputTokens, "Token invariant failed for 10 calls");
  });

  await runTest("Suite 2.5: Token invariant across 250 simulated calls (200+ calls)", async () => {
    const calls = [];
    let expectedIn = 0;
    let expectedOut = 0;
    for (let i = 1; i <= 250; i++) {
      const inTok = (i * 7) % 500;
      const outTok = (i * 13) % 300;
      expectedIn += inTok;
      expectedOut += outTok;
      calls.push({
        id: i,
        at: new Date().toISOString(),
        purpose: "chat",
        model: "mock",
        temperature: 0.7,
        prompt: `prompt ${i}`,
        response: `response ${i}`,
        inputTokens: inTok,
        outputTokens: outTok,
        ms: 50 + (i % 100),
        error: null,
      });
    }
    await setupCleanStore(calls);
    const res = await metricsRoute.GET();
    const data = await res.json();
    assert(data.callsCount === 250, `Expected 250 callsCount, got ${data.callsCount}`);
    assert(data.totalInputTokens === expectedIn, `Input token mismatch: expected ${expectedIn}, got ${data.totalInputTokens}`);
    assert(data.totalOutputTokens === expectedOut, `Output token mismatch: expected ${expectedOut}, got ${data.totalOutputTokens}`);
    assert(data.totalTokens === expectedIn + expectedOut, `Total token mismatch: expected ${expectedIn + expectedOut}, got ${data.totalTokens}`);
    assert(data.totalTokens === data.totalInputTokens + data.totalOutputTokens, "Token invariant failed for 250 calls");
  });

  // -------------------------------------------------------------------------
  // SUITE 3: Ring buffer ceiling and rapid insertions
  // -------------------------------------------------------------------------
  await runTest("Suite 3.1: Sequential rapid insertions (250 calls via addModelCall)", async () => {
    await setupCleanStore([]);
    for (let i = 1; i <= 250; i++) {
      await storeModule.addModelCall({
        purpose: "chat",
        runId: null,
        model: "mock",
        temperature: 0.7,
        prompt: `p-${i}`,
        response: `r-${i}`,
        inputTokens: 10,
        outputTokens: 10,
        ms: 20,
        error: null,
      });
    }

    const store = await storeModule.readStore();
    assert(store.calls.length === 200, `Expected store.calls.length to be capped at 200, got ${store.calls.length}`);
    assert(store.calls.length <= 200, "Store calls exceeded 200 items!");

    // Check FIFO pruning: first item in store should have prompt "p-51" and id 51
    const firstCall = store.calls[0];
    const lastCall = store.calls[store.calls.length - 1];
    assert(firstCall.prompt === "p-51", `Expected oldest retained prompt to be p-51, got ${firstCall.prompt}`);
    assert(firstCall.id === 51, `Expected oldest retained id to be 51, got ${firstCall.id}`);
    assert(lastCall.prompt === "p-250", `Expected newest prompt to be p-250, got ${lastCall.prompt}`);
    assert(lastCall.id === 250, `Expected newest id to be 250, got ${lastCall.id}`);
  });

  await runTest("Suite 3.2: Concurrent rapid insertions (50 concurrent addModelCall)", async () => {
    // Current store already has 200 items. Insert 50 concurrently:
    const promises = [];
    for (let i = 1; i <= 50; i++) {
      promises.push(
        storeModule.addModelCall({
          purpose: "rem-step",
          runId: "concurrent-run",
          model: "mock",
          temperature: 0.4,
          prompt: `concurrent-p-${i}`,
          response: `concurrent-r-${i}`,
          inputTokens: 5,
          outputTokens: 5,
          ms: 15,
          error: null,
        })
      );
    }
    await Promise.all(promises);

    const store = await storeModule.readStore();
    assert(store.calls.length === 200, `Expected store.calls.length to stay at 200 after concurrency, got ${store.calls.length}`);
  });

  await runTest("Suite 3.3: GET /api/debug/calls enforces slice(-200) ceiling", async () => {
    // Manually force a store with 250 items to test defensive endpoint slice
    const rawCalls = [];
    for (let i = 1; i <= 250; i++) {
      rawCalls.push({
        id: i,
        at: new Date().toISOString(),
        purpose: "chat",
        model: "mock",
        temperature: 0.7,
        prompt: `prompt-${i}`,
        response: `response-${i}`,
        inputTokens: 1,
        outputTokens: 1,
        ms: 10,
        error: null,
      });
    }
    await setupCleanStore(rawCalls);

    const res = await callsRoute.GET();
    assert(res.status === 200, "Expected status 200");
    const calls = await res.json();
    assert(Array.isArray(calls), "Expected array of calls");
    assert(calls.length === 200, `Expected exactly 200 calls returned, got ${calls.length}`);
    assert(calls[0].id === 51, `Expected first call id 51, got ${calls[0].id}`);
    assert(calls[calls.length - 1].id === 250, `Expected last call id 250, got ${calls[calls.length - 1].id}`);
  });

  // -------------------------------------------------------------------------
  // SUITE 4: Error count tracking
  // -------------------------------------------------------------------------
  await runTest("Suite 4.1: Error count detection across various error formats", async () => {
    const testCalls = [
      // 1: Normal successful call
      { id: 1, at: new Date().toISOString(), purpose: "chat", model: "mock", temperature: 0.7, prompt: "1", response: "1", ms: 10, error: null },
      // 2: Explicit error string
      { id: 2, at: new Date().toISOString(), purpose: "chat", model: "mock", temperature: 0.7, prompt: "2", response: "", ms: 10, error: "Rate limit exceeded" },
      // 3: Legacy success === false
      { id: 3, at: new Date().toISOString(), purpose: "chat", model: "mock", temperature: 0.7, prompt: "3", response: "", ms: 10, error: null, success: false },
      // 4: Both error string and success: false (must NOT be double counted!)
      { id: 4, at: new Date().toISOString(), purpose: "chat", model: "mock", temperature: 0.7, prompt: "4", response: "", ms: 10, error: "Connection reset", success: false },
      // 5: Legacy success === true
      { id: 5, at: new Date().toISOString(), purpose: "chat", model: "mock", temperature: 0.7, prompt: "5", response: "ok", ms: 10, error: null, success: true },
      // 6: error is empty string "" (falsy) and success is true
      { id: 6, at: new Date().toISOString(), purpose: "chat", model: "mock", temperature: 0.7, prompt: "6", response: "ok", ms: 10, error: "", success: true },
      // 7: error is non-empty string and success is true (error should take precedence)
      { id: 7, at: new Date().toISOString(), purpose: "chat", model: "mock", temperature: 0.7, prompt: "7", response: "", ms: 10, error: "Upstream 502", success: true },
    ];
    // Expected errors: calls 2, 3, 4, 7 => exactly 4 errors.
    await setupCleanStore(testCalls);
    const res = await metricsRoute.GET();
    const data = await res.json();
    assert(data.callsCount === 7, `Expected 7 calls, got ${data.callsCount}`);
    assert(data.errorCount === 4, `Expected errorCount 4, got ${data.errorCount}`);
  });

  await runTest("Suite 4.2: Fuzzing 500 calls with randomized error distributions", async () => {
    const calls = [];
    let expectedErrors = 0;
    for (let i = 1; i <= 500; i++) {
      const mode = i % 5;
      let errorVal: string | null = null;
      let successVal: boolean | undefined = undefined;

      if (mode === 1) {
        errorVal = `Simulated error ${i}`;
        expectedErrors++;
      } else if (mode === 2) {
        successVal = false;
        expectedErrors++;
      } else if (mode === 3) {
        errorVal = `Simulated combo error ${i}`;
        successVal = false;
        expectedErrors++;
      } else {
        errorVal = null;
        successVal = true;
      }

      calls.push({
        id: i,
        at: new Date().toISOString(),
        purpose: "chat",
        model: "mock",
        temperature: 0.7,
        prompt: `p-${i}`,
        response: `r-${i}`,
        inputTokens: 10,
        outputTokens: 10,
        ms: 20,
        error: errorVal,
        success: successVal,
      });
    }
    await setupCleanStore(calls);
    const res = await metricsRoute.GET();
    const data = await res.json();
    assert(data.callsCount === 500, `Expected 500 calls, got ${data.callsCount}`);
    assert(data.errorCount === expectedErrors, `Expected ${expectedErrors} errors, got ${data.errorCount}`);
  });

  // -------------------------------------------------------------------------
  // SUITE 5: Rounding and Latency calculation checks
  // -------------------------------------------------------------------------
  await runTest("Suite 5.1: Latency rounding check with fractional averages", async () => {
    // 3 calls with latencies 10, 11, 13 -> sum = 34 -> 34 / 3 = 11.333... -> Math.round = 11
    await setupCleanStore([
      { id: 1, at: new Date().toISOString(), purpose: "chat", model: "mock", ms: 10, error: null },
      { id: 2, at: new Date().toISOString(), purpose: "chat", model: "mock", ms: 11, error: null },
      { id: 3, at: new Date().toISOString(), purpose: "chat", model: "mock", ms: 13, error: null },
    ]);
    const res = await metricsRoute.GET();
    const data = await res.json();
    assert(data.averageLatencyMs === 11, `Expected averageLatencyMs 11, got ${data.averageLatencyMs}`);
  });

  await runTest("Suite 5.2: Legacy durationMs latency resolution", async () => {
    // 2 calls with legacy durationMs: 100, 200 -> average 150
    await setupCleanStore([
      { id: 1, at: new Date().toISOString(), purpose: "chat", model: "mock", durationMs: 100, error: null },
      { id: 2, at: new Date().toISOString(), purpose: "chat", model: "mock", durationMs: 200, error: null },
    ]);
    const res = await metricsRoute.GET();
    const data = await res.json();
    assert(data.averageLatencyMs === 150, `Expected averageLatencyMs 150, got ${data.averageLatencyMs}`);
  });

  // Clean up test runtime directory
  try {
    await fs.rm(TEST_RUNTIME_DIR, { recursive: true, force: true });
  } catch {}

  console.log("\n=======================================================");
  console.log(`TOTAL TESTS: ${results.length}`);
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${failedCount}`);
  console.log("=======================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL RUNNER ERROR:", err);
  process.exit(1);
});
