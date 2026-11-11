# Project: REM-Dream Backend Architecture (Stages 3 through 6)

## Architecture
The system integrates an autonomous background cognitive framework (REM) with dynamic persona evolution, chat locking, session resets, and debug telemetry.
The architecture consists of:
- **Codebase Knowledge Graph (`docs/codebase-graph.md`, `docs/codebase-graph.json`)**:
  - Generated via `graphifyy` / `@sentropic/engram`.
  - Maps 1,223 nodes, 2,566 edges across 60 communities, and 81 execution flows.
  - Subagents MUST reference `docs/codebase-graph.md` or query `npx engram explain "<symbol>"` for dependency resolution.
- **REM Core Engine (`src/lib/rem/`)**:
  - `types.ts`: Interface definitions for `RemMode`, `RemContext`, `RemRun`, `Insight`, etc.
  - `registry.ts`: Mode registration and lookup (`consolidate`, `dream`).
  - `modes/consolidate.ts`: Sequential memory node synthesis (temp 0.4) passing accumulated insights.
  - `modes/dream.ts`: Associative pair-wise synthesis (temp 1.1) creating emergent insights.
  - `runner.ts`: Background execution lifecycle, node capping (12 max), chat locking, active run tracking.
  - `proposal.ts`: Persona proposal synthesis from insights (`purpose: "rem-proposal"`).
- **Persona Lifecycle (`src/lib/persona.ts`)**:
  - Helper functions for proposal approval (incrementing version and updating activePersona), rejection, reversion, and session resets. (COMPLETED in M1)
- **Next.js App Router API Handlers (`src/app/api/`)**:
  - REM: `/api/rem/start` (202), `/api/rem/status` (200), `/api/rem/stop` (200).
  - Proposals: `/api/proposals/[id]/approve` (200), `/api/proposals/[id]/reject` (200). (COMPLETED in M1)
  - Persona: `/api/persona/revert` (200). (COMPLETED in M1)
  - Session: `/api/session/reset` (200). (COMPLETED in M1)
  - Debug: `/api/debug/calls` (200), `/api/debug/metrics` (200). (COMPLETED in M2)
- **Verification Script (`scripts/verify-rem.mjs`)**:
  - Probing pre- and post-REM responses for persona evolution verification, outputting to `docs/rem-verification.md`. (M4)

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Persona Proposal Approval | `POST /api/proposals/[id]/approve` promotes proposal to `PersonaVersion`, updates `activePersona`, sets `decidedAt` | M1 | Survey (spec_miner_1, tests/api-proposal.spec.ts) |
| 2 | Persona Proposal Rejection | `POST /api/proposals/[id]/reject` marks proposal as rejected without updating `activePersona` | M1 | Survey (spec_miner_1, tests/api-proposal.spec.ts) |
| 3 | Persona Reversion | `POST /api/persona/revert` sets `activePersona` to specified version number | M1 | Survey (spec_miner_1, tests/api-proposal.spec.ts) |
| 4 | Session Reset | `POST /api/session/reset` removes session nodes, insights, proposals, runs, resets `activePersona = 1` | M1 | Survey (spec_miner_1, tests/api-proposal.spec.ts) |
| 5 | Persona Helper Library | `src/lib/persona.ts` exporting `getActivePersona`, `approveProposal`, `rejectProposal`, `revertPersona`, `resetSession` | M1 | Survey (codebase_report, backend-plan.md) |
| 6 | Debug Calls Endpoint | `GET /api/debug/calls` returning `ModelCall` records (up to 200) with dynamic connection assertion | M2 | Survey (spec_miner_1, tests/api-debug.spec.ts) |
| 7 | Debug Metrics Endpoint | `GET /api/debug/metrics` returning total calls, token sums, average latency (with 0-call guard), error count | M2 | Survey (spec_miner_1, tests/api-debug.spec.ts) |
| 8 | REM Types & Contracts | `src/lib/rem/types.ts` defining `RemMode`, `RemContext`, `RemRun`, `Insight`, etc. | M3 | Survey (spec_miner_1, backend-plan.md) |
| 9 | REM Mode Registry | `src/lib/rem/registry.ts` registering `consolidate` and `dream` modes with retrieval | M3 | Survey (spec_miner_1, backend-plan.md) |
| 10 | REM Consolidate Mode | `src/lib/rem/modes/consolidate.ts` sequential accumulation (temp 0.4) passing accumulated insight context | M3 | Survey (spec_miner_1, backend-plan.md) |
| 11 | REM Dream Mode | `src/lib/rem/modes/dream.ts` random pairwise associative generation (temp 1.1) | M3 | Survey (spec_miner_1, backend-plan.md) |
| 12 | REM Proposal Generator | `src/lib/rem/proposal.ts` synthesizes `PersonaProposal` via `purpose: "rem-proposal"` | M3 | Survey (spec_miner_1, backend-plan.md) |
| 13 | REM Execution Runner | `src/lib/rem/runner.ts` manages background execution, node capping (12 max), chat lock state, cancellation | M3 | Survey (spec_miner_1, backend-plan.md) |
| 14 | REM Start Endpoint | `POST /api/rem/start` returns 202 `{ runId }`, 409 if already running, 400 on invalid body | M3 | Survey (spec_miner_1, tests/api-rem.spec.ts) |
| 15 | REM Status Endpoint | `GET /api/rem/status?runId=` returns current `RemRun` details, 404 if not found, 400 if missing runId | M3 | Survey (spec_miner_1, tests/api-rem.spec.ts) |
| 16 | REM Stop Endpoint | `POST /api/rem/stop` cancels active run gracefully, returns 200 `{ ok: true }`, 404 if not found | M3 | Survey (spec_miner_1, tests/api-rem.spec.ts) |
| 17 | Chat Concurrency Lock | When REM is running, `POST /api/chat` returns 409 Conflict | M3 | Survey (spec_miner_1, tests/api-rem.spec.ts) |
| 18 | Verification Script | `scripts/verify-rem.mjs` probes persona change before/after REM, records comparisons in `docs/rem-verification.md` | M4 | Survey (explorer_3, backend-plan.md) |
| 19 | 100% E2E Test Verification | All automated tests in `tests/api-rem.spec.ts`, `tests/api-proposal.spec.ts`, `tests/api-debug.spec.ts` pass under `MODEL_MOCK=1` | M4 | Survey (explorer_3, ORIGINAL_REQUEST.md) |
| 20 | Git Commit & Push | Exclusively on `backend` branch, push commits to `origin backend` | M4 | Survey (ORIGINAL_REQUEST.md) |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Persona & Proposal Lifecycle | `src/lib/persona.ts`, `/api/proposals/[id]/approve`, `/api/proposals/[id]/reject`, `/api/persona/revert`, `/api/session/reset` | None | DONE |
| M2 | Debug Telemetry & Metrics | `/api/debug/calls`, `/api/debug/metrics` | None | DONE |
| M3 | REM Engine Core & APIs | `src/lib/rem/*`, `/api/rem/start`, `/api/rem/status`, `/api/rem/stop` | M1 | IN_PROGRESS |
| M4 | Verification Script, E2E Pass, Git Push | `scripts/verify-rem.mjs`, E2E test verification (Tiers 1-4), adversarial hardening (Tier 5), git commit & push to `origin backend` | M1, M2, M3, E2E Track | PLANNED |

## Interface Contracts
### `src/lib/persona.ts` ↔ API Handlers & Runner
- `getActivePersona(store?: Store): PersonaVersion`
- `approveProposal(proposalId: string): Promise<{ ok: boolean; activePersona: number }>`
- `rejectProposal(proposalId: string): Promise<{ ok: boolean }>`
- `revertPersona(version: number): Promise<{ ok: boolean; activePersona: number }>`
- `resetSession(sessionId: string): Promise<{ ok: boolean }>`

### `src/lib/rem/` ↔ API Handlers
- `runner.startRem(options: { mode: RemModeId; sessionId?: string; nodeLimit?: number }): Promise<string>` -> returns `runId`
- `runner.getRemStatus(runId: string): Promise<RemRun | null>`
- `runner.stopRem(runId: string): Promise<boolean>`
- `runner.isRemActive(sessionId?: string): Promise<boolean>`

### `src/lib/rem/modes/` ↔ `runner.ts`
- `RemMode.execute(context: RemContext): Promise<Insight[]>`
- `RemContext`: `{ ask: (prompt: string, options?: any) => Promise<string>; markReading: (nodeId: string) => void; shouldStop: () => boolean; sessionId?: string; nodes: MemoryNode[]; }`

## Code Layout
- `src/lib/persona.ts` (owned by M1 - DONE)
- `src/app/api/proposals/[id]/approve/route.ts` (owned by M1 - DONE)
- `src/app/api/proposals/[id]/reject/route.ts` (owned by M1 - DONE)
- `src/app/api/persona/revert/route.ts` (owned by M1 - DONE)
- `src/app/api/session/reset/route.ts` (owned by M1 - DONE)
- `src/app/api/debug/calls/route.ts` (owned by M2 - DONE)
- `src/app/api/debug/metrics/route.ts` (owned by M2 - DONE)
- `src/lib/rem/types.ts` (owned by M3)
- `src/lib/rem/registry.ts` (owned by M3)
- `src/lib/rem/modes/consolidate.ts` (owned by M3)
- `src/lib/rem/modes/dream.ts` (owned by M3)
- `src/lib/rem/proposal.ts` (owned by M3)
- `src/lib/rem/runner.ts` (owned by M3)
- `src/app/api/rem/start/route.ts` (owned by M3)
- `src/app/api/rem/status/route.ts` (owned by M3)
- `src/app/api/rem/stop/route.ts` (owned by M3)
- `scripts/verify-rem.mjs` (owned by M4)
- `docs/rem-verification.md` (owned by M4)
- `docs/codebase-graph.md` (read-only shared reference)
- `docs/codebase-graph.json` (read-only shared reference)
