# Milestone 2 Investigation Report: Debug Telemetry & Metrics API

**Author**: Explorer 1 (`explorer_m2_1`)  
**Target Milestone**: Milestone 2: Debug Telemetry & Metrics (Stage 6)  
**Target Specification File**: `tests/api-debug.spec.ts`  
**Related Documents**: `docs/backend-plan.md`, `src/lib/types.ts`, `src/lib/store.ts`, `src/lib/model/client.ts`

---

## Executive Summary

`tests/api-debug.spec.ts` verifies the implementation of Stage 6 debug endpoints: `GET /api/debug/calls`, `GET /api/debug/metrics`, and `POST /api/debug/reset-all`.
Currently:
- `POST /api/debug/reset-all` is already implemented and passing (3 tests passing).
- `GET /api/debug/calls` and `GET /api/debug/metrics` return 404 (7 tests failing).
- The store infrastructure (`store.calls`, `addModelCall`, 200-call ring buffer pruning, `callModel` telemetry recording) is already fully implemented in `src/lib/store.ts` and `src/lib/model/client.ts`.
- The implementation of Milestone 2 requires creating two files:
  1. `src/app/api/debug/calls/route.ts`
  2. `src/app/api/debug/metrics/route.ts`

---

## 1. Test Case Analysis in `tests/api-debug.spec.ts`

The test suite contains 4 test tiers and 10 distinct test cases:

### Tier 1: Feature Coverage (Happy Path)

#### Test 1.1: `GET /api/debug/calls returns list of recent model invocations with valid schema` (Lines 27–52)
- **Data Setup**:
  - Generates a unique session ID via `makeSessionId("call-log")`.
  - Sends a `POST /api/chat` request with `{ sessionId, message: "디버그 로그 기록 확인용 대화입니다." }` to guarantee at least one model call exists in the store.
- **Request**: `GET /api/debug/calls`
- **Assertions**:
  - `res.status() === 200`
  - Normalized via helper `extractCalls(body)` (handles array or `{ calls: [...] }`).
  - `Array.isArray(calls) === true`
  - `calls.length >= 1`
  - Validates `latestCall` schema against `ModelCall`:
    - `typeof latestCall.id === "number"`
    - `typeof latestCall.at === "string"`
    - `["chat", "rem-step", "rem-proposal"].includes(latestCall.purpose)`
    - `typeof latestCall.model === "string"`
    - `typeof latestCall.temperature === "number"`
    - `typeof latestCall.prompt === "string"`
    - `typeof latestCall.response === "string"`
    - `typeof latestCall.ms === "number"`
    - `latestCall.ms >= 0`

#### Test 1.2: `GET /api/debug/metrics returns complete operational metrics` (Lines 54–75)
- **Data Setup**: Relies on current store state.
- **Request**: `GET /api/debug/metrics`
- **Assertions**:
  - `res.status() === 200`
  - Validates all 10 metric fields exist and have type `"number"`:
    - `metrics.nodesCount`: number
    - `metrics.insightsCount`: number
    - `metrics.proposalsCount`: number
    - `metrics.runsCount`: number
    - `metrics.callsCount`: number
    - `metrics.totalInputTokens`: number
    - `metrics.totalOutputTokens`: number
    - `metrics.totalTokens`: number
    - `metrics.averageLatencyMs`: number
    - `metrics.errorCount`: number
  - Non-negative value bounds:
    - `metrics.nodesCount >= 0`
    - `metrics.callsCount >= 0`
    - `metrics.totalTokens >= 0`
    - `metrics.errorCount >= 0`

#### Test 1.3: `POST /api/debug/reset-all executes factory reset and returns ok: true` (Lines 77–90)
- **Status**: Currently passing (already implemented in `src/app/api/debug/reset-all/route.ts`).
- **Request**: `POST /api/debug/reset-all`
- **Assertions**: Status 200, `{ ok: true }`, seed nodes restored (`state.nodes.length >= 20`).

---

### Tier 2: Boundary & Corner Cases

#### Test 2.1: `Divide-by-zero protection: averageLatencyMs returns 0 when callsCount is 0` (Lines 97–111)
- **Data Setup**: Calls `POST /api/debug/reset-all` to clear dynamic calls (seed store has `calls: []`).
- **Request**: `GET /api/debug/metrics`
- **Assertions**:
  - Status 200.
  - `Number.isFinite(metrics.averageLatencyMs) === true`
  - `Number.isNaN(metrics.averageLatencyMs) === false`
  - `if (metrics.callsCount === 0) expect(metrics.averageLatencyMs).toBe(0)`

#### Test 2.2: `Metric token consistency: totalTokens equals totalInputTokens + totalOutputTokens` (Lines 113–118)
- **Request**: `GET /api/debug/metrics`
- **Assertions**:
  - Mathematical identity: `metrics.totalTokens === metrics.totalInputTokens + metrics.totalOutputTokens`
  - Requires `totalInputTokens` and `totalOutputTokens` (note: not `totalPromptTokens` / `totalCompletionTokens`, though providing aliases is recommended).

#### Test 2.3: `POST /api/debug/reset-all is idempotent and succeeds across multiple consecutive calls` (Lines 120–129)
- **Status**: Currently passing.
- **Assertions**: Repeated POST calls return status 200.

#### Test 2.4: `Model calls buffer is pruned and never exceeds 200 items` (Lines 131–138)
- **Request**: `GET /api/debug/calls`
- **Assertions**: Status 200, `calls.length <= 200`.

---

### Tier 3: Cross-Feature Combinations

#### Test 3.1: `Chat interactions immediately increment callsCount and record call with purpose='chat'` (Lines 145–169)
- **Data Setup & Sequence**:
  1. `beforeMetrics = GET /api/debug/metrics`
  2. `POST /api/chat` with `{ sessionId, message: "메트릭 증가 확인용 질문입니다." }`
  3. `afterMetrics = GET /api/debug/metrics`
  4. `calls = GET /api/debug/calls`
- **Assertions**:
  - `afterMetrics.callsCount === beforeMetrics.callsCount + 1`
  - `afterMetrics.nodesCount === beforeMetrics.nodesCount + 1`
  - Record exists in `calls` matching `c.prompt.includes(chatMsg) || c.purpose === "chat"`.
  - `matchingCall.purpose === "chat"`.
  - `matchingCall.response.length > 0`.

#### Test 3.2: `Factory reset cleans dynamic state and restores initial seed configuration` (Lines 171–187)
- **Status**: Currently passing.
- **Assertions**: Verifies custom session nodes are wiped after reset.

---

### Tier 4: Real-World Scenarios

#### Test 4.1: `Exhibition daily closing maintenance and operational health check` (Lines 194–218)
- **Sequence**:
  1. `GET /api/debug/metrics`: verify status 200, `errorCount >= 0`, `averageLatencyMs >= 0`.
  2. `GET /api/debug/calls`: verify status 200, returns array.
  3. `POST /api/debug/reset-all`: verify status 200.
  4. `GET /api/state`: verify status 200, `activePersona >= 1`.

---

## 2. Expected Fields, Types, and Return Formats

### `GET /api/debug/calls`
- **Status**: `200 OK`
- **Body**: JSON Array of `ModelCall` records (`ModelCall[]`).
- **Schema**:
  | Field | Type | Required | Description / Example |
  |---|---|---|---|
  | `id` | `number` | Yes | Unique incremental ID (e.g., 1, 2, 3) |
  | `at` | `string` | Yes | ISO 8601 timestamp string (e.g., `"2026-11-11T06:05:00.000Z"`) |
  | `purpose` | `string` | Yes | ModelPurpose: `"chat"`, `"rem-step"`, `"rem-proposal"`, etc. |
  | `runId` | `string \| null` | Yes | REM run ID if called during REM, otherwise `null` |
  | `model` | `string` | Yes | Model identifier (e.g., `"mock-gemini-2.5-flash"`) |
  | `temperature`| `number` | Yes | Temperature float (e.g., `0.7`, `0.8`) |
  | `prompt` | `string` | Yes | Input prompt |
  | `response` | `string` | Yes | Output text |
  | `inputTokens`| `number \| null` | Yes | Prompt tokens (or null on error) |
  | `outputTokens`| `number \| null` | Yes | Candidate tokens (or null on error) |
  | `ms` | `number` | Yes | Duration in ms (`>= 0`) |
  | `error` | `string \| null` | Yes | Error detail or `null` |

*Note on Helper*: `extractCalls` in `tests/api-debug.spec.ts` accepts either direct array `ModelCall[]` or `{ calls: ModelCall[] }`. Returning `store.calls ?? []` directly as an array is the simplest and adheres strictly to `SCOPE.md` line 15.

---

### `GET /api/debug/metrics`
- **Status**: `200 OK`
- **Body**: JSON Object containing operational and telemetry metrics.
- **Schema**:
  | Field | Type | Value Calculation |
  |---|---|---|
  | `nodesCount` | `number` | `store.nodes.length` |
  | `insightsCount` | `number` | `store.insights.length` |
  | `proposalsCount`| `number` | `store.proposals?.length ?? 0` |
  | `runsCount` | `number` | `store.runs?.length ?? 0` |
  | `callsCount` | `number` | `calls.length` |
  | `totalInputTokens` | `number` | Sum of `c.inputTokens ?? 0` across `calls` |
  | `totalOutputTokens`| `number` | Sum of `c.outputTokens ?? 0` across `calls` |
  | `totalTokens` | `number` | `totalInputTokens + totalOutputTokens` |
  | `averageLatencyMs` | `number` | `callsCount === 0 ? 0 : Math.round(totalDurationMs / callsCount)` |
  | `errorCount` | `number` | Count of calls where `Boolean(c.error)` |

#### Compatibility Recommendation:
In `sub_orch_m2/SCOPE.md`, the fields `totalPromptTokens` and `totalCompletionTokens` were mentioned, while `tests/api-debug.spec.ts` strictly tests `totalInputTokens` and `totalOutputTokens`. To guarantee 100% test pass while satisfying both specifications, the response object should include aliases:
```typescript
{
  nodesCount,
  insightsCount,
  proposalsCount,
  runsCount,
  callsCount,
  totalInputTokens,
  totalOutputTokens,
  totalTokens,
  averageLatencyMs,
  errorCount,
  // Backward compatibility / alias fields
  totalPromptTokens: totalInputTokens,
  totalCompletionTokens: totalOutputTokens,
}
```

---

## 3. Data Setup Mechanisms in Tests

1. **HTTP Chat Invocations**:
   - Tests do not mock internal database calls; instead, they trigger real App Router endpoints.
   - `POST /api/chat` invokes `callModel()` in `src/lib/model/client.ts`.
   - `callModel()` has a `finally` block that automatically calls `addModelCall()` in `src/lib/store.ts`.
   - `addModelCall()` assigns the incremental `id`, `at = new Date().toISOString()`, appends the record, and enforces the 200-call buffer ceiling.
2. **Factory Reset Invocations**:
   - `POST /api/debug/reset-all` restores the store from `data/store.json`.
   - In `data/store.json`, `calls` is `[]`, leaving 0 calls. This is used by tests to verify `callsCount === 0` and divide-by-zero handling.

---

## 4. Edge Cases Covered

1. **Zero Model Calls (`callsCount === 0`)**:
   - `averageLatencyMs` must return `0`, must be finite (`Number.isFinite`), and must not be `NaN`.
   - `totalInputTokens`, `totalOutputTokens`, `totalTokens`, `callsCount`, `errorCount` must all be `0`.
2. **Token Invariant & Null Safety**:
   - `totalTokens === totalInputTokens + totalOutputTokens`.
   - If `call.inputTokens` or `call.outputTokens` is `null` (such as when a call fails), arithmetic must coalesce to `0` (`c.inputTokens ?? 0`) to prevent `NaN`.
3. **Store Ring Buffer (200 item cap)**:
   - `addModelCall` slices to `-200`. The test checks `calls.length <= 200`.
4. **Idempotency of Reset**:
   - Calling reset multiple consecutive times succeeds without errors or file lock issues.
5. **Next.js 16 Dynamic Execution**:
   - Dynamic caching in Next.js 15/16 App Router could cache GET responses.
   - Must invoke `await connection()` from `next/server` inside each route handler to prevent static caching.

---

## 5. Other Test References to `/api/debug/*`

A global search of `tests/` revealed only three other references:
1. `tests/api-images.spec.ts`: Line 88 calls `POST /api/debug/reset-all`
2. `tests/sky-ui.spec.ts`: Line 114 calls `POST /api/debug/reset-all`
3. `tests/stage1.spec.ts`: Line 6 calls `POST /api/debug/reset-all`

**Conclusion**: No other test file calls `/api/debug/calls` or `/api/debug/metrics`. Only `tests/api-debug.spec.ts` tests these two endpoints.

---

## 6. Implementation Blueprint for Worker

### Boundary Files
- `src/app/api/debug/calls/route.ts`
- `src/app/api/debug/metrics/route.ts`

### Route 1: `src/app/api/debug/calls/route.ts`
```typescript
import { connection, NextResponse } from "next/server";
import { readStore } from "@/lib/store";

export async function GET() {
  await connection();
  const store = await readStore();
  return NextResponse.json(store.calls ?? [], { status: 200 });
}
```

### Route 2: `src/app/api/debug/metrics/route.ts`
```typescript
import { connection, NextResponse } from "next/server";
import { readStore } from "@/lib/store";

export async function GET() {
  await connection();
  const store = await readStore();
  const calls = store.calls ?? [];

  const callsCount = calls.length;
  const totalInputTokens = calls.reduce((acc, c) => acc + (c.inputTokens ?? 0), 0);
  const totalOutputTokens = calls.reduce((acc, c) => acc + (c.outputTokens ?? 0), 0);
  const totalTokens = totalInputTokens + totalOutputTokens;
  const totalDurationMs = calls.reduce((acc, c) => acc + (c.ms ?? 0), 0);
  const averageLatencyMs = callsCount === 0 ? 0 : Math.round(totalDurationMs / callsCount);
  const errorCount = calls.filter((c) => Boolean(c.error)).length;

  return NextResponse.json({
    nodesCount: store.nodes?.length ?? 0,
    insightsCount: store.insights?.length ?? 0,
    proposalsCount: store.proposals?.length ?? 0,
    runsCount: store.runs?.length ?? 0,
    callsCount,
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    averageLatencyMs,
    errorCount,
    totalPromptTokens: totalInputTokens,
    totalCompletionTokens: totalOutputTokens,
  }, { status: 200 });
}
```
