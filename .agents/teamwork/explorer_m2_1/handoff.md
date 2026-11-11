# Handoff Report: Milestone 2 — Debug Telemetry & Metrics Investigation

## 1. Observation
1. Execution of Playwright test suite `tests/api-debug.spec.ts`:
   Command:
   `$env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH; cd C:\Users\User\.gemini\antigravity\scratch\rem-dream; $env:MODEL_MOCK="1"; npx playwright test tests/api-debug.spec.ts`
   Result: 3 passed, 7 failed.
   - Passed: Tests 3, 6, 9 (all testing `POST /api/debug/reset-all`, which already exists in `src/app/api/debug/reset-all/route.ts`).
   - Failed: Tests 1, 2, 4, 5, 7, 8, 10 (all failed with HTTP 404 because `GET /api/debug/calls` and `GET /api/debug/metrics` do not exist).
2. `tests/api-debug.spec.ts` line 42–51 verifies `latestCall` schema on `/api/debug/calls`:
   - `typeof latestCall.id === "number"`
   - `typeof latestCall.at === "string"`
   - `["chat", "rem-step", "rem-proposal"].includes(latestCall.purpose)`
   - `typeof latestCall.model === "string"`
   - `typeof latestCall.temperature === "number"`
   - `typeof latestCall.prompt === "string"`
   - `typeof latestCall.response === "string"`
   - `typeof latestCall.ms === "number"`
   - `latestCall.ms >= 0`
3. `tests/api-debug.spec.ts` lines 58–69 and line 117 verify `GET /api/debug/metrics`:
   - Required number fields: `nodesCount`, `insightsCount`, `proposalsCount`, `runsCount`, `callsCount`, `totalInputTokens`, `totalOutputTokens`, `totalTokens`, `averageLatencyMs`, `errorCount`.
   - Invariant: `metrics.totalTokens === metrics.totalInputTokens + metrics.totalOutputTokens`.
   - Divide-by-zero check (line 108–110): `if (metrics.callsCount === 0) expect(metrics.averageLatencyMs).toBe(0)`.
4. `src/lib/store.ts` lines 216–235 and `src/lib/model/client.ts` lines 173–189:
   - `addModelCall` is already defined and in use.
   - `callModel` automatically calls `addModelCall` inside its `finally` block, persisting `purpose`, `runId`, `model`, `temperature`, `prompt`, `response`, `inputTokens`, `outputTokens`, `ms`, and `error`.
   - Buffer limit of 200 items is already enforced in `src/lib/store.ts:230`.
5. Global codebase grep for `/api/debug`:
   - Only `tests/api-debug.spec.ts` tests `GET /api/debug/calls` and `GET /api/debug/metrics`.
   - `tests/api-images.spec.ts:88`, `tests/sky-ui.spec.ts:114`, and `tests/stage1.spec.ts:6` only call `POST /api/debug/reset-all`.

## 2. Logic Chain
1. Based on Observation 1, the failing tests in `tests/api-debug.spec.ts` are purely due to missing routes `GET /api/debug/calls` and `GET /api/debug/metrics`.
2. Based on Observation 4, model invocation logging is already fully operational in `callModel` and `addModelCall`, saving to `store.calls` with the exact schema tested in Observation 2.
3. Based on Observation 3, the metrics endpoint requires reading `store = await readStore()` and computing aggregations across `store.nodes`, `store.insights`, `store.proposals`, `store.runs`, and `store.calls`.
4. Based on Observation 3, `SCOPE.md` referenced `totalPromptTokens` and `totalCompletionTokens`, whereas `tests/api-debug.spec.ts` explicitly expects `totalInputTokens` and `totalOutputTokens`. Including both the primary fields and compatibility aliases ensures compliance with both the tests and the scope document.
5. Based on Observation 5, implementing these two endpoints will not disrupt any other test suites.

## 3. Caveats
- No caveats. All 10 test cases in `tests/api-debug.spec.ts` and all related files were read and verified directly against runtime execution.

## 4. Conclusion
Milestone 2 implementation is strictly scoped to creating two route files:
- `src/app/api/debug/calls/route.ts`: reads `store.calls ?? []`, calls `await connection()`, returns 200 JSON array.
- `src/app/api/debug/metrics/route.ts`: reads store, calls `await connection()`, aggregates the 10 numeric metrics with divide-by-zero protection (`callsCount === 0 ? 0 : Math.round(totalDurationMs / callsCount)`), and returns 200 JSON object.
A comprehensive report has been written to `C:\Users\User\.gemini\antigravity\scratch\rem-dream\.agents\teamwork\explorer_m2_1\report.md`.

## 5. Verification Method
Run the Playwright test suite:
```powershell
$env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH;
cd C:\Users\User\.gemini\antigravity\scratch\rem-dream;
$env:MODEL_MOCK="1";
npx playwright test tests/api-debug.spec.ts
```
Expected result after implementation: All 10 tests pass.
