# Scope: Milestone 3 — REM System Core & API Routes (Stages 3 & 5)

## Architecture & File Boundaries
Milestone 3 implements the REM framework and API routes.
Exclusive write ownership:
- `src/lib/rem/types.ts`
- `src/lib/rem/registry.ts`
- `src/lib/rem/modes/consolidate.ts`
- `src/lib/rem/modes/dream.ts`
- `src/lib/rem/proposal.ts`
- `src/lib/rem/runner.ts`
- `src/app/api/rem/start/route.ts`
- `src/app/api/rem/status/route.ts`
- `src/app/api/rem/stop/route.ts`

Do NOT touch files outside these boundaries.
For cross-module dependencies, refer to `docs/codebase-graph.md` or query `npx engram explain "<symbol>"`.
Milestone 1 has already implemented `src/lib/persona.ts` and proposal lifecycle endpoints.

## Requirements
1. `src/lib/rem/types.ts`:
   - Interfaces for `RemMode`, `RemContext` (`ask`, `markReading`, `shouldStop`, `sessionId`, `nodes`), `RemRun`, `Insight`.
2. `src/lib/rem/registry.ts`:
   - Pluggable mode registry: `registerMode(mode: RemMode)`, `getMode(id: RemModeId): RemMode | undefined`, `listModes()`.
   - Pre-registers `consolidate` and `dream`.
3. `src/lib/rem/modes/consolidate.ts`:
   - Mode ID: `"consolidate"`.
   - Sequential memory node processing.
   - Passes accumulated insights to each subsequent prompt step.
   - Temperature: 0.4. Purpose: `"rem-step"`.
4. `src/lib/rem/modes/dream.ts`:
   - Mode ID: `"dream"`.
   - Random pairwise selection of memory nodes.
   - Generates associative insights.
   - Temperature: 1.1. Purpose: `"rem-step"`.
5. `src/lib/rem/proposal.ts`:
   - `generateProposal(insights: Insight[], activePersona: PersonaVersion, sessionId?: string): Promise<PersonaProposal>`
   - Calls model client with `purpose: "rem-proposal"`, temperature 0.5.
   - Parses JSON `{ summary, proposedPrompt }` and creates pending `PersonaProposal` linked to `activePersona.version` as `baseVersion`.
6. `src/lib/rem/runner.ts`:
   - Background execution engine managing asynchronous run lifecycle.
   - `startRem(options: { mode: RemModeId; sessionId?: string; nodeLimit?: number })`:
     - Checks if a run is already active for this session or globally (`store.runs.some(r => r.status === "running")`).
     - If active, throws error / returns 409.
     - Node selection: strictly cap nodes to 12 (e.g. `store.nodes.filter(...).slice(-12)`).
     - Generates `runId` (e.g. `rem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`).
     - Saves initial `RemRun` with `status: "running"`, `currentNodeIds = selectedNodes.map(n => n.id)`.
     - Returns `runId` synchronously while triggering execution asynchronously in background.
     - While running, `/api/chat` automatically blocks and returns 409 Conflict.
     - Tracks reading nodes via `markReading(nodeId)`.
     - On completion: executes `proposal.ts`, appends insights and proposal to store, marks run `status: "done"`, `completedAt: new Date().toISOString()`.
     - On error: updates run `status: "error"`, `error: err.message`.
     - Supports cancellation via `stopRem(runId)`: marks active run `status: "stopped"`.
7. Next.js App Router API Handlers:
   - `POST /api/rem/start`:
     - Body: `{ mode?: RemModeId, sessionId?: string }`.
     - If invalid mode or body, return 400.
     - If active run in progress, return 409 Conflict `{ error: "REM is already running" }`.
     - Otherwise, starts run, returns 202 Accepted `{ runId }`.
   - `GET /api/rem/status?runId=`:
     - Query: `runId`. Call `await connection()` from `next/server` to assert dynamic execution.
     - If missing `runId`, return 400.
     - If run not found, return 404.
     - Return 200 JSON of `RemRun`.
   - `POST /api/rem/stop`:
     - Body: `{ runId: string }`.
     - If missing `runId`, return 400.
     - If run not found, return 404.
     - Stops active run, returns 200 `{ ok: true }`.

8. Automated Test Verification:
   - `tests/api-rem.spec.ts` must pass 100% under `MODEL_MOCK=1`.
   - `tests/api-proposal.spec.ts` must pass 100% under `MODEL_MOCK=1`.
   - Run tests with PowerShell:
     `$env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH; $env:MODEL_MOCK="1"; npx playwright test tests/api-rem.spec.ts tests/api-proposal.spec.ts`

9. Sub-Orchestrator Iteration Loop:
   a. Spawn 3 Explorers (teamwork_explorer)
   b. Spawn 1 Worker (teamwork_worker) with exclusive file write boundaries and mandatory integrity warning verbatim
   c. Spawn 2 Reviewers (teamwork_reviewer)
   d. Spawn 2 Challengers (teamwork_challenger)
   e. Spawn 1 Forensic Auditor (teamwork_auditor)
   f. Check Gate (record in GATE_STATUS.md)
   Write handoff.md and notify parent.
