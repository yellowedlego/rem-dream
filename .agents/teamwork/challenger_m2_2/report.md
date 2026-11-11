# Challenger 2 Empirical Verification Report: Milestone 2 (Debug Telemetry & Metrics)

**Target Milestone**: Milestone 2 — Debug Telemetry & Metrics (Stage 6)  
**Evaluator**: Challenger 2 (Empirical Challenger)  
**Date**: 2026-11-11  
**Verdict**: **APPROVE**  

---

## 1. Executive Summary

Milestone 2 implements the debug telemetry and operational metrics API endpoints:
- `GET /api/debug/calls`
- `GET /api/debug/metrics`

As the empirical challenger, I independently authored an adversarial test harness (`tests/challenger-m2-2.spec.ts`) consisting of 13 rigorous stress scenarios targeting edge cases, boundary conditions, legacy compatibility, divide-by-zero protections, and NaN safety. I also executed the official project build and automated Playwright test suite (`tests/api-debug.spec.ts`).

### Overall Verdict: **APPROVE**
- **Production Build**: `npm run build` compiled successfully without errors (exit code 0).
- **Official Test Suite**: `tests/api-debug.spec.ts` achieved 10/10 passing tests (exit code 0).
- **Adversarial Stress Suite**: `tests/challenger-m2-2.spec.ts` achieved 13/13 passing tests (exit code 0).
- **Total Tests Passed**: 23/23 tests passed.
- **ESLint**: 0 errors, 0 warnings across all route handlers and test specs.

---

## 2. Empirical Verification Results by Dimension

### Dimension 1: Empty Store & Missing Collections
- **Scenario 1.1 (`store.calls = []`)**: When `store.calls` is an empty array, `GET /api/debug/calls` returns an empty JSON array `[]` (HTTP 200). `GET /api/debug/metrics` returns `callsCount: 0`, `averageLatencyMs: 0`, `totalTokens: 0`, and `errorCount: 0`. No `NaN` or `Infinity` was produced.
- **Scenario 1.2 (`store.calls = null`)**: When `store.calls` is explicitly set to `null` in the persistent store, `store.calls ?? []` gracefully resolves to `[]`. `GET /api/debug/calls` returns `[]` and `GET /api/debug/metrics` returns all zeros without throwing runtime exceptions.
- **Scenario 1.3 (`store.calls = undefined`)**: When the `calls` key is completely absent from the JSON store, both endpoints handle the missing property seamlessly.
- **Scenario 1.4 (All collections deleted)**: When `store.nodes`, `store.insights`, `store.proposals`, `store.runs`, and `store.calls` are all undefined or deleted, optional chaining (`store.nodes?.length ?? 0`) prevents null dereference errors, cleanly returning 0 for all counts.

### Dimension 2: Missing, Null & Legacy Token Fields (NaN Safety)
- **Scenario 2.1 (Explicit `null` tokens)**: When model calls record `inputTokens: null`, `outputTokens: null`, and `ms: null`, the type guards `typeof c.inputTokens === "number"` evaluate to `false` (since `typeof null === "object"`). The accumulator strictly returns `0` rather than `NaN` (`0 + null === 0` in JS coercion, but explicit typing avoids coercion entirely). `Number.isNaN(metrics.totalTokens)` was empirically confirmed to be `false`.
- **Scenario 2.2 (Legacy schema compatibility)**: Calls stored with legacy field names (`promptTokens`, `completionTokens`, `durationMs`, `success`) are properly mapped and summed through the `LegacyCallFields` interface. `totalPromptTokens` and `totalCompletionTokens` alias fields provide backward compatibility.
- **Scenario 2.3 (Error aggregation without double counting)**:
  - Modern error string (`c.error = "Network timeout"`) -> counted as 1 error.
  - Legacy failure (`legacy.success = false`) -> counted as 1 error.
  - Both error indicators present simultaneously (`c.error = "Rate limit"` AND `legacy.success = false`) -> counted as exactly 1 error due to short-circuit boolean evaluation `Boolean(c.error) || legacy.success === false`.
  - Empty string error (`c.error = ""`) and successful calls (`c.error = null`, `legacy.success = true`) -> correctly counted as 0 errors.

### Dimension 3: Latency Rounding (`Math.round`) & Precision
- **Scenario 3.1 (Divide-by-zero protection)**: When `callsCount === 0`, `callsCount === 0 ? 0 : Math.round(totalDurationMs / callsCount)` directly evaluates to `0`. `Number.isFinite(metrics.averageLatencyMs)` is `true`.
- **Scenario 3.2 (Rounding up 0.5)**: With latencies `[10, 11]` (sum 21, count 2, mean 10.5), `Math.round(10.5)` produces integer `11`.
- **Scenario 3.3 (Rounding down 0.33)**: With latencies `[10, 10, 11]` (sum 31, count 3, mean 10.333...), `Math.round(10.333...)` produces integer `10`.
- **Scenario 3.4 (Zero latency)**: When calls record `ms: 0`, the mean computes to `0` cleanly.

### Dimension 4: Call Buffer Slicing & Overflow (200 Cap)
- **Scenario 4.1 (Buffer capping)**: Injected 250 model call records (`id: 1` through `id: 250`) into the persistent store. `GET /api/debug/calls` returned exactly 200 records, sliced as the latest chronologically (`calls[0].id === 51` through `calls[199].id === 250`).
- **Scenario 4.2 (Metrics over full store)**: `GET /api/debug/metrics` accurately reflected `callsCount: 250`.

### Dimension 5: High Concurrency & Interleaved Traffic
- **Scenario 5.1 (Parallel queries)**: Dispatched 20 concurrent HTTP requests interleaving `/api/debug/calls` and `/api/debug/metrics`. All 20 requests returned HTTP 200 with identical consistent data.
- **Scenario 5.2 (Interleaved chat and metrics)**: Repeated chat requests and verified monotonic non-decreasing `callsCount` without race conditions.

---

## 3. Empirical Test Suite Execution

### 1. Production Build
```powershell
$env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH;
Set-Location C:\Users\User\.gemini\antigravity\scratch\rem-dream;
npm run build
```
**Result**: Build succeeded with exit code 0. Generated dynamic routes:
- `ƒ /api/debug/calls`
- `ƒ /api/debug/metrics`

### 2. Official Stage 6 Playwright Suite (`tests/api-debug.spec.ts`)
```powershell
$env:MODEL_MOCK="1"; npx playwright test tests/api-debug.spec.ts
```
**Result**:
```
Running 10 tests using 1 worker
  ok  1 Tier 1: GET /api/debug/calls returns list of recent model invocations (119ms)
  ok  2 Tier 1: GET /api/debug/metrics returns complete operational metrics (41ms)
  ok  3 Tier 1: POST /api/debug/reset-all executes factory reset and returns ok: true (44ms)
  ok  4 Tier 2: Divide-by-zero protection: averageLatencyMs returns 0 when callsCount is 0 (28ms)
  ok  5 Tier 2: Metric token consistency: totalTokens equals totalInputTokens + totalOutputTokens (17ms)
  ok  6 Tier 2: POST /api/debug/reset-all is idempotent and succeeds across multiple calls (43ms)
  ok  7 Tier 2: Model calls buffer is pruned and never exceeds 200 items (13ms)
  ok  8 Tier 3: Chat interactions immediately increment callsCount (44ms)
  ok  9 Tier 3: Factory reset cleans dynamic state and restores initial seed configuration (70ms)
  ok 10 Tier 4: Exhibition daily closing maintenance and operational health check (33ms)

10 passed (1.2s)
```

### 3. Adversarial Stress Suite (`tests/challenger-m2-2.spec.ts`)
```powershell
$env:MODEL_MOCK="1"; npx playwright test tests/challenger-m2-2.spec.ts
```
**Result**:
```
Running 13 tests using 1 worker
  ok  1 Dimension 1: store.calls is empty array (229ms)
  ok  2 Dimension 1: store.calls is null (245ms)
  ok  3 Dimension 1: store.calls is undefined (228ms)
  ok  4 Dimension 1: all entity collections missing or undefined (240ms)
  ok  5 Dimension 2: calls with explicit null token fields produce zero sums and no NaN (244ms)
  ok  6 Dimension 2: legacy call fields correctly aggregated (237ms)
  ok  7 Dimension 2: errorCount combines error strings and success: false (222ms)
  ok  8 Dimension 3: Math.round rounds 0.5 up correctly (232ms)
  ok  9 Dimension 3: Math.round rounds 0.33 down correctly (242ms)
  ok 10 Dimension 3: zero latency handled cleanly (218ms)
  ok 11 Dimension 4: calls buffer slices latest 200 records (245ms)
  ok 12 Dimension 5: 20 parallel requests succeed without race errors (106ms)
  ok 13 Dimension 5: Interleaved chat creation and metrics read shows monotonicity (106ms)

13 passed (3.9s)
```

### 4. Code Quality & Linting
```powershell
npx eslint src/app/api/debug/calls/route.ts src/app/api/debug/metrics/route.ts tests/challenger-m2-2.spec.ts
```
**Result**: 0 errors, 0 warnings.

---

## 4. Conclusion & Final Verdict

The Milestone 2 implementation of `/api/debug/calls` and `/api/debug/metrics` meets all architectural specifications, boundary conditions, and performance criteria. It exhibits zero NaN regressions, resilient divide-by-zero handling, robust buffer capping, and clean dynamic execution in Next.js 16.

**Final Challenger 2 Verdict**: **APPROVE**
