# Test Infrastructure and Verification Survey Report

**Project**: REM Dream Showcase Backend (`rem-dream`)  
**Workspace**: `C:\Users\User\.gemini\antigravity\scratch\rem-dream`  
**Date**: 2026-11-11  
**Investigating Agent**: `teamwork_explorer_survey_3`  
**Git Branch**: `backend`  

---

## Executive Summary

The REM Dream test infrastructure is built upon **Playwright pure HTTP opaque-box testing** with zero browser overhead (`APIRequestContext` via `{ request }`), executing against a Next.js production build (`npm run start -- -p 3123`). 

The test harness, mock facilities, and Stage 2 test suites (`api-chat.spec.ts`, `api-story.spec.ts`, `challenger-m1-2.spec.ts`) are completely intact and passing (44/44 tests passed). 

However, all Stage 3–6 backend endpoints and engine components are currently unwritten, causing all 16 tests in `api-rem.spec.ts`, 14 tests in `api-proposal.spec.ts`, and 7/10 tests in `api-debug.spec.ts` to return HTTP 404. Furthermore, the Stage 3 verification script `scripts/verify-rem.mjs` does not yet exist in the codebase and must be implemented.

---

## 1. Test Suite Inventory and Existing Test Files

### 1.1 Target Test Files Analysis

#### `tests/api-rem.spec.ts` (16 tests — all currently failing with 404)
- **Scope**: Stages 3 & 5 (REM Core, Concurrency Lock, Node Capping, Modes)
- **Endpoints tested**:
  - `POST /api/rem/start` (`{ sessionId, mode: "consolidate" | "dream", temperature?: number }` -> HTTP 202 Accepted, `{ runId: string }`)
  - `GET /api/rem/status?runId=...` -> HTTP 200 OK (`RemRun` object)
  - `POST /api/rem/stop` (`{ runId: string }` -> HTTP 200 OK, `{ ok: true }`)
- **Key Assertions by Tier**:
  - **Tier 1 (Happy Path)**: Consolidate mode start returns 202 with `runId`; status returns valid `RemRun` schema (`id`, `sessionId`, `mode`, `status`, `currentNodeIds`, `insightIds`, `startedAt`); dream mode start with temperature 1.1; stop requests run termination.
  - **Tier 2 (Boundary & Corner Cases)**:
    - Missing `sessionId` returns 400.
    - Invalid/unregistered `mode` returns 400.
    - Concurrent REM run attempt returns 409 Conflict.
    - Missing `runId` on status/stop returns 400.
    - Non-existent `runId` on status/stop returns 404.
    - Max 12 memory nodes cap: `finalRun.currentNodeIds.length <= 12` even when 14 nodes exist.
  - **Tier 3 (Cross-Feature Combinations)**:
    - Chat locking during REM run (`/api/chat` returns 409 Conflict while `status: "running"`).
    - Unlocking chat after completion (`/api/chat` returns 200).
    - Store state reflection: `finalRun.insightIds` present in `/api/state`, and proposal created with `status: "pending"`.
    - Side-by-side mode execution: running `consolidate` and `dream` modes sequentially on the same session produces distinct insights in store.
  - **Tier 4 (Real-World Scenarios)**:
    - Full exhibition visitor sleep tracking lifecycle: multi-turn chat -> initiate REM -> poll status -> verify `finishedAt` and generated proposal.

#### `tests/api-proposal.spec.ts` (14 tests — all currently failing with 404)
- **Scope**: Stage 4 (Persona Lifecycle, Versioning, Prompt Propagation, Rollback, Session Reset)
- **Endpoints tested**:
  - `POST /api/proposals/[id]/approve` -> HTTP 200 (`{ ok: true, activePersona: number }`)
  - `POST /api/proposals/[id]/reject` -> HTTP 200 (`{ ok: true }`)
  - `POST /api/persona/revert` (`{ version: number }` -> HTTP 200 (`{ ok: true, activePersona: number }`))
  - `POST /api/session/reset` (`{ sessionId: string }` -> HTTP 200 (`{ ok: true }`))
- **Key Assertions by Tier**:
  - **Tier 1 (Happy Path)**:
    - Proposal approval increments `activePersona` to version >= 2; updates proposal to `status: "approved"`, `decidedAt`.
    - Proposal rejection marks proposal `status: "rejected"`, `decidedAt` without changing `activePersona`.
    - Persona revert switches `activePersona` back to version 1.
    - Session reset clears memory nodes for specified `sessionId` and resets `activePersona` to 1.
  - **Tier 2 (Boundary & Corner Cases)**:
    - Non-numeric proposal ID returns 400.
    - Non-existent proposal ID returns 404.
    - Approving an already approved proposal returns 400.
    - Rejecting non-existent proposal ID returns 404.
    - Reverting to non-existent version returns 404.
    - Missing/invalid version payload on revert returns 400.
    - Missing `sessionId` on session reset returns 400.
  - **Tier 3 (Cross-Feature Combinations)**:
    - Persona prompt propagation: approving proposal immediately makes subsequent `/api/chat` calls use the new `proposedPrompt` in `activePersona`.
    - Persona rollback: reverting to version 1 restores baseline persona prompt in subsequent `/api/chat`.
  - **Tier 4 (Real-World Scenarios)**:
    - Full visitor lifecycle: chat -> REM -> review & approve proposal -> evolved chat -> booth attendant session reset -> verify clean state.

#### `tests/api-debug.spec.ts` (10 tests — 3 pass, 7 fail)
- **Passing**: `POST /api/debug/reset-all` factory reset and idempotency (already implemented at `src/app/api/debug/reset-all/route.ts`).
- **Failing**:
  - `GET /api/debug/calls` (missing, returns 404)
  - `GET /api/debug/metrics` (missing, returns 404)
- **Required Metrics Schema**:
  ```ts
  {
    nodesCount: number,
    insightsCount: number,
    proposalsCount: number,
    runsCount: number,
    callsCount: number,
    totalInputTokens: number,
    totalOutputTokens: number,
    totalTokens: number,
    averageLatencyMs: number, // 0 when callsCount === 0 (divide-by-zero protection)
    errorCount: number
  }
  ```
- **Required Call Log Pruning**: In-memory / store calls buffer must not exceed 200 items (`calls.length <= 200`).

### 1.2 Other Test Files in the Repository
- `tests/api-chat.spec.ts`: 16 tests, covering `/api/chat` and `/api/state` (**16/16 PASSING**).
- `tests/api-story.spec.ts`: 17 tests, covering story splitting, verbatim preservation, meaning creation, cascading delete (**17/17 PASSING**).
- `tests/challenger-m1-2.spec.ts`: 11 tests, testing empirical mock discrimination, active persona changes, and REM 409 concurrency locking (**11/11 PASSING**).
- `tests/api-profile.spec.ts`, `tests/api-images.spec.ts`, `tests/chat-images.spec.ts`, `tests/me-ui.spec.ts`, `tests/sky-ui.spec.ts`, `tests/unit/*.ts`.

---

## 2. Verification Script Investigation: `scripts/verify-rem.mjs`

### 2.1 Current File Status
- **Existence**: `scripts/verify-rem.mjs` does **NOT** exist in `scripts/` or in git history.
- **Related Existing Script**: `scripts/make-fake-store.mjs` exists and demonstrates ES module scripting using `node:fs` and relative JSON generation.

### 2.2 Specification and Expected Behavior
From `docs/backend-plan.md` (lines 216-217, 260-261) and `ORIGINAL_REQUEST.md`:
1. **Core Purpose**: Verify Stage 3 core hypothesis — that REM sleep actually causes observable behavioral changes in AI responses before and after sleep.
2. **Workflow**:
   - Step 1: Ensure server is running or communicate with local API base (`http://localhost:3000` or `http://localhost:3123`).
   - Step 2: Establish a conversation session with seeded memory nodes.
   - Step 3: Ask the canonical verification question: `"나에 대해 어떻게 생각해?"` ("What do you think of me?"). Record the baseline response (Persona v1).
   - Step 4: Trigger REM sleep: `POST /api/rem/start` with `mode: "consolidate"` (or `"dream"`).
   - Step 5: Poll `GET /api/rem/status?runId=...` until `status === "done"`.
   - Step 6: Inspect generated proposal and approve it: `POST /api/proposals/[id]/approve`.
   - Step 7: Ask the identical question again: `"나에 대해 어떻게 생각해?"`. Record the evolved response (Persona v2 or v3).
   - Step 8: Compare before and after responses to verify they are distinct and reflect the updated persona.
   - Step 9: Append comparison logs into `docs/rem-verification.md`.
3. **Exit Criterion**: Record at least 3 distinct before-and-after examples in `docs/rem-verification.md`.
4. **Mock Mode Integration**:
   - In `src/lib/model/mock.ts` (lines 27-40), the codebase already contains hardcoded deterministic responses specifically tailored for `"나에 대해 어떻게 생각해?"`:
     - **v1**: `"오늘 하루를 열심히 살아가는 따뜻한 사람이라고 생각해. 이야기 들려줘서 고마워."`
     - **v2** (Task-splitting): `"목표를 향해 부지런히 달리면서도 가끔은 벅차 보이는 사람이야. 해야 할 일이 많을 땐 우선순위를 정해서 하나씩 작게 나눠 해결해 나가면 좋겠어."`
     - **v3** (Food & Comfort): `"오늘도 많이 애쓴 사람이야. 열심히 하는 것도 좋지만, 좋아하는 맛있는 음식 챙겨 먹으면서 잠시 숨 돌리는 시간도 가졌으면 좋겠어."`
   - This allows `scripts/verify-rem.mjs` to execute completely deterministically under `MODEL_MOCK=1` without external API dependencies.

---

## 3. Test Framework & Runner Configuration

### 3.1 Playwright Configuration (`playwright.config.ts`)
```ts
export default defineConfig({
  testDir: "tests",
  outputDir: "test-results",
  workers: 1,               // Sequential execution to avoid runtime store collision
  fullyParallel: false,
  use: {
    baseURL: "http://localhost:3123",
  },
  webServer: {
    command: process.platform === "win32" ? "npm.cmd run start -- -p 3123" : "npm run start -- -p 3123",
    url: "http://localhost:3123",
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      MODEL_MOCK: "1",
      REM_RUNTIME_DIR: "data/runtime-test", // Isolated test store directory
      MAIL_MOCK: "1",
      ...process.env,
    },
  },
});
```
- **Key Observation on `webServer`**: It executes `npm.cmd run start -- -p 3123`, which serves the production build. Therefore, `npm run build` must be executed before running tests if code changes have occurred.
- **Runtime Isolation**: Test requests mutate `data/runtime-test/store.json`, keeping development data in `data/runtime/store.json` intact.

### 3.2 `package.json` Scripts
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint"
}
```
- Note: There is currently no `"test"` script in `package.json`. Tests are executed directly via `npx playwright test ...`.

### 3.3 Execution Environment & Toolchain Paths
- **OS**: Windows (PowerShell)
- **Node.js**: v22.20.0
- **npm / npx**: 10.9.3
- **Git**: 2.56.1.windows.1
- **Critical PATH Configuration**:
  The environment does NOT have Node at `C:\Program Files\nodejs`. Instead, Node.js and npm are located at:
  ```powershell
  $env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH;
  ```
  All subsequent agents must prepend this path when executing Node, npm, npx, or git commands.

---

## 4. `MODEL_MOCK=1` Handling

The offline deterministic mock is cleanly integrated across the entire stack:

1. **Environment Flag Detection (`src/lib/env.ts`)**:
   - `getEnv().isMock` evaluates `process.env.MODEL_MOCK === "1" || process.env.MODEL_MOCK === "true"`.
   - `getLiveApiKey()` returns `""` when `isMock` is true, bypassing the requirement for `GEMINI_API_KEY`.

2. **Model Client Branching (`src/lib/model/client.ts`)**:
   - In `callModel(opts)`:
     ```ts
     if (env.isMock) {
       const mockRes = await generateMockResponse({ ... });
       resultText = mockRes.text;
       inputTokens = mockRes.inputTokens;
       outputTokens = mockRes.outputTokens;
       elapsedMs = mockRes.ms;
     } else {
       // Live Gemini REST API call
     }
     ```
   - In `finally`, `addModelCall` records a `ModelCall` entry with `model: env.isMock ? 'mock-' + model : model`, accurate token counts, and elapsed milliseconds.

3. **Mock Response Generator (`src/lib/model/mock.ts`)**:
   - Supports all required purposes:
     - `purpose === "chat"`: Contextual responses based on user keywords and active system prompt. Special recognition of `"나에 대해 어떻게 생각해?"`.
     - `purpose === "rem-step"`: Deterministic insights for consolidate and dream modes.
     - `purpose === "rem-proposal"`: Valid JSON proposal string with `summary` and `proposedPrompt`.
     - `purpose === "compare"`: Comparison responses for persona vs baseline.

---

## 5. Build & Compilation Status

1. **TypeScript Type Check (`npx tsc --noEmit`)**:
   - **Result**: PASS (0 errors, returncode 0).
   - `tsconfig.json` targets `ES2017`, `moduleResolution: "bundler"`, `paths: { "@/*": ["./src/*"] }`.

2. **Production Build (`npm run build`)**:
   - **Result**: PASS (returncode 0).
   - Generates 23 static/dynamic routes using Next.js 16.4.5 Turbopack.
   - Non-fatal warning: Dynamic filesystem access at `src/lib/store.ts:8:21` (`REM_RUNTIME_DIR`).

---

## 6. Current Test Execution Status & Gap Summary

| Test Spec | Status | Passed | Failed | Primary Reason / Error |
| :--- | :---: | :---: | :---: | :--- |
| `tests/api-chat.spec.ts` | **PASS** | 16 | 0 | All chat, state, and concurrency lock tests pass |
| `tests/api-story.spec.ts` | **PASS** | 17 | 0 | Story splitting and verbatim preservation pass |
| `tests/challenger-m1-2.spec.ts` | **PASS** | 11 | 0 | Mock discrimination and stress tests pass |
| `tests/api-rem.spec.ts` | **FAIL** | 0 | 16 | Missing `/api/rem/{start,status,stop}` (HTTP 404) |
| `tests/api-proposal.spec.ts` | **FAIL** | 0 | 14 | Missing `/api/proposals/[id]/{approve,reject}`, `/api/persona/revert`, `/api/session/reset` (HTTP 404) |
| `tests/api-debug.spec.ts` | **PARTIAL** | 3 | 7 | Missing `/api/debug/calls` and `/api/debug/metrics` (HTTP 404) |
| `scripts/verify-rem.mjs` | **MISSING** | — | — | Script not yet created |

### Summary of Missing Components Needed for Full Verification
1. **REM Engine (`src/lib/rem/`)**:
   - `types.ts` (`RemMode`, `RemContext`)
   - `registry.ts` (mode registry supporting `"consolidate"` and `"dream"`)
   - `runner.ts` (execution lifecycle, active run state, node capping to 12, insight persistence, proposal invocation, graceful stop, error handling)
   - `proposal.ts` (insight aggregation to proposal)
   - `modes/consolidate.ts`
   - `modes/dream.ts`
2. **Persona Management (`src/lib/persona.ts`)**:
   - Functions for proposal approval, version increment, persona rollback, and active prompt resolution.
3. **API Routes**:
   - `src/app/api/rem/start/route.ts`
   - `src/app/api/rem/status/route.ts`
   - `src/app/api/rem/stop/route.ts`
   - `src/app/api/proposals/[id]/approve/route.ts`
   - `src/app/api/proposals/[id]/reject/route.ts`
   - `src/app/api/persona/revert/route.ts`
   - `src/app/api/session/reset/route.ts`
   - `src/app/api/debug/calls/route.ts`
   - `src/app/api/debug/metrics/route.ts`
4. **Verification Script**:
   - `scripts/verify-rem.mjs` (verifying responses before/after REM and recording to `docs/rem-verification.md`).
