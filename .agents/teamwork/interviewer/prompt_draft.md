Implement the backend architecture and API endpoints specified in docs/backend-plan.md (Stages 3 through 6), reflecting, committing, and pushing all changes on the backend branch to the remote repository.

Working directory: C:\Users\User\.gemini\antigravity\scratch\rem-dream
Integrity mode: development

Reference material: docs/backend-plan.md

## Requirements

### R1. REM system core and execution engine (Stages 3 & 5)
Implement the REM framework in `src/lib/rem/` including type definitions (`types.ts`), mode registry (`registry.ts`), execution runner (`runner.ts`), proposal generator (`proposal.ts`), and REM modes: consolidate mode (`modes/consolidate.ts`) and dream mode (`modes/dream.ts`). Ensure REM execution manages active run state, locks chat during runs (returning 409 on `/api/chat`), and enforces node limits.

### R2. REM and lifecycle API routes (Stages 3 & 4)
Implement Next.js App Router API handlers for REM control (`/api/rem/start`, `/api/rem/status`, `/api/rem/stop`) and persona/proposal lifecycle (`/api/proposals/[id]/approve`, `/api/proposals/[id]/reject`, `/api/persona/revert`, `/api/session/reset`). Approved proposals must update `activePersona` and integrate with `src/lib/persona.ts`.

### R3. Debug endpoints and telemetry (Stage 6)
Implement debug endpoints `/api/debug/calls` and `/api/debug/metrics` to expose `ModelCall` records, token counts, latency metrics, and error rates recorded by the model client.

### R4. Git branch and remote push constraints
All modifications must be made and committed exclusively to the `backend` branch in `C:\Users\User\.gemini\antigravity\scratch\rem-dream`. Upon completion, push all commits to the remote repository on the `backend` branch (`origin backend`).

## Acceptance Criteria

### Automated Test Verification
- [ ] Automated API test suites run and pass under `MODEL_MOCK=1` without external API dependencies (`tests/api-rem.spec.ts` and `tests/api-proposal.spec.ts`).
- [ ] The REM verification script (`scripts/verify-rem.mjs`) executes successfully and records question/response comparisons.
- [ ] `npm run build` completes without TypeScript or compilation errors.

### Functional Endpoints
- [ ] `POST /api/rem/start` starts a REM run and returns 202 with `runId`, returning 409 if a run is already active.
- [ ] `GET /api/rem/status?runId=` returns the current status and details of the specified `RemRun`.
- [ ] `POST /api/rem/stop` cancels an active REM run gracefully.
- [ ] `POST /api/proposals/[id]/approve` promotes a proposal to `PersonaVersion` and updates `activePersona`.
- [ ] `POST /api/proposals/[id]/reject` updates proposal status to rejected without altering `activePersona`.
- [ ] `POST /api/persona/revert` updates `activePersona` to the specified version.
- [ ] `POST /api/session/reset` resets the session memory nodes, insights, and proposals, reverting persona to initial version.
- [ ] `GET /api/debug/calls` returns recorded model call logs, and `GET /api/debug/metrics` returns aggregated system metrics.

### Git & Remote
- [ ] All commits are made on the `backend` branch without modifying or merging into other branches.
- [ ] Commits on the `backend` branch are pushed to the remote repository (`origin backend`).