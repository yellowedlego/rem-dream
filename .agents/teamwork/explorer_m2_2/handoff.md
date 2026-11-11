# Handoff Report — Explorer 2 (Milestone 2: Debug Telemetry & Metrics)

## 1. Observation

1. **Storage Structure & Types**:
   - `src/lib/types.ts:145–158` defines `ModelCall`:
     ```typescript
     export interface ModelCall {
       id: number;
       at: string;
       purpose: ModelPurpose;
       runId: string | null;
       model: string;
       temperature: number;
       prompt: string;
       response: string;
       inputTokens: number | null;
       outputTokens: number | null;
       ms: number;
       error: string | null;
     }
     ```
   - `src/lib/types.ts:217–237` defines `Store` with `calls?: ModelCall[]`.
   - `src/lib/store.ts:216–235` implements `addModelCall`:
     - Assigns autoincrement integer `id = maxId + 1`
     - Assigns ISO timestamp string `at = new Date().toISOString()`
     - Enforces sliding ring buffer of 200: `if (store.calls.length > 200) store.calls = store.calls.slice(-200);`
   - `src/lib/store.ts:144–169` exports `readStore(): Promise<Store>`.
   - `data/store.json:263` initializes seed with `"calls": []`.

2. **Call Logging Location**:
   - `src/lib/model.ts` does not exist. The actual implementation is located at `src/lib/model/client.ts`.
   - `src/lib/model/client.ts:80–189`: `callModel()` logs each invocation in its `finally` block via `await addModelCall(...)`.
   - When call succeeds: `error: null`, `inputTokens: number`, `outputTokens: number`.
   - When call fails: `error: string` (scrubbed of API keys), `inputTokens: null`, `outputTokens: null`.

3. **Next.js API Route Conventions**:
   - `connection()` from `next/server` is awaited at the start of dynamic GET handlers (`src/app/api/state/route.ts:8`, `src/app/api/nodes/route.ts:5`, `src/app/api/sessions/route.ts:13`, `src/app/api/admin/records/route.ts:18`).
   - All API routes use `NextResponse.json(...)` (e.g. `src/app/api/debug/reset-all/route.ts:9`, `src/app/api/state/route.ts:66`).
   - Neither `/api/debug/calls` nor `/api/debug/metrics` currently exist (returning 404).

4. **Test Baseline**:
   - Running test command:
     `$env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH; Set-Location C:\Users\User\.gemini\antigravity\scratch\rem-dream; $env:MODEL_MOCK="1"; npx playwright test tests/api-debug.spec.ts`
   - Result: 3 passed (the existing `reset-all` tests), 7 failed (all 404 on `/api/debug/calls` and `/api/debug/metrics`).
   - `tests/api-debug.spec.ts:58–69` explicitly verifies these 10 metric fields:
     `nodesCount`, `insightsCount`, `proposalsCount`, `runsCount`, `callsCount`, `totalInputTokens`, `totalOutputTokens`, `totalTokens`, `averageLatencyMs`, `errorCount`.

---

## 2. Logic Chain

1. From Observation 1, `store.calls` is already populated with valid `ModelCall` objects that have `id`, `at`, `purpose`, `model`, `temperature`, `prompt`, `response`, `ms`, and `error`.
2. From Observation 2, `src/lib/model/client.ts` automatically logs every model call to `store.calls` on both mock and live modes. There is no need to write new call-logging hooks.
3. From Observation 3 and Next.js 16 conventions, creating `src/app/api/debug/calls/route.ts` with `await connection()` and returning `NextResponse.json(store.calls ?? [], { status: 200 })` satisfies `GET /api/debug/calls`.
4. From Observation 4, `tests/api-debug.spec.ts` tests 10 specific numeric metric fields. Aggregating these values directly from `store` (`nodes`, `insights`, `proposals`, `runs`, and `calls`), with a divide-by-zero check `callsCount === 0 ? 0 : Math.round(totalMs / callsCount)`, satisfies `GET /api/debug/metrics`.
5. Therefore, implementing only `src/app/api/debug/calls/route.ts` and `src/app/api/debug/metrics/route.ts` will resolve all 7 failing tests and achieve 100% test pass rate for Milestone 2.

---

## 3. Caveats

1. **Schema Name Discrepancy**:
   `sub_orch_m2/SCOPE.md` referenced `promptTokens`, `completionTokens`, and `durationMs`. However, the codebase (`src/lib/types.ts`) and test specification (`tests/api-debug.spec.ts`) strictly use `totalInputTokens`, `totalOutputTokens`, and `averageLatencyMs`. The worker must follow `tests/api-debug.spec.ts` and `src/lib/types.ts`.
2. **Read-Only Investigation**:
   As an explorer, no routes or implementation files were created or modified during this turn.
3. **Array vs Object Return for `/api/debug/calls`**:
   `tests/api-debug.spec.ts:extractCalls()` accepts either `ModelCall[]` or `{ calls: ModelCall[] }`, but SCOPE.md specifies returning a JSON array directly (`store.calls ?? []`).

---

## 4. Conclusion

The path to implement Milestone 2 is clear and isolated:
- Create `src/app/api/debug/calls/route.ts` exporting `GET`:
  - `await connection()`
  - `const store = await readStore()`
  - `return NextResponse.json(store.calls ?? [], { status: 200 })`
- Create `src/app/api/debug/metrics/route.ts` exporting `GET`:
  - `await connection()`
  - `const store = await readStore()`
  - Compute `nodesCount`, `insightsCount`, `proposalsCount`, `runsCount`, `callsCount`, `totalInputTokens`, `totalOutputTokens`, `totalTokens`, `averageLatencyMs` (guard `callsCount === 0 ? 0 : Math.round(...)`), and `errorCount`
  - `return NextResponse.json({ ... }, { status: 200 })`
- Comprehensive report available at:
  `C:\Users\User\.gemini\antigravity\scratch\rem-dream\.agents\teamwork\explorer_m2_2\report.md`

---

## 5. Verification Method

To independently verify:
1. Check test failure baseline:
   ```powershell
   $env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH;
   Set-Location C:\Users\User\.gemini\antigravity\scratch\rem-dream;
   $env:MODEL_MOCK="1";
   npx playwright test tests/api-debug.spec.ts
   ```
   (Expected prior to implementation: 3 passed, 7 failed).
2. Inspect schema definitions:
   - `src/lib/types.ts:145–158` (`ModelCall`)
   - `src/lib/store.ts:216–235` (`addModelCall` & ring buffer)
   - `src/lib/model/client.ts:173–185` (`addModelCall` usage in `callModel`)
   - `tests/api-debug.spec.ts:58–69` (required metrics properties)
3. Invalidation conditions:
   - If tests fail after route implementation due to unexpected metric key names, verify key names match `tests/api-debug.spec.ts` exactly.
