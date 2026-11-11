# Milestone 2 Review & Adversarial Stress-Test Report

**Target Scope**: Milestone 2 — Debug Telemetry & Metrics (Stage 6)
**Reviewed Files**:
- `src/app/api/debug/calls/route.ts`
- `src/app/api/debug/metrics/route.ts`
- `tests/api-debug.spec.ts`

---

## 1. Quality Review Summary

**Verdict**: **APPROVE**

Milestone 2 implementation satisfies all technical, architectural, and quality standards defined in `SCOPE.md`, `PROJECT.md`, and `docs/backend-plan.md`.

### Integrity Violation Audit
- Hardcoded test results or facade mocks: **NONE** (routes dynamically query `readStore()` and aggregate actual runtime data).
- Dummy/facade logic: **NONE** (full aggregation logic for token counts, latency, and error tracking).
- Task shortcutting / delegation to prohibited external systems: **NONE**.
- Fabricated verification output: **NONE** (verified via direct local test and build execution).
- Self-certification bypass: **NONE** (independently verified).

### Review Dimensions Assessment
1. **Correctness**:
   - `GET /api/debug/calls` accurately accesses `store.calls`, bounds results to the most recent 200 items (`.slice(-200)`), and returns 200 JSON adhering to `ModelCall[]`.
   - `GET /api/debug/metrics` accurately computes total calls, token sums (`totalInputTokens`, `totalOutputTokens`, `totalTokens`), rounded average latency with zero-division safeguard, error counts (`Boolean(c.error) || legacy.success === false`), collection lengths (`nodesCount`, `insightsCount`, `proposalsCount`, `runsCount`), and backward-compatibility aliases (`totalPromptTokens`, `totalCompletionTokens`).
2. **Next.js 16 Dynamic Route Conformance**:
   - Both route handlers invoke `await connection()` from `next/server`.
   - Turbopack production build verified dynamic compilation (`ƒ /api/debug/calls`, `ƒ /api/debug/metrics`).
3. **Type Safety & Linting**:
   - Zero ESLint warnings or errors (`npx eslint` exited with code 0).
   - Clean TypeScript typing without raw `any` types (using `LegacyCallFields` with explicit type guards).
4. **Write Boundary Compliance**:
   - Only `src/app/api/debug/calls/route.ts` and `src/app/api/debug/metrics/route.ts` were created for M2. No existing files were improperly altered.

---

## 2. Findings

### Positive Findings (Good Practices)
- **Robust Field Fallbacks**: Both routes support both primary (`inputTokens`, `outputTokens`, `ms`) and legacy/alternative schema fields (`promptTokens`, `completionTokens`, `durationMs`, `success`) smoothly.
- **Strict NaN Protection**: Accumulators verify `typeof value === "number"` before addition, preventing `NaN` contamination from `null` or `undefined` tokens.
- **Division by Zero Protection**: `averageLatencyMs` checks `callsCount === 0 ? 0 : Math.round(totalDurationMs / callsCount)`.
- **Capped Calls Buffer**: `.slice(-200)` ensures memory and response payload bounds even under long exhibition runtimes.

### Findings / Gaps
- None. No critical, major, or minor defects identified.

---

## 3. Verified Claims

| Claim | Verification Method | Result |
|---|---|---|
| `npm run build` succeeds | Executed `npm run build` with PowerShell toolchain | **PASS** (Exit code 0, routes marked dynamic `ƒ`) |
| `tests/api-debug.spec.ts` passes 100% | Executed `$env:MODEL_MOCK="1"; npx playwright test tests/api-debug.spec.ts` | **PASS** (10/10 passed in 3.4s) |
| ESLint passes cleanly | Executed `npx eslint src/app/api/debug/calls/route.ts src/app/api/debug/metrics/route.ts` | **PASS** (0 errors, 0 warnings) |
| Divide-by-zero protection | Verified code logic and Tier 2 test `Divide-by-zero protection: averageLatencyMs returns 0 when callsCount is 0` | **PASS** |
| Write boundary isolation | Checked `git status --porcelain src/app/api/debug/` | **PASS** (Only assigned files present) |

---

## 4. Adversarial Stress-Test & Challenge Report

**Overall Risk Assessment**: **LOW**

### Challenges & Stress Scenarios

#### Challenge 1: Empty Store State
- **Assumption Challenged**: System gracefully handles an uninitialized or freshly reset store where `store.calls` is undefined or empty.
- **Attack Scenario**: Call `/api/debug/metrics` and `/api/debug/calls` immediately following `/api/debug/reset-all` or when `store.calls` is undefined.
- **Actual Behavior**:
  - `const calls = store.calls ?? [];` defaults to an empty array.
  - `callsCount` is 0.
  - `averageLatencyMs` evaluates to `0`.
  - All token sums evaluate to `0`.
  - No uncaught exceptions or `NaN` returned.
- **Result**: **PASS**

#### Challenge 2: Nullable Token Fields
- **Assumption Challenged**: Calls containing `inputTokens: null` or `outputTokens: null` (allowed by `ModelCall` interface) do not produce `NaN`.
- **Attack Scenario**: Calls with `null` token values processed by `reduce`.
- **Actual Behavior**: Type guard `typeof c.inputTokens === "number"` rejects `null` (`typeof null === "object"`), returning `sum` unaltered.
- **Result**: **PASS**

#### Challenge 3: Unbounded Store Growth
- **Assumption Challenged**: High frequency of calls over long runtimes does not cause `/api/debug/calls` to return a massive payload.
- **Attack Scenario**: Store contains thousands of calls recorded during continuous exhibition operation.
- **Actual Behavior**: `(store.calls ?? []).slice(-200)` caps the returned array strictly to the last 200 items.
- **Result**: **PASS**

#### Challenge 4: Static Caching in Next.js 16
- **Assumption Challenged**: Next.js App Router might statically cache route responses, yielding stale telemetry.
- **Attack Scenario**: Rapid consecutive calls following chat interactions.
- **Actual Behavior**: `await connection()` guarantees per-request dynamic execution. Build output explicitly categorizes both routes under `ƒ (Dynamic)`.
- **Result**: **PASS**

---

## 5. Coverage Gaps & Unverified Items
- **Coverage Gaps**: None within the scope of Milestone 2.
- **Unverified Items**: None. All functional requirements and edge cases were independently verified.
