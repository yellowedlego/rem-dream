# REM Dream Showcase Backend — Test Infrastructure (TEST_INFRA)

## 1. Overview & Architecture

This document specifies the opaque-box end-to-end (E2E) API testing infrastructure for the REM Dream Showcase backend (Stages 2–6).

The test architecture is designed around four foundational principles:
1. **Pure HTTP Opaque-Box Validation**: All tests interact exclusively through HTTP endpoints using Playwright's `{ request }` fixture (`APIRequestContext`). No internal module mocks or in-memory state bypasses are permitted.
2. **Zero Browser Overhead**: Tests execute entirely without Chromium or headless browser binaries, ensuring rapid execution and compatibility with headless CI environments.
3. **Deterministic Mock Execution**: Full test suite operates deterministically without external network requests or paid LLM API keys via `MODEL_MOCK=1`.
4. **Isolated Parallel Execution**: Each test generates unique, collision-free session IDs (`makeSessionId`), ensuring tests are parallel-safe and do not contaminate shared state.

```
+-------------------------------------------------------------------------------+
|                             Playwright Test Runner                            |
|             (npx.cmd playwright test tests/api-*.spec.ts)                     |
+-------------------------------------------------------------------------------+
                                      |
                      Pure HTTP ({ request } fixture)
                                      v
+-------------------------------------------------------------------------------+
|                       Next.js App Server (:3123)                              |
|   MODEL_MOCK=1 | data/runtime-test/store.json | Async Mutex Queue             |
+-------------------------------------------------------------------------------+
        |                     |                     |                    |
  /api/chat             /api/rem/*          /api/proposals/*       /api/debug/*
  /api/state            /api/rem/start      /api/proposals/[id]/approve  /api/debug/calls
                        /api/rem/status     /api/proposals/[id]/reject   /api/debug/metrics
                        /api/rem/stop       /api/persona/revert          /api/debug/reset-all
                                            /api/session/reset
```

---

## 2. 4-Tier Testing Methodology

The test suite is structured across four progressive testing tiers:

### Tier 1: Feature Coverage (Happy Path)
- Validates the primary positive contract of each endpoint.
- Verifies HTTP status codes (`200 OK`, `202 Accepted`).
- Validates response schemas against TypeScript interfaces in `src/lib/types.ts` (`MemoryNode`, `RemRun`, `PersonaProposal`, `ModelCall`, `Store`).
- Validates ISO-8601 timestamps and sequential ordering.

### Tier 2: Boundary & Corner Cases (Category-Partition & BVA)
- Input validation: empty strings `""`, whitespace-only strings, missing required fields, malformed JSON, non-numeric IDs, invalid modes.
- Concurrency control: HTTP `409 Conflict` when `/api/chat` or `/api/rem/start` is invoked while a REM run is actively in progress (`status: "running"`).
- Resource bounds & limits:
  - Max 12 memory nodes capped during REM sleep runs (R2, PROJECT.md Line 39).
  - Max 200 items buffer cap on model call logging (`calls.length <= 200`).
  - Divide-by-zero protection in `/api/debug/metrics` (`averageLatencyMs === 0` when `callsCount === 0`).
- Error handling: HTTP `400 Bad Request` on invalid parameters; HTTP `404 Not Found` on non-existent proposal IDs, run IDs, or invalid revert versions.
- Unicode & special character fidelity: emojis, HTML tags, multiline texts, and Korean hangul characters up to 1,920 chars.

### Tier 3: Cross-Feature Combinations & State Synchronization
- **State Synchronization**: Immediate reflection of newly created nodes, insights, and proposals in `/api/state`.
- **Session Isolation**: Ensuring conversations and memory nodes in Session A do not leak into Session B.
- **REM Concurrency & Input Locking**: `/api/chat` locked (409) during REM execution; unlocked immediately upon run completion (`status: "done"`).
- **Persona Evolution Propagation**: Approving a proposal immediately updates `activePersona` system prompt on subsequent chats.
- **Persona Rollback**: Reverting to Version 1 immediately restores baseline prompt behavior without creating duplicate version records.
- **Operational Metrics Reflection**: Verifying `/api/debug/metrics` and `/api/debug/calls` accurately log tokens, latencies, and purpose tags ("chat", "rem-step", "rem-proposal").

### Tier 4: Real-World Workload Scenarios
- **Exhibition Visitor Dialog Journey**: 5-turn conversational sequence simulating a realistic booth interaction.
- **Complete Exhibition Visitor Lifecycle**: Cold start visitor arrival -> multi-turn dialog -> REM sleep initiation -> active reading visualization -> proposal generation -> proposal review & approval -> evolved persona conversation -> booth attendant session reset for next attendee.
- **Creative Dreaming & Side-by-Side Comparison**: Running both `consolidate` (sequential) and `dream` (creative associative) modes on the same memory nodes and comparing results.
- **Daily Closing Maintenance**: Operator dashboard inspection of aggregated metrics, error counts, latency averages, and factory reset (`POST /api/debug/reset-all`).

---

## 3. Test Suite Inventory

| Test File | Target Endpoints | Primary Scope | Tier Coverage | Test Count |
| :--- | :--- | :--- | :---: | :---: |
| `tests/api-chat.spec.ts` | `POST /api/chat`<br>`GET /api/state` | Conversation creation, memory node accumulation, session state retrieval, input validation, REM locking. | Tiers 1–4 | 16 |
| `tests/api-rem.spec.ts` | `POST /api/rem/start`<br>`GET /api/rem/status`<br>`POST /api/rem/stop` | REM sleep lifecycle, consolidate & dream modes, 409 concurrency lock, status polling, node capping (12 max), insight & proposal generation. | Tiers 1–4 | 16 |
| `tests/api-proposal.spec.ts` | `POST /api/proposals/[id]/approve`<br>`POST /api/proposals/[id]/reject`<br>`POST /api/persona/revert`<br>`POST /api/session/reset` | Human-in-the-loop persona approval/rejection, version incrementation, prompt propagation to next chat, version rollback, session reset. | Tiers 1–4 | 14 |
| `tests/api-debug.spec.ts` | `GET /api/debug/calls`<br>`GET /api/debug/metrics`<br>`POST /api/debug/reset-all` | LLM invocation logging, operational metrics, div-by-zero protection, 200 buffer cap, factory reset idempotency. | Tiers 1–4 | 10 |
| **Total Core E2E Suite** | **All Backend API Routes** | **End-to-End API Contracts & Workflows** | **Tiers 1–4** | **56 Tests** |
| `tests/challenger-m1-2.spec.ts` | `/api/chat`<br>`mock.ts`<br>`store.json` | Concurrency stress (10 simultaneous chats), empirical 409 locking, response discrimination, input fuzzing. | Tier 5 Stress | 11 |

---

## 4. Environment & Configuration

### `playwright.config.ts`
The configuration specifies:
- `testDir: "tests"`
- `workers: 1` (Serial execution prevents race conditions on the shared test store)
- `fullyParallel: false`
- `use: { baseURL: "http://localhost:3123" }`
- `webServer`:
  - `command: process.platform === "win32" ? "npm.cmd run start -- -p 3123" : "npm run start -- -p 3123"`
  - `url: "http://localhost:3123"`
  - `reuseExistingServer: true`
  - `timeout: 120_000`
  - `env: { MODEL_MOCK: "1", REM_RUNTIME_DIR: "data/runtime-test", MAIL_MOCK: "1", ...process.env }`

### Windows PowerShell Environment Requirement
All commands run in PowerShell with NodeJS and Git on PATH:
```powershell
$env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH;
Set-Location "C:\Users\User\.gemini\antigravity\scratch\rem-dream";
```

---

## 5. Test Execution Commands

### Discovery & Listing
```powershell
# List all core API tests
$env:MODEL_MOCK="1"; npx.cmd playwright test tests/api-*.spec.ts --list

# List all test files including challenger harness
$env:MODEL_MOCK="1"; npx.cmd playwright test tests/api-*.spec.ts tests/challenger-m1-2.spec.ts --list
```

### Full Core API Test Execution
```powershell
$env:MODEL_MOCK="1"; npx.cmd playwright test tests/api-*.spec.ts
```

### Milestone-Specific Execution
```powershell
# Milestone 1: Persona & Proposal Lifecycle
$env:MODEL_MOCK="1"; npx.cmd playwright test tests/api-proposal.spec.ts

# Milestone 2: Debug Telemetry & Metrics
$env:MODEL_MOCK="1"; npx.cmd playwright test tests/api-debug.spec.ts

# Milestone 3: REM Engine Core & APIs
$env:MODEL_MOCK="1"; npx.cmd playwright test tests/api-rem.spec.ts

# Stage 2: Chat & State API
$env:MODEL_MOCK="1"; npx.cmd playwright test tests/api-chat.spec.ts

# Adversarial & Concurrency Stress Test Suite
$env:MODEL_MOCK="1"; npx.cmd playwright test tests/challenger-m1-2.spec.ts
```

---

## 6. Build & CI Verification Gate

Before running tests on a freshly built environment:
```powershell
npm.cmd run build
$env:MODEL_MOCK="1"; npx.cmd playwright test tests/api-*.spec.ts
```
Expected output: 56 passed tests in 4 test files.
