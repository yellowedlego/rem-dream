# Handoff Report: Specification Mining for Stages 3 through 6

## 1. Observation

1. **Source Documents and Plans**:
   - `docs/backend-plan.md` lines 49–99: Defines original draft interfaces for `RemRun`, `PersonaProposal`, `ModelCall`, `Store`. Lines 143–151: Specifies API routes for Stage 3 (`/api/rem/{start,status,stop}`), Stage 4 (`/api/proposals/[id]/{approve,reject}`, `/api/persona/revert`, `/api/session/reset`), and Stage 6 (`/api/debug/{calls,metrics,reset-all}`). Lines 226–236: Specifies `RemMode` and `RemContext` interface contracts.
   - `docs/prompts.md` §4, §5, §6: Details prompt templates, temperature settings (consolidate: 0.4, dream: 1.1, proposal: 0.5), response schemas, and server validation rules.
   - `ORIGINAL_REQUEST.md` lines 14–24: Establishes R1 (REM framework & execution engine), R2 (REM & lifecycle API routes), R3 (Debug endpoints & telemetry), R4 (backend git branch & push constraints).
   - `docs/persona-architecture.md`: Explores a future 3-layer architecture; line 3 notes `상태: 설계안 (구현 전)` and that existing tests adhere to the single `systemPrompt` / `proposedPrompt` contract.

2. **Existing Implementation Status**:
   - `src/lib/types.ts`: Already contains type definitions for `MemoryNode`, `Insight`, `PersonaVersion`, `RemRun`, `PersonaProposal`, `ModelCall`, `Store`.
   - `src/lib/store.ts`: Implements atomic file operations (`updateStore`, `readStore`), recovery of dangling runs (`recoverDanglingRuns`, status "running" -> "error"), `addNode`, `addModelCall`, and `resetStore`.
   - `src/lib/records.ts`: Implements `removeSession(store, sessionId)` clearing session nodes, stories, meanings, profiles, mails, insights, proposals, and runs.
   - `src/app/api/chat/route.ts` lines 67–72: Implements chat locking:
     ```typescript
     const isRemRunning = store.runs?.some(
       (r) => r.status === "running" && (!r.sessionId || r.sessionId === sessionId)
     );
     if (isRemRunning) {
       return NextResponse.json({ error: "REM is in progress. Input is blocked." }, { status: 409 });
     }
     ```
   - `src/lib/model/mock.ts` lines 81–112: Implements mock behavior for `rem-step` and `rem-proposal` (`MODEL_MOCK=1`).
   - `src/lib/rem/` and `src/lib/persona.ts`: Do not currently exist and need to be created in subsequent implementation stages.
   - `src/app/api/rem/*`, `src/app/api/proposals/*`, `src/app/api/persona/*`, `src/app/api/session/reset`, `src/app/api/debug/calls`, `src/app/api/debug/metrics`: Do not exist yet.

3. **Authoritative Automated Test Suites**:
   - `tests/api-rem.spec.ts`: Tests `POST /api/rem/start` (202 Accepted, 400 validation, 409 conflict, 12-node cap), `GET /api/rem/status` (200, 400, 404), `POST /api/rem/stop` (200, 400, 404), input locking during sleep (409 on `/api/chat`), and insight generation.
   - `tests/api-proposal.spec.ts`: Tests `POST /api/proposals/[id]/approve` (200, 400, 404, version increment, persona prompt propagation to chat), `POST /api/proposals/[id]/reject` (200, 400, 404), `POST /api/persona/revert` (200, 400, 404), and `POST /api/session/reset` (200, 400, node cleanup, activePersona reset to 1).
   - `tests/api-debug.spec.ts`: Tests `GET /api/debug/calls` (200, schema verification, 200 items buffer cap), `GET /api/debug/metrics` (200, all non-negative counts, token summation equality, divide-by-zero protection on latency).

4. **Git Workspace**:
   - Current branch is `backend` in `C:\Users\User\.gemini\antigravity\scratch\rem-dream`. Working tree is clean. Git binary located at `C:\Program Files\Git\cmd\git.exe`.

## 2. Logic Chain

1. **Interface Contract Alignment**:
   - `tests/api-rem.spec.ts` and `tests/api-proposal.spec.ts` directly import types from `src/lib/types.ts` (`RemRun`, `Insight`, `PersonaProposal`, `PersonaVersion`, `MemoryNode`).
   - The test assertions require `proposedPrompt` (string), `summary` (string), `status: "pending" | "approved" | "rejected"` on proposals, and `systemPrompt` (string) on `PersonaVersion`.
   - Therefore, the Stage 3-6 implementation must conform exactly to `src/lib/types.ts` and the contracts exercised by the existing test suites.

2. **Runner & Chat Concurrency**:
   - `src/app/api/chat/route.ts` already queries `store.runs` for `status === "running"`.
   - When `runner.ts` persists a `RemRun` with `status: "running"`, `/api/chat` automatically rejects incoming messages with 409 Conflict.
   - When the run concludes (`status: "done"`, `"stopped"`, or `"error"`), the lock is automatically released without requiring extra IPC.
   - To support asynchronous polling, `POST /api/rem/start` writes the run record with `status: "running"` synchronously, triggers the execution promise in the background, and immediately returns `202 Accepted { runId }`.

3. **Node Capping & Mode Execution**:
   - `tests/api-rem.spec.ts` line 236 asserts `finalRun.currentNodeIds.length <= 12`.
   - The runner must select `store.nodes.filter(n => n.sessionId === sessionId).slice(-12)`.
   - In `consolidate` mode, nodes are sequenced with accumulated insights passed to each next prompt step (NREM analogy).
   - In `dream` mode, nodes are paired at high temperature (1.1) to discover loose connections (REM analogy).

4. **Lifecycle & Persona Evolution**:
   - `src/lib/persona.ts` must export `getActivePersona`, `approveProposal`, `rejectProposal`, `revertPersona`, and `resetSession`.
   - On approval: proposal status becomes `"approved"`, `decidedAt` is set, a new `PersonaVersion` is appended (`version: Math.max(...personas) + 1`, `systemPrompt = proposal.proposedPrompt`), and `store.activePersona` is set to the new version.
   - On reset: `removeSession` removes session-bound data, uploads are cleaned, and `store.activePersona` is reset to 1.

5. **Telemetry & Next.js 16 Dynamic Routes**:
   - Next.js 16 route handlers reading files or store with `cacheComponents: true` require calling `await connection()` from `next/server` at the beginning of GET handlers (`/api/rem/status`, `/api/debug/calls`, `/api/debug/metrics`).
   - In `/api/debug/metrics`, `averageLatencyMs` must guard against zero calls (`callsCount === 0 ? 0 : ...`).

## 3. Caveats

- **Persona Architecture Evolution**: `docs/persona-architecture.md` proposes a 3-layer system with items/notes/styles. However, the existing automated tests (`tests/api-proposal.spec.ts`) strictly test the Stage 4 single-prompt contract (`proposedPrompt` -> `systemPrompt`). The implementation team should adhere to the single-prompt contract for Stages 3–6 compatibility unless the test suite is refactored.
- **Node Selection Heuristic**: Selecting the most recent 12 nodes (`slice(-12)`) satisfies the test constraint `currentNodeIds.length <= 12`.
- **Read-Only Task**: In accordance with the system constraints, no source files were modified, created, or deleted during this specification mining pass.

## 4. Conclusion

A comprehensive, fully validated specification for Stages 3 through 6 has been extracted and documented in:
`C:\Users\User\.gemini\antigravity\scratch\rem-dream\.agents\teamwork\teamwork_spec_miner_survey_1\spec_report.md`

The report covers:
- Complete type schemas for REM (`RemRun`, `RemMode`, `RemStage`, `RemContext`, `PersonaProposal`, `PersonaVersion`, `ModelCall`, `DebugMetrics`).
- Mode Registry and concrete mode algorithms (`consolidate`, `dream`).
- Execution runner engine, background execution, cancellation, and chat locking via HTTP 409.
- Proposal generator prompt, schema, and store persistence.
- Complete specifications for all 9 API routes with status codes (200, 202, 400, 404, 409), validation rules, and error handling.
- Persona lifecycle integration (`src/lib/persona.ts`).
- Verification script specification (`scripts/verify-rem.mjs`).
- Complete discovery table (17 features) and edge cases table (20 edge cases).

## 5. Verification Method

To verify the observations and conclusions:
1. Inspect the generated specification document:
   `view_file C:\Users\User\.gemini\antigravity\scratch\rem-dream\.agents\teamwork\teamwork_spec_miner_survey_1\spec_report.md`
2. Check the existing test suites confirming the exact API contracts:
   - `tests/api-rem.spec.ts`
   - `tests/api-proposal.spec.ts`
   - `tests/api-debug.spec.ts`
   - `tests/challenger-m1-2.spec.ts`
3. Invalidation condition: If any endpoint path, status code, or schema in `spec_report.md` differs from what `tests/api-rem.spec.ts`, `tests/api-proposal.spec.ts`, or `tests/api-debug.spec.ts` expect, the report should be adjusted.
