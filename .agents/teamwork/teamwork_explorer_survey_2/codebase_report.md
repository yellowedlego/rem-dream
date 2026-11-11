# Codebase Exploration Survey Report

**Project**: rem-dream (꿈 시스템 백엔드 아키텍처)  
**Date**: 2026-11-11  
**Target Stages**: Stages 3 through 6 (`docs/backend-plan.md`, `ORIGINAL_REQUEST.md`)  
**Investigator**: Codebase Exploration Agent (`teamwork_explorer_survey_2`)

---

## 1. Executive Summary

This report surveys the current implementation state of the `rem-dream` repository with respect to the backend roadmap specified in `docs/backend-plan.md` (Stages 3 through 6).

- **Current Repository State**: The project is checked out on local branch `backend` (commit `8590b78`, aligned with `origin/master`). The working tree is clean.
- **Stage 1 & Stage 2**: Core store persistence (`src/lib/store.ts`), Gemini model client (`src/lib/model/client.ts`), mock generator (`src/lib/model/mock.ts`), chat endpoint (`/api/chat`), and story preprocessing (`/api/story`, `/src/lib/story/`) are fully implemented and verified passing tests (`tests/api-chat.spec.ts` passes 16/16 tests).
- **Stage 3 & Stage 5 (REM System)**: Missing. Directory `src/lib/rem/` does not exist. API endpoints `/api/rem/start`, `/api/rem/status`, and `/api/rem/stop` are missing. Script `scripts/verify-rem.mjs` is missing.
- **Stage 4 (Proposals & Persona Lifecycle)**: Missing. `src/lib/persona.ts` is not implemented. API endpoints `/api/proposals/[id]/approve`, `/api/proposals/[id]/reject`, `/api/persona/revert`, and `/api/session/reset` are missing.
- **Stage 6 (Debug & Telemetry)**: Partially implemented. Model calls are recorded in store (`store.calls`), but debug endpoints `/api/debug/calls` and `/api/debug/metrics` are missing (`/api/debug/reset-all` exists).
- **Tooling Environment**: Git is located at `C:\Program Files\Git\cmd\git.exe`, Node.js at `C:\Users\User\nodejs\node.exe` (v22.20.0), npm at `C:\Users\User\nodejs\npm.cmd` (10.9.3). Commands must ensure `$env:PATH` includes these directories.

---

## 2. Git Repository & Remote Configuration

### 2.1 Branch & Commit Status
- **Current Branch**: `backend` (HEAD is at `8590b78 예시 기억(모델 없이 별자리·내 AI 보기)을 master에 합침 (feature/demo)`).
- **Working Tree**: Clean (`nothing to commit, working tree clean`).
- **Origin Remote**: `git@github.com:yellowedlego/rem-dream.git` (fetch & push).
- **Remote Tracking**: `backend` branch currently has **no upstream configured** (`fatal: no upstream configured for branch 'backend'`). Remote branch `origin/backend` does not exist yet (remote branches include `origin/master`, `origin/backend/stage-2-chat`, `origin/backend/stage-2-fixes`, etc.).
- **Push Requirement**: Pushing will require `git push -u origin backend`.

---

## 3. Codebase File Inventory & Status Matrix

| Component / File Path | Current Status | Notes & Requirements |
|---|---|---|
| **Types & Core Store** | | |
| `src/lib/types.ts` | **Fully Implemented** | Contains `MemoryNode`, `Story`, `RemModeId`, `Insight`, `PersonaVersion`, `Meaning`, `RemRun`, `PersonaProposal`, `ModelPurpose`, `ModelCall`, `Store`. Matches plan. |
| `src/lib/store.ts` | **Fully Implemented** | Atomic file writes with mutex queue, `readStore`, `updateStore`, `addNode`, `addModelCall`, `getActivePersona`, `getActiveRun`, `resetStore`, orphan run recovery on startup. |
| `src/lib/env.ts` | **Fully Implemented** | Environment variable parser (`GEMINI_API_KEY`, `GEMINI_MODEL`, `MODEL_MOCK`). |
| `src/lib/records.ts` | **Fully Implemented** | Provides `removeSession(store, sessionId)` and `sessionLastAt(store)`. |
| **Model Client & Mock** | | |
| `src/lib/model/client.ts` | **Fully Implemented** | `callModel`, `callModelJson`, token estimation, API key scrubbing, automatic call logging via `addModelCall`. |
| `src/lib/model/mock.ts` | **Fully Implemented** | Mock handler supports `"chat"`, `"compare"`, `"rem-step"` (consolidate & dream modes), `"rem-proposal"` (returns `{ summary, proposedPrompt }`). |
| **Persona Lifecycle** | | |
| `src/lib/persona.ts` | **MISSING** | Needs creation. Must provide `approveProposal`, `rejectProposal`, `revertPersona`, `resetSession`, `getActivePersona`. |
| **REM Engine (`src/lib/rem/`)** | | |
| `src/lib/rem/types.ts` | **MISSING** | Needs creation. Define `RemMode` interface and `RemContext` (`ask`, `markReading`, `shouldStop`, `sessionId`, `nodes`). |
| `src/lib/rem/registry.ts` | **MISSING** | Needs creation. Mode registry holding `"consolidate"` and `"dream"`. |
| `src/lib/rem/runner.ts` | **MISSING** | Needs creation. Execution lifecycle: run tracking, chat lock enforcement, 12-node capping, step execution, cancellation, error recovery, saving insights & generating/saving proposals. |
| `src/lib/rem/proposal.ts` | **MISSING** | Needs creation. Formats insights + active persona -> prompts model with purpose `"rem-proposal"` -> creates `PersonaProposal`. |
| `src/lib/rem/modes/consolidate.ts` | **MISSING** | Needs creation. Mode 1: Step through nodes, pass previous insight to next step context, produce `Insight[]`. |
| `src/lib/rem/modes/dream.ts` | **MISSING** | Needs creation. Mode 2: Pairwise node associations, high temperature (1.0+), produce `Insight[]` with `mode: "dream"`. |
| **API Endpoints** | | |
| `src/app/api/chat/route.ts` | **Implemented** | Working. Already includes REM concurrency check (`409 Conflict`), uses `getActivePersona()`, records `MemoryNode`. |
| `src/app/api/state/route.ts` | **Implemented** | Working. Returns session or global state (`nodes`, `insights`, `personas`, `proposals`, `activePersona`, `activeRun`, `stories`, `meanings`). |
| `src/app/api/rem/start/route.ts` | **MISSING** | Needs creation. `POST`: accepts `{ sessionId, mode, temperature? }`, returns 202 `{ runId }`. Validates mode (400), checks concurrent active run (409), caps nodes to 12. |
| `src/app/api/rem/status/route.ts` | **MISSING** | Needs creation. `GET ?runId=`: returns `RemRun` (200), missing runId (400), not found (404). |
| `src/app/api/rem/stop/route.ts` | **MISSING** | Needs creation. `POST`: accepts `{ runId }`, stops active run, returns 200 `{ ok: true }`. Missing runId (400), not found (404). |
| `src/app/api/proposals/[id]/approve/route.ts` | **MISSING** | Needs creation. `POST`: approves pending proposal, creates new `PersonaVersion`, updates `activePersona`, returns 200 `{ ok: true, activePersona }`. Invalid id (400), not found (404), already approved (400). |
| `src/app/api/proposals/[id]/reject/route.ts` | **MISSING** | Needs creation. `POST`: marks proposal rejected, returns 200 `{ ok: true }`. Invalid id (400), not found (404). |
| `src/app/api/persona/revert/route.ts` | **MISSING** | Needs creation. `POST`: accepts `{ version }`, sets `activePersona`, returns 200 `{ ok: true, activePersona }`. Invalid version (400), not found (404). |
| `src/app/api/session/reset/route.ts` | **MISSING** | Needs creation. `POST`: accepts `{ sessionId }`, clears session nodes/insights/proposals, resets `activePersona = 1`, returns 200 `{ ok: true }`. Missing sessionId (400). |
| `src/app/api/debug/calls/route.ts` | **MISSING** | Needs creation. `GET`: returns `ModelCall[]` or `{ calls: ModelCall[] }`. Max 200 buffer. |
| `src/app/api/debug/metrics/route.ts` | **MISSING** | Needs creation. `GET`: returns counts (`nodesCount`, `insightsCount`, `proposalsCount`, `runsCount`, `callsCount`), token totals (`totalInputTokens`, `totalOutputTokens`, `totalTokens`), `averageLatencyMs` (0 if no calls), `errorCount`. |
| `src/app/api/debug/reset-all/route.ts` | **Implemented** | Working. Resets store to seed and clears uploads. |
| **Scripts & Tests** | | |
| `tests/api-rem.spec.ts` | **Existing Test Suite** | Comprehensive Playwright tests for REM lifecycle, concurrency, node cap, locking, insights generation, side-by-side mode comparisons. |
| `tests/api-proposal.spec.ts` | **Existing Test Suite** | Comprehensive Playwright tests for proposal approve/reject, persona revert, session reset, and prompt propagation to chat. |
| `tests/api-debug.spec.ts` | **Existing Test Suite** | Comprehensive Playwright tests for calls log and metrics aggregation. |
| `scripts/verify-rem.mjs` | **MISSING** | Needs creation. Verification script executing REM sleep, asking verification questions ("나에 대해 어떻게 생각해?"), and recording comparison answers. |

---

## 4. Shared State, Stores & Concurrency Mechanics

### 4.1 Persistence Model (`src/lib/store.ts`)
- **Storage Location**:
  - Seed store: `data/store.json` (tracked in git, read-only template).
  - Runtime store: `data/runtime/store.json` (or `data/runtime-test/store.json` during tests via `process.env.REM_RUNTIME_DIR`).
- **Atomic File Writing**:
  - Every update runs through an in-memory sequential promise queue (`writeQueue`).
  - Writes to a temporary file (`store.json.tmp.<pid>.<timestamp>.<random>`) and renames to target with retry logic on Windows file locks (`EPERM`, `EBUSY`, `EACCES`).
- **Crash Recovery**:
  - `recoverDanglingRuns()` runs during `doEnsureStore()`. Any run left with `status: "running"` is automatically updated to `status: "error"` with message `"Server restarted while REM was running"`.

### 4.2 REM Active Run & Chat Concurrency Lock
- **Active Run Lifecycle**:
  - A run is active when `status === "running"`.
  - When `POST /api/rem/start` is called, it checks if any run in `store.runs` is already `running`. If so, returns `409 Conflict`.
  - Concurrently, `POST /api/chat` (lines 67-72) checks `store.runs?.some(r => r.status === "running" && (!r.sessionId || r.sessionId === sessionId))`. If active, chat rejects requests with `409 Conflict ("REM is in progress. Input is blocked.")`.
  - Once the run transitions to `"done"`, `"stopped"`, or `"error"`, chat unblocks immediately.
- **Cancellation**:
  - `POST /api/rem/stop` requires setting run status to `"stopped"` and interrupting the runner before its next model step. An in-memory cancellation map (e.g., `Set<string>` of stopped `runId`s or `AbortController`) combined with store state checks in `shouldStop()` will provide graceful stoppage.

### 4.3 Persona State & Versioning
- **Current State**:
  - `store.activePersona: number` stores the integer version number currently in effect (default is 2 in seed, fallback to 1).
  - `store.personas: PersonaVersion[]` contains all approved versions.
- **Approval Flow**:
  - Proposal is approved -> new version number `N = Math.max(...versions) + 1` created.
  - New `PersonaVersion` object appended to `store.personas` with `systemPrompt = proposal.proposedPrompt`.
  - `store.activePersona = N`.
  - Subsequent calls to `/api/chat` call `getActivePersona()`, which immediately retrieves version `N`.
- **Reversion Flow**:
  - `POST /api/persona/revert` updates `store.activePersona = version` (does not create a new version).
- **Session Reset Flow**:
  - `POST /api/session/reset` removes session-specific records (nodes, insights, proposals for that `sessionId`) and resets `store.activePersona = 1`.

---

## 5. Implementation Roadmap & File Creation Plan

### Group 1: Persona Module (`src/lib/persona.ts`)
Implement:
1. `getActivePersona(store?: Store): Promise<PersonaVersion>`
2. `approveProposal(proposalId: number): Promise<{ ok: boolean; activePersona: number }>`
3. `rejectProposal(proposalId: number): Promise<{ ok: boolean }>`
4. `revertPersona(version: number): Promise<{ ok: boolean; activePersona: number }>`
5. `resetSession(sessionId: string): Promise<{ ok: boolean }>`

### Group 2: REM System Engine (`src/lib/rem/`)
1. `src/lib/rem/types.ts`: `RemMode`, `RemContext`.
2. `src/lib/rem/registry.ts`: Registry for `"consolidate"` and `"dream"`.
3. `src/lib/rem/modes/consolidate.ts`: Iterative node consolidation.
4. `src/lib/rem/modes/dream.ts`: Random pairwise associations with high temperature.
5. `src/lib/rem/proposal.ts`: Persona proposal generator via model call with `purpose: "rem-proposal"`.
6. `src/lib/rem/runner.ts`: Asynchronous runner managing node capping (12 max), state persistence, step execution, cancellation signaling, insight creation, and proposal creation.

### Group 3: API Route Handlers
1. REM Routes:
   - `src/app/api/rem/start/route.ts` (POST)
   - `src/app/api/rem/status/route.ts` (GET)
   - `src/app/api/rem/stop/route.ts` (POST)
2. Proposal & Persona Lifecycle Routes:
   - `src/app/api/proposals/[id]/approve/route.ts` (POST)
   - `src/app/api/proposals/[id]/reject/route.ts` (POST)
   - `src/app/api/persona/revert/route.ts` (POST)
   - `src/app/api/session/reset/route.ts` (POST)
3. Debug Routes:
   - `src/app/api/debug/calls/route.ts` (GET)
   - `src/app/api/debug/metrics/route.ts` (GET)

### Group 4: Scripts & Verification
1. `scripts/verify-rem.mjs`: Script to run baseline chat -> REM execution -> post-REM chat -> compare answers to verification question -> record to `docs/rem-verification.md`.

---

## 6. Execution & Verification Environment

When executing builds, tests, and git operations in this workspace:
- **Git Binary**: `& "C:\Program Files\Git\cmd\git.exe"`
- **Node.js & npm**: `& "C:\Users\User\nodejs\node.exe"`, `& "C:\Users\User\nodejs\npm.cmd"`
- **Environment Prep**:
  ```powershell
  $env:PATH = "C:\Users\User\nodejs;C:\Program Files\Git\cmd;" + $env:PATH
  ```
- **Test Commands**:
  - `npx playwright test tests/api-rem.spec.ts`
  - `npx playwright test tests/api-proposal.spec.ts`
  - `npx playwright test tests/api-debug.spec.ts`
  - `npm run build`
