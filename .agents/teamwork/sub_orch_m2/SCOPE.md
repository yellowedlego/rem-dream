# Scope: Milestone 2 — Debug Telemetry & Metrics (Stage 6)

## Architecture & Boundaries
Milestone 2 implements the debug telemetry endpoints exposing ModelCall records, token counts, latency metrics, and error rates.
Exclusive write ownership:
- `src/app/api/debug/calls/route.ts`
- `src/app/api/debug/metrics/route.ts`

Do NOT touch files outside these boundaries.

## Requirements
1. `GET /api/debug/calls`:
   - Call `await connection()` from `next/server` to assert dynamic execution in Next.js 16.
   - Read store: `store = await readStore()`.
   - Return 200 JSON array of `ModelCall` records: `store.calls ?? []`.
   - Records adhere to `ModelCall` schema: `id`, `timestamp`, `model`, `purpose`, `promptTokens`, `completionTokens`, `durationMs`, `success`, `error`.

2. `GET /api/debug/metrics`:
   - Call `await connection()` from `next/server`.
   - Read store: `store = await readStore()`.
   - Compute metrics over `store.calls ?? []`:
     - `callsCount`: total number of calls.
     - `totalPromptTokens`: sum of `promptTokens`.
     - `totalCompletionTokens`: sum of `completionTokens`.
     - `totalTokens`: `totalPromptTokens + totalCompletionTokens`.
     - `averageLatencyMs`: `callsCount === 0 ? 0 : Math.round(totalDurationMs / callsCount)`. Guard against divide-by-zero!
     - `errorCount`: count of calls where `success === false` or `error` is defined.
   - Return 200 JSON object with these metrics.

3. Automated Test Verification:
   - `tests/api-debug.spec.ts` must pass 100% under `MODEL_MOCK=1`.
   - Run tests with PowerShell:
     `$env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH; $env:MODEL_MOCK="1"; npx playwright test tests/api-debug.spec.ts`

4. Process:
   - Follow the Project sub-orchestrator iteration loop:
     a. Spawn 3 Explorers
     b. Spawn 1 Worker (include mandatory integrity warning verbatim)
     c. Spawn 2 Reviewers
     d. Spawn 2 Challengers
     e. Spawn 1 Forensic Auditor
     f. Check Gate (record in GATE_STATUS.md)
   - When gate passes, write handoff.md and send completion message to parent.


## Status: DONE
- Iteration 1 Gate: PASS
- Worker: `src/app/api/debug/calls/route.ts` and `src/app/api/debug/metrics/route.ts` implemented.
- Reviewer 1 & 2: APPROVE
- Challenger 1 & 2: APPROVE (all 15 oracle tests and 13 boundary stress tests passed)
- Forensic Auditor: CLEAN (zero integrity violations, genuine logic verified)
- Verification: `tests/api-debug.spec.ts` passes 100% (10/10) under `MODEL_MOCK=1`.
