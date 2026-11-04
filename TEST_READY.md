# Test Suite Ready: REM Dream Showcase Backend (Stages 2–6)

**Published By**: `test_writer_track_1` (E2E Test Architect)  
**Date**: 2026-11-04  
**Test Architecture**: Playwright Pure HTTP (`APIRequestContext` via `{ request }`)  
**Mock Execution**: Keyless & deterministic via `MODEL_MOCK=1`  

---

## 1. Unified Test Runner Command

To run the complete opaque-box E2E API test suite:

```powershell
$env:PATH = "C:\Program Files\nodejs;C:\Program Files\Git\cmd;" + $env:PATH;
Set-Location "C:\Users\User\.gemini\antigravity\scratch\rem-dream";
$env:MODEL_MOCK="1"; npx.cmd playwright test tests/api-*.spec.ts
```

---

## 2. Test Suite Inventory & Coverage Breakdown

| Test Spec File | Endpoints Covered | Tier 1 (Happy Path) | Tier 2 (Boundary & Corner) | Tier 3 (Cross-Feature) | Tier 4 (Real-World) | Total Tests |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `tests/api-chat.spec.ts` | `POST /api/chat`<br>`GET /api/state` | 4 | 8 | 2 | 1 | **15** |
| `tests/api-rem.spec.ts` | `POST /api/rem/start`<br>`GET /api/rem/status`<br>`POST /api/rem/stop` | 4 | 8 | 3 | 1 | **16** |
| `tests/api-proposal.spec.ts` | `POST /api/proposals/[id]/approve`<br>`POST /api/proposals/[id]/reject`<br>`POST /api/persona/revert`<br>`POST /api/session/reset` | 4 | 7 | 2 | 1 | **14** |
| `tests/api-debug.spec.ts` | `GET /api/debug/calls`<br>`GET /api/debug/metrics`<br>`POST /api/debug/reset-all` | 3 | 4 | 2 | 1 | **10** |
| **Total** | **12 Endpoint Actions** | **15** | **27** | **9** | **4** | **55 Tests** |

---

## 3. Tier Coverage Matrix

### Tier 1: Feature Coverage (15 Tests)
- `api-chat.spec.ts`: Node creation schema, sequential order incrementation, session-scoped state query, global state query.
- `api-rem.spec.ts`: Consolidate mode start (202), status polling schema, dream mode start, run cancellation via stop (200).
- `api-proposal.spec.ts`: Proposal approval & version increment, proposal rejection, persona revert to v1, session reset.
- `api-debug.spec.ts`: Call log schema, aggregated metrics schema, factory reset.

### Tier 2: Boundary & Corner Cases (27 Tests)
- Empty string & whitespace validation on user chat (400 Bad Request).
- Missing payload attributes (`sessionId`, `message`, `mode`, `runId`, `version`) returning 400 Bad Request.
- Concurrency 409 Conflict: chat locking during REM execution, duplicate REM run rejection.
- Resource constraints: Max 12 memory nodes capped per REM run, max 200 model calls buffer limit.
- Arithmetic safety: Divide-by-zero protection in `/api/debug/metrics` when `callsCount === 0` (`averageLatencyMs === 0`).
- Non-existent resource handling: 404 on invalid runId, proposalId, or revert version.
- Content integrity: Unicode, emoji, HTML, and multiline text preservation.
- Idempotent factory reset without file lock contention (`EBUSY`/`EPERM`).

### Tier 3: Cross-Feature Combinations (9 Tests)
- Immediate state synchronization between chat submission and `/api/state`.
- Session isolation: strict boundary enforcement preventing message leakage across visitor session IDs.
- REM concurrency lifecycle: locking chat (409) while running, unlocking upon completion (200).
- REM output generation: verifying insights and proposal creation in persistent store.
- Side-by-side mode comparison: verify distinct insight generation for `consolidate` vs `dream` modes.
- Persona prompt propagation: verifying new system prompt affects subsequent chat after proposal approval.
- Persona rollback: immediate restoration of baseline v1 system prompt in chat.
- Debug metrics incrementation: real-time increment of token counts, latencies, and call logs.

### Tier 4: Real-World Scenarios (4 Tests)
- **Exhibition Visitor Dialog Journey**: 5-turn conversational sequence simulating a realistic booth interaction.
- **Visitor Sleep & Reading Tracking**: Full REM sleep experience tracking active node illumination (`currentNodeIds`) and proposal formation.
- **Persona Evolution & Handoff**: Full visitor cycle of conversation, proposal review, approval, evolved persona dialogue, and session cleanup for the next attendee.
- **Daily Exhibition Closing Maintenance**: Operator dashboard inspection of aggregated metrics, error audits, and end-of-day factory reset.

---

## 4. Progressive Verification for Milestone Agents

Implementing agents can verify their milestones progressively as features land:

```powershell
# Milestone 1 (Stage 2: Storage & Chat)
$env:MODEL_MOCK="1"; npx.cmd playwright test tests/api-chat.spec.ts

# Milestone 2 & 4 (Stages 3 & 5: REM Consolidation & Dream Modes)
$env:MODEL_MOCK="1"; npx.cmd playwright test tests/api-rem.spec.ts

# Milestone 3 (Stage 4: Persona Proposals & Versioning)
$env:MODEL_MOCK="1"; npx.cmd playwright test tests/api-proposal.spec.ts

# Milestone 5 (Stage 6: Debug, Metrics & Reset)
$env:MODEL_MOCK="1"; npx.cmd playwright test tests/api-debug.spec.ts
```

---

## 5. Build & Compilation Verification

All tests compile cleanly with zero TypeScript errors:
```powershell
npx.cmd tsc --noEmit
npm.cmd run build
```
Both commands exit with return code `0`.
