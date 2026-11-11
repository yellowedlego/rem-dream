# Milestone 2 Handoff Report: Debug Telemetry & Metrics

## 1. Observation
- Target Files Created:
  - `src/app/api/debug/calls/route.ts`
  - `src/app/api/debug/metrics/route.ts`
- Write Boundary Audit (`git status --porcelain`):
  - Only `src/app/api/debug/calls/route.ts` and `src/app/api/debug/metrics/route.ts` were added under `src/app/api/`. No existing project files outside the boundary were modified.
- Build Output:
  - `npm run build` completed with exit code 0.
  - Route manifest generated:
    ```
    ├ ƒ /api/debug/calls
    ├ ƒ /api/debug/metrics
    ```
- Lint Check Output:
  - `npx eslint src/app/api/debug/calls/route.ts src/app/api/debug/metrics/route.ts` exited with code 0 (zero errors, zero warnings).
- Playwright Verification Output:
  - `$env:MODEL_MOCK="1"; npx playwright test tests/api-debug.spec.ts` ran 10 tests across Tiers 1-4 and exited with code 0 (10 passed, 0 failed, duration 2.6s).

## 2. Logic Chain
1. `tests/api-debug.spec.ts` tests Stage 6 debug endpoints (`/api/debug/calls` and `/api/debug/metrics`), which previously returned 404 because the routes did not exist.
2. The model client (`src/lib/model/client.ts`) already records all invocations to `store.calls` via `addModelCall()` in `src/lib/store.ts`.
3. In `src/app/api/debug/calls/route.ts`, awaiting `connection()` from `next/server` guarantees dynamic execution in Next.js 16. Reading `store = await readStore()` and returning `(store.calls ?? []).slice(-200)` provides a valid `ModelCall[]` array capped at 200 items.
4. In `src/app/api/debug/metrics/route.ts`, awaiting `connection()` and aggregating metrics from `store.calls ?? []` computes:
   - `callsCount`: `calls.length`
   - `totalInputTokens`: sum of `c.inputTokens ?? promptTokens ?? 0`
   - `totalOutputTokens`: sum of `c.outputTokens ?? completionTokens ?? 0`
   - `totalTokens`: `totalInputTokens + totalOutputTokens`
   - `totalDurationMs`: sum of `c.ms ?? durationMs ?? 0`
   - `averageLatencyMs`: protected with `callsCount === 0 ? 0 : Math.round(totalDurationMs / callsCount)`, preventing `NaN` or division by zero.
   - `errorCount`: count of calls where `Boolean(c.error) || legacy.success === false`.
   - `nodesCount`, `insightsCount`, `proposalsCount`, `runsCount`: counts from store collections.
   - `totalPromptTokens` and `totalCompletionTokens`: alias fields ensuring backward compatibility with earlier specs.
5. All calculations avoid `any` by using an interface `LegacyCallFields` with an `unknown` cast, satisfying ESLint rules.
6. Clean build and test execution verified 10/10 tests passing.

## 3. Caveats
- No caveats. The implementation strictly respects write boundaries, introduces no regressions, and fulfills all 10 test cases in `tests/api-debug.spec.ts`.

## 4. Conclusion
Milestone 2 (Debug Telemetry & Metrics) implementation is complete, fully functional, and verified. Both routes are dynamically served and pass all happy-path, edge-case, cross-feature, and scenario tests in `tests/api-debug.spec.ts`.

## 5. Verification Method
To independently verify:
```powershell
$env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH;
Set-Location C:\Users\User\.gemini\antigravity\scratch\rem-dream;
npm run build;
$env:MODEL_MOCK="1"; npx playwright test tests/api-debug.spec.ts;
npx eslint src/app/api/debug/calls/route.ts src/app/api/debug/metrics/route.ts;
```
Expected result:
- Build completes with exit code 0.
- All 10 tests in `tests/api-debug.spec.ts` pass with exit code 0.
- ESLint reports 0 errors and 0 warnings.
