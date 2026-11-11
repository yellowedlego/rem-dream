# Test Suite Ready: REM Dream Showcase Backend (Stages 2–6)

**Audited & Published By**: E2E Testing Track Orchestrator  
**Date**: 2026-11-11  
**Test Architecture**: Playwright Pure HTTP (`APIRequestContext` via `{ request }`)  
**Mock Execution**: Keyless & deterministic via `MODEL_MOCK=1`  
**Test Store Target**: `data/runtime-test/store.json` (isolated from development store)

---

## 1. Unified Test Runner Command

To run the complete opaque-box E2E API test suite:

```powershell
$env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH;
Set-Location "C:\Users\User\.gemini\antigravity\scratch\rem-dream";
$env:MODEL_MOCK="1"; npx.cmd playwright test tests/api-*.spec.ts
```

---

## 2. Test Suite Inventory & Coverage Breakdown

| Test Spec File | Endpoints Covered | Tier 1 (Happy Path) | Tier 2 (Boundary & Corner) | Tier 3 (Cross-Feature) | Tier 4 (Real-World) | Total Tests |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `tests/api-chat.spec.ts` | `POST /api/chat`<br>`GET /api/state` | 4 | 9 | 2 | 1 | **16** |
| `tests/api-rem.spec.ts` | `POST /api/rem/start`<br>`GET /api/rem/status`<br>`POST /api/rem/stop` | 4 | 8 | 3 | 1 | **16** |
| `tests/api-proposal.spec.ts` | `POST /api/proposals/[id]/approve`<br>`POST /api/proposals/[id]/reject`<br>`POST /api/persona/revert`<br>`POST /api/session/reset` | 4 | 7 | 2 | 1 | **14** |
| `tests/api-debug.spec.ts` | `GET /api/debug/calls`<br>`GET /api/debug/metrics`<br>`POST /api/debug/reset-all` | 3 | 4 | 2 | 1 | **10** |
| **Total Core E2E Suite** | **All 12 Endpoint Actions** | **15** | **28** | **9** | **4** | **56 Tests** |
| `tests/challenger-m1-2.spec.ts` | `/api/chat`<br>`mock.ts`<br>`store.json` | 2 | 4 | 4 | 1 | **11 Tests** |
| **Grand Total** | **All Backend APIs & Stress Harness** | **17** | **32** | **13** | **5** | **67 Tests** |

---

## 3. Tier Coverage Matrix

### Tier 1: Feature Coverage (15 Tests)
- `api-chat.spec.ts` (4):
  - MemoryNode creation with schema assertion (`id`, `sessionId`, `user`, `ai`, `order`, `createdAt`).
  - Sequential `order` incrementation within same session.
  - Session-scoped state query (`GET /api/state?sessionId=`).
  - Global state query structure validation (`GET /api/state`).
- `api-rem.spec.ts` (4):
  - Consolidate mode start returning 202 Accepted with `runId`.
  - Status polling returning accurate `RemRun` object (`currentNodeIds`, `insightIds`, `status`).
  - Dream mode start with high temperature (1.1).
  - Stop endpoint requesting termination and updating status to `stopped`/`done`.
- `api-proposal.spec.ts` (4):
  - Proposal approval promoting proposal to `PersonaVersion` and incrementing `activePersona`.
  - Proposal rejection updating status to `rejected` without modifying `activePersona`.
  - Persona revert restoring `activePersona = 1`.
  - Session reset clearing visitor memory nodes and resetting persona to 1.
- `api-debug.spec.ts` (3):
  - Call log retrieval with schema verification (`ModelCall` fields, purpose enum).
  - Aggregated metrics retrieval (`totalTokens`, `callsCount`, non-negative constraints).
  - Factory reset restoring initial seed store state.

### Tier 2: Boundary & Corner Cases (28 Tests)
- `api-chat.spec.ts` (9):
  - Rejection of empty string message (400 Bad Request).
  - Rejection of whitespace-only message (400 Bad Request).
  - Rejection of payload missing `message` attribute (400 Bad Request).
  - Rejection of payload missing `sessionId` attribute (400 Bad Request).
  - Payload length cap enforcement (>2,000 chars returning 413 Payload Too Large).
  - Character fidelity: preservation of emojis, HTML tags, multiline breaks, and Korean hangul.
  - Large payload handling (1,920 chars just below limit).
  - Malformed non-JSON payload rejection (400 Bad Request).
  - Concurrency lock: chat returns 409 Conflict when REM is running.
- `api-rem.spec.ts` (8):
  - Missing `sessionId` on start returns 400 Bad Request.
  - Invalid / unregistered mode string returns 400 Bad Request.
  - Concurrent REM execution prevention: starting second run while active returns 409 Conflict.
  - Missing `runId` query parameter on status returns 400 Bad Request.
  - Non-existent `runId` on status returns 404 Not Found.
  - Missing `runId` in body on stop returns 400 Bad Request.
  - Non-existent `runId` on stop returns 404 Not Found.
  - Resource bound cap: memory node processing capped to maximum 12 nodes during REM sleep.
- `api-proposal.spec.ts` (7):
  - Non-numeric proposal ID returns 400 Bad Request.
  - Non-existent proposal ID on approve returns 404 Not Found.
  - Double approval guard: approving already-approved proposal returns 400 Bad Request.
  - Non-existent proposal ID on reject returns 404 Not Found.
  - Non-existent persona version on revert returns 404 Not Found.
  - Missing / non-numeric / negative version payload on revert returns 400 Bad Request.
  - Missing `sessionId` on session reset returns 400 Bad Request.
- `api-debug.spec.ts` (4):
  - Divide-by-zero protection: `averageLatencyMs === 0` when `callsCount === 0`.
  - Metric token consistency: `totalTokens === totalInputTokens + totalOutputTokens`.
  - Factory reset idempotency: consecutive calls execute cleanly without file lock contention.
  - Ring buffer cap: model calls log pruned to maximum 200 items.

### Tier 3: Cross-Feature Combinations (9 Tests)
- `api-chat.spec.ts` (2):
  - Immediate state reflection: chat node created is immediately present in `/api/state`.
  - Session isolation: strict boundary enforcement preventing message leakage between Session A and Session B.
- `api-rem.spec.ts` (3):
  - REM concurrency lock lifecycle: chat returns 409 while running, cleanly returns 200 after completion.
  - REM store synthesis: completed run generates persistent `Insight` and `PersonaProposal` records.
  - Multi-mode comparative synthesis: verify `consolidate` and `dream` modes produce mode-tagged insights in the same session.
- `api-proposal.spec.ts` (2):
  - Persona evolution propagation: approving proposal immediately changes system prompt in subsequent chat.
  - Persona rollback propagation: reverting persona to v1 immediately restores baseline prompt behavior in subsequent chat.
- `api-debug.spec.ts` (2):
  - Chat telemetry linkage: sending chat immediately increments `callsCount` and records call with `purpose: "chat"`.
  - Factory reset cleanup: wipes dynamically created nodes and restores pristine baseline state.

### Tier 4: Real-World Scenarios (4 Tests)
- `api-chat.spec.ts` (1):
  - **Exhibition Visitor Multi-Turn Conversation**: 5-turn dialogue sequence checking chronological ordering, unique IDs, and persistent storage.
- `api-rem.spec.ts` (1):
  - **Exhibition Visitor Sleep Experience**: Multi-turn conversation followed by REM sleep initiation, status polling, active node illumination, and proposal generation.
- `api-proposal.spec.ts` (1):
  - **Visitor Persona Evolution & Booth Handoff**: Full visitor lifecycle from conversation, REM sleep, proposal inspection and approval, chatting with evolved persona, to booth attendant session reset for the next attendee.
- `api-debug.spec.ts` (1):
  - **Daily Exhibition Closing Maintenance**: Operator inspections of aggregated metrics, error counts, latency averages, and factory reset (`POST /api/debug/reset-all`).

---

## 4. Feature Coverage Mapping (20/20 Features)

| Feature # | Feature Name | Mapped Tests |
| :---: | :--- | :--- |
| **F1** | Persona Proposal Approval | `api-proposal.spec.ts` (L61, L149, L156, L163, L218, L280), `challenger-m1-2.spec.ts` (L368) |
| **F2** | Persona Proposal Rejection | `api-proposal.spec.ts` (L84, L171) |
| **F3** | Persona Reversion | `api-proposal.spec.ts` (L107, L178, L187, L256), `challenger-m1-2.spec.ts` (L368) |
| **F4** | Session Reset | `api-proposal.spec.ts` (L121, L204, L280), `api-debug.spec.ts` (L171) |
| **F5** | Persona Helper Library | `api-proposal.spec.ts` (L61, L84, L107, L121, L218, L256, L280), `challenger-m1-2.spec.ts` |
| **F6** | Debug Calls Endpoint | `api-debug.spec.ts` (L27, L131, L145, L194) |
| **F7** | Debug Metrics Endpoint | `api-debug.spec.ts` (L54, L97, L113, L145, L194) |
| **F8** | REM Types & Contracts | `api-rem.spec.ts` (L37, L59, L85, L107, L279, L362) |
| **F9** | REM Mode Registry | `api-rem.spec.ts` (L37, L85, L149, L317) |
| **F10** | REM Consolidate Mode | `api-rem.spec.ts` (L37, L279, L317, L362), `api-proposal.spec.ts` (L30) |
| **F11** | REM Dream Mode | `api-rem.spec.ts` (L85, L317) |
| **F12** | REM Proposal Generator | `api-rem.spec.ts` (L279, L362), `api-proposal.spec.ts` (L218, L280) |
| **F13** | REM Execution Runner | `api-rem.spec.ts` (L37, L59, L85, L107, L160, L216, L244, L279, L317, L362) |
| **F14** | REM Start Endpoint | `api-rem.spec.ts` (L37, L85, L139, L149, L160, L216, L244, L279, L317, L362) |
| **F15** | REM Status Endpoint | `api-rem.spec.ts` (L59, L184, L191, L362) |
| **F16** | REM Stop Endpoint | `api-rem.spec.ts` (L107, L198, L207) |
| **F17** | Chat Concurrency Lock | `api-chat.spec.ts` (L194), `api-rem.spec.ts` (L244), `challenger-m1-2.spec.ts` (L126, L168, L209, L254) |
| **F18** | Verification Script | `scripts/verify-rem.mjs` (M4), `challenger-m1-2.spec.ts` (L58, L88, L368) |
| **F19** | 100% E2E Test Verification | All 56 core tests in `tests/api-*.spec.ts` passing under `MODEL_MOCK=1` |
| **F20** | Git Commit & Push | Branch `backend` target verification |

---

## 5. Progressive Verification by Milestone

```powershell
# Milestone 1 (Persona & Proposal Lifecycle)
$env:MODEL_MOCK="1"; npx.cmd playwright test tests/api-proposal.spec.ts

# Milestone 2 (Debug Telemetry & Metrics)
$env:MODEL_MOCK="1"; npx.cmd playwright test tests/api-debug.spec.ts

# Milestone 3 (REM Engine Core & APIs)
$env:MODEL_MOCK="1"; npx.cmd playwright test tests/api-rem.spec.ts

# Milestone 4 Gate (Full Suite)
npm.cmd run build
$env:MODEL_MOCK="1"; npx.cmd playwright test tests/api-*.spec.ts
```
