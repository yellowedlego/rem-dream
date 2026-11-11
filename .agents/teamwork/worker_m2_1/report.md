# Milestone 2 Worker Implementation Report: Debug Telemetry & Metrics

**Agent**: Worker (`worker_m2_1`)  
**Milestone**: Milestone 2 — Debug Telemetry & Metrics (Stage 6)  
**Date**: 2026-11-11  
**Status**: COMPLETE (10/10 tests passing, 0 TypeScript/build errors, 0 lint errors)

---

## 1. Overview of Delivered Changes

In accordance with `DISPATCH.md` and `SCOPE.md`, the debug telemetry endpoints were implemented within strict write boundaries:
- `src/app/api/debug/calls/route.ts`
- `src/app/api/debug/metrics/route.ts`

No other codebase files were modified.

---

## 2. Implementation Details

### 2.1 `src/app/api/debug/calls/route.ts`
```typescript
import { connection, NextResponse } from "next/server";
import { readStore } from "@/lib/store";

export async function GET() {
  await connection();
  const store = await readStore();
  const calls = (store.calls ?? []).slice(-200);
  return NextResponse.json(calls, { status: 200 });
}
```
**Key Properties**:
- `await connection()` enforces dynamic request-time execution in Next.js 16 App Router, avoiding stale build caches.
- Reads `store.calls` via `readStore()`.
- Defensively slices the last 200 records (`.slice(-200)`), adhering to the ring buffer limit.
- Returns HTTP 200 with JSON array of `ModelCall` items.

### 2.2 `src/app/api/debug/metrics/route.ts`
```typescript
import { connection, NextResponse } from "next/server";
import { readStore } from "@/lib/store";

interface LegacyCallFields {
  promptTokens?: number | null;
  completionTokens?: number | null;
  durationMs?: number | null;
  success?: boolean | null;
}

export async function GET() {
  await connection();
  const store = await readStore();
  const calls = store.calls ?? [];

  const callsCount = calls.length;

  const totalInputTokens = calls.reduce((sum, c) => {
    if (typeof c.inputTokens === "number") {
      return sum + c.inputTokens;
    }
    const legacy = c as unknown as LegacyCallFields;
    if (typeof legacy.promptTokens === "number") {
      return sum + legacy.promptTokens;
    }
    return sum;
  }, 0);

  const totalOutputTokens = calls.reduce((sum, c) => {
    if (typeof c.outputTokens === "number") {
      return sum + c.outputTokens;
    }
    const legacy = c as unknown as LegacyCallFields;
    if (typeof legacy.completionTokens === "number") {
      return sum + legacy.completionTokens;
    }
    return sum;
  }, 0);

  const totalTokens = totalInputTokens + totalOutputTokens;

  const totalDurationMs = calls.reduce((sum, c) => {
    if (typeof c.ms === "number") {
      return sum + c.ms;
    }
    const legacy = c as unknown as LegacyCallFields;
    if (typeof legacy.durationMs === "number") {
      return sum + legacy.durationMs;
    }
    return sum;
  }, 0);

  const averageLatencyMs =
    callsCount === 0 ? 0 : Math.round(totalDurationMs / callsCount);

  const errorCount = calls.reduce((count, c) => {
    const legacy = c as unknown as LegacyCallFields;
    const isError = Boolean(c.error) || legacy.success === false;
    return count + (isError ? 1 : 0);
  }, 0);

  const metrics = {
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
    // Alias fields for backward compatibility and alternative specifications
    totalPromptTokens: totalInputTokens,
    totalCompletionTokens: totalOutputTokens,
  };

  return NextResponse.json(metrics, { status: 200 });
}
```
**Key Properties**:
- `await connection()` guarantees dynamic request-time execution in Next.js 16.
- Strict divide-by-zero protection: `callsCount === 0 ? 0 : Math.round(totalDurationMs / callsCount)` guarantees finite non-NaN output even when reset or empty.
- Null-safe token accumulation: null tokens on failed calls coalesce to 0.
- Strict token invariant: `totalTokens = totalInputTokens + totalOutputTokens`.
- Full operational counts included: `nodesCount`, `insightsCount`, `proposalsCount`, `runsCount`.
- Backwards compatibility alias fields: `totalPromptTokens` and `totalCompletionTokens`.
- Zero `any` casts: typed through `LegacyCallFields` with `unknown` cast, complying 100% with `@typescript-eslint/no-explicit-any`.

---

## 3. Build & Quality Verification

### 3.1 Next.js Build (`npm run build`)
Command:
```powershell
$env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH; Set-Location C:\Users\User\.gemini\antigravity\scratch\rem-dream; npm run build
```
Result: Exited with code 0.
Route summary showed both endpoints recognized and compiled dynamically:
```
├ ƒ /api/debug/calls
├ ƒ /api/debug/metrics
```

### 3.2 ESLint Check
Command:
```powershell
npx eslint src/app/api/debug/calls/route.ts src/app/api/debug/metrics/route.ts
```
Result: Exited with code 0, 0 errors, 0 warnings.

### 3.3 Automated Playwright Verification (`tests/api-debug.spec.ts`)
Command:
```powershell
$env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH; Set-Location C:\Users\User\.gemini\antigravity\scratch\rem-dream; $env:MODEL_MOCK="1"; npx playwright test tests/api-debug.spec.ts
```
Output:
```
Running 10 tests using 1 worker

  ok  1 tests\api-debug.spec.ts:27:9 › Stage 6: Debug & Metrics API (/api/debug/*) › Tier 1: Feature Coverage › GET /api/debug/calls returns list of recent model invocations with valid schema (109ms)
  ok  2 tests\api-debug.spec.ts:54:9 › Stage 6: Debug & Metrics API (/api/debug/*) › Tier 1: Feature Coverage › GET /api/debug/metrics returns complete operational metrics (23ms)
  ok  3 tests\api-debug.spec.ts:77:9 › Stage 6: Debug & Metrics API (/api/debug/*) › Tier 1: Feature Coverage › POST /api/debug/reset-all executes factory reset and returns ok: true (31ms)
  ok  4 tests\api-debug.spec.ts:97:9 › Stage 6: Debug & Metrics API (/api/debug/*) › Tier 2: Boundary & Corner Cases › Divide-by-zero protection: averageLatencyMs returns 0 when callsCount is 0 (25ms)
  ok  5 tests\api-debug.spec.ts:113:9 › Stage 6: Debug & Metrics API (/api/debug/*) › Tier 2: Boundary & Corner Cases › Metric token consistency: totalTokens equals totalInputTokens + totalOutputTokens (13ms)
  ok  6 tests\api-debug.spec.ts:120:9 › Stage 6: Debug & Metrics API (/api/debug/*) › Tier 2: Boundary & Corner Cases › POST /api/debug/reset-all is idempotent and succeeds across multiple consecutive calls (34ms)
  ok  7 tests\api-debug.spec.ts:131:9 › Stage 6: Debug & Metrics API (/api/debug/*) › Tier 2: Boundary & Corner Cases › Model calls buffer is pruned and never exceeds 200 items (11ms)
  ok  8 tests\api-debug.spec.ts:145:9 › Stage 6: Debug & Metrics API (/api/debug/*) › Tier 3: Cross-Feature Combinations › Chat interactions immediately increment callsCount and record call with purpose='chat' (78ms)
  ok  9 tests\api-debug.spec.ts:171:9 › Stage 6: Debug & Metrics API (/api/debug/*) › Tier 3: Cross-Feature Combinations › Factory reset cleans dynamic state and restores initial seed configuration (59ms)
  ok 10 tests\api-debug.spec.ts:194:9 › Stage 6: Debug & Metrics API (/api/debug/*) › Tier 4: Real-World Scenarios › Exhibition daily closing maintenance and operational health check (29ms)

  10 passed (2.6s)
```

100% of tests passed across all tiers.
