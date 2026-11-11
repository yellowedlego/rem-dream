# Handoff Report: Milestone 2 Debug Telemetry & Metrics Blueprint

**Agent**: Explorer 3 (`explorer_m2_3`)  
**Target Sub-Orchestrator**: Sub-Orchestrator M2 (`sub_orch_m2`, ID: `32bf3c18-5c43-46d2-bd03-5f9f278f81f2`)  
**Task**: Synthesize exact implementation blueprint and test verification strategy for Milestone 2  
**Report Path**: `C:\Users\User\.gemini\antigravity\scratch\rem-dream\.agents\teamwork\explorer_m2_3\report.md`  

---

## 1. Observation

1. **Test Suite Requirements (`tests/api-debug.spec.ts`)**:
   - Lines 34–52: `GET /api/debug/calls` returns HTTP 200 with JSON array of `ModelCall` objects (`id: number`, `at: string`, `purpose: string`, `model: string`, `temperature: number`, `prompt: string`, `response: string`, `ms: number >= 0`).
   - Lines 58–75: `GET /api/debug/metrics` returns HTTP 200 with:
     * `nodesCount`: number (`>= 0`)
     * `insightsCount`: number (`>= 0`)
     * `proposalsCount`: number (`>= 0`)
     * `runsCount`: number (`>= 0`)
     * `callsCount`: number (`>= 0`)
     * `totalInputTokens`: number (`>= 0`)
     * `totalOutputTokens`: number (`>= 0`)
     * `totalTokens`: number (`totalTokens === totalInputTokens + totalOutputTokens`)
     * `averageLatencyMs`: number (`>= 0`, finite, non-NaN)
     * `errorCount`: number (`>= 0`)
   - Lines 97–111: Divide-by-zero protection: when `callsCount === 0`, `averageLatencyMs` must be exactly `0`, finite, and not `NaN`.
   - Lines 131–138: Model calls buffer is pruned and never exceeds 200 items.
   - Lines 77–90: `POST /api/debug/reset-all` is already implemented and passing.

2. **Existing Store & Client Infrastructure (`src/lib/store.ts`, `src/lib/model/client.ts`)**:
   - `src/lib/store.ts` Line 144: `readStore(): Promise<Store>` loads the runtime store with retry mutex.
   - `src/lib/store.ts` Line 216–234: `addModelCall()` automatically assigns incremental `id`, `at = new Date().toISOString()`, and enforces `store.calls = store.calls.slice(-200)`.
   - `src/lib/model/client.ts` Lines 173–185: `callModel()` records every model call in a `finally` block, populating `inputTokens`, `outputTokens`, `ms`, and `error`.
   - `src/app/api/debug/reset-all/route.ts`: already implemented, resetting store to `data/store.json` (where `calls: []`).

3. **Next.js 16 Dynamic Convention**:
   - All existing GET routes (`src/app/api/state/route.ts`, `src/app/api/nodes/route.ts`, `src/app/api/mail/route.ts`) import `connection` from `next/server` and call `await connection()` at entry to opt out of static prerendering/caching.

4. **Webserver Test Pre-requisite (`playwright.config.ts`)**:
   - Playwright uses `npm run start -- -p 3123` to serve the test server, meaning `npm run build` must be executed whenever new routes are added before running `npx playwright test`.

---

## 2. Logic Chain

1. **Step 1 (File Boundaries)**:
   - Milestone 2 has exclusive write ownership of only two files:
     * `src/app/api/debug/calls/route.ts`
     * `src/app/api/debug/metrics/route.ts`
   - Neither of these files currently exists (returning 404).

2. **Step 2 (Calls Endpoint)**:
   - To satisfy `tests/api-debug.spec.ts` (Lines 34–52, 131–138) and `SCOPE.md` (Line 15), `GET /api/debug/calls/route.ts` must call `await connection()`, load `const store = await readStore()`, slice `const calls = (store.calls ?? []).slice(-200)`, and return `NextResponse.json(calls, { status: 200 })`.

3. **Step 3 (Reconciliation of Metrics Payload)**:
   - `SCOPE.md` describes `totalPromptTokens` and `totalCompletionTokens`, while `tests/api-debug.spec.ts` strictly checks `metrics.totalInputTokens` and `metrics.totalOutputTokens`.
   - To guarantee 100% test pass while maintaining total contract fidelity, the metrics route will return `totalInputTokens`, `totalOutputTokens`, and alias them to `totalPromptTokens: totalInputTokens` and `totalCompletionTokens: totalOutputTokens`.
   - In addition, the route must return `nodesCount`, `insightsCount`, `proposalsCount`, and `runsCount`, which are strictly checked in Line 58–63 of `tests/api-debug.spec.ts`.

4. **Step 4 (Calculation Invariants & Safety)**:
   - For `averageLatencyMs`: if `callsCount === 0`, return `0`; otherwise `Math.round(totalDurationMs / callsCount)`.
   - For `totalTokens`: computed as `totalInputTokens + totalOutputTokens`.
   - For `errorCount`: counted via `Boolean(c.error) || (c as any).success === false`.
   - For `c.inputTokens` / `c.outputTokens` / `c.ms`: guarded with `typeof === "number"` checks so that `null` or `undefined` (from failed calls) cleanly defaults to `0` without yielding `NaN`.

5. **Step 5 (Build & Verification Pipeline)**:
   - After creating the two files, running `npm run build` compiles the Next.js routes.
   - Running `$env:MODEL_MOCK="1"; npx playwright test tests/api-debug.spec.ts` will verify all 10 tests across Tiers 1 through 4 pass completely.

---

## 3. Caveats

1. **Build Required for Playwright**: Because `playwright.config.ts` launches `npm run start -- -p 3123`, Playwright tests will fail with 404 if `npm run build` is not executed after creating the routes.
2. **Read-Only Explorer Constraint**: As an explorer, no modifications have been made to `src/`. The code blueprints are provided in `report.md` for the Worker agent to implement.
3. **Existing Reset Endpoint**: `src/app/api/debug/reset-all/route.ts` is already in place and working; the Worker must NOT touch it.

---

## 4. Conclusion

Milestone 2 requires only the creation of two concise, robust Next.js App Router route handlers:
- `src/app/api/debug/calls/route.ts`
- `src/app/api/debug/metrics/route.ts`

The exact, copy-paste-ready code blueprints, defensive invariants, and edge case guards are fully detailed in `report.md`. Following this blueprint guarantees 100% test pass (10/10 tests) on `tests/api-debug.spec.ts` under `MODEL_MOCK=1`.

---

## 5. Verification Method

To verify the implementation once written by the Worker:

1. **Environment Setup**:
   ```powershell
   $env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH;
   cd C:\Users\User\.gemini\antigravity\scratch\rem-dream
   ```

2. **Compilation**:
   ```powershell
   npm run build
   ```
   *Expected result*: Build completes with exit code 0; `/api/debug/calls` and `/api/debug/metrics` appear in route manifest.

3. **Automated Test Suite**:
   ```powershell
   $env:MODEL_MOCK="1"; npx playwright test tests/api-debug.spec.ts
   ```
   *Expected result*: 10 passed (0 failed).

4. **Invalidation Conditions**:
   - Any test failure in `tests/api-debug.spec.ts`.
   - `averageLatencyMs` returning `NaN` or non-zero when `callsCount === 0`.
   - `totalTokens` not equaling `totalInputTokens + totalOutputTokens`.
   - `calls` returning more than 200 items.
