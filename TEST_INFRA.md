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
|   MODEL_MOCK=1 | data/runtime/store.json | Async Mutex Queue (updateStore)   |
+-------------------------------------------------------------------------------+
        |                     |                     |                    |
  /api/chat             /api/rem/*          /api/proposals/*       /api/debug/*
  /api/state                                /api/persona/*
                                            /api/session/*
```

---

## 2. 4-Tier Testing Methodology

The test suite is structured across four progressive testing tiers:

### Tier 1: Feature Coverage (Happy Path)
- Validates the primary positive contract of each endpoint.
- Verifies HTTP status codes (`200 OK`, `202 Accepted`).
- Validates response schemas against TypeScript interfaces in `src/lib/types.ts` (`MemoryNode`, `RemRun`, `PersonaProposal`, `ModelCall`, `Store`).
- Validates ISO-8601 timestamps and sequential ordering.

### Tier 2: Boundary & Corner Cases
- Input validation: empty strings `""`, whitespace-only strings, missing required fields, malformed JSON.
- Concurrency control: HTTP `409 Conflict` when `/api/chat` or `/api/rem/start` is invoked while a REM run is actively in progress (`status: "running"`).
- Resource bounds & limits:
  - Max 12 memory nodes capped during REM sleep runs (R2, PROJECT.md).
  - Max 200 items buffer cap on model call logging (`calls.length <= 200`).
  - Divide-by-zero protection in `/api/debug/metrics` (`averageLatencyMs === 0` when `callsCount === 0`).
- Error handling: HTTP `400 Bad Request` on invalid parameters; HTTP `404 Not Found` on non-existent proposal IDs or invalid revert versions.
- Unicode & special character fidelity: emojis, HTML tags, multiline texts, and Korean hangul characters.

### Tier 3: Cross-Feature Combinations
- **State Synchronization**: Immediate reflection of newly created nodes, insights, and proposals in `/api/state`.
- **Session Isolation**: Ensuring conversations and memory nodes in Session A do not leak into Session B.
- **REM Concurrency & Input Locking**: `/api/chat` locked (409) during REM execution; unlocked immediately upon run completion (`status: "done"`).
- **Persona Evolution Propagation**: Approving a proposal immediately updates `activePersona` system prompt on subsequent chats.
- **Persona Rollback**: Reverting to Version 1 immediately restores baseline prompt behavior without creating duplicate version records.
- **Operational Metrics Reflection**: Verifying `/api/debug/metrics` and `/api/debug/calls` accurately log tokens, latencies, and purpose tags ("chat", "rem-step", "rem-proposal").

### Tier 4: Real-World Scenarios
- **Complete Exhibition Visitor Lifecycle**: Cold start visitor arrival -> multi-turn dialog -> REM sleep initiation -> active reading visualization -> proposal generation -> proposal review & approval -> evolved persona conversation -> booth attendant session reset for next attendee.
- **Creative Dreaming & Side-by-Side Comparison**: Running both `consolidate` (sequential) and `dream` (creative associative) modes on the same memory nodes and comparing results.
- **Daily Closing Maintenance**: Operator inspections of aggregated metrics, error counts, latency averages, and factory reset (`POST /api/debug/reset-all`).

---

## 3. Test Suite Inventory

| Test File | Target Endpoints | Primary Scope | Tier Coverage |
| :--- | :--- | :--- | :---: |
| `tests/api-chat.spec.ts` | `POST /api/chat`<br>`GET /api/state` | Conversation creation, memory node accumulation, session state retrieval, input validation, REM locking. | Tiers 1–4 |
| `tests/api-rem.spec.ts` | `POST /api/rem/start`<br>`GET /api/rem/status`<br>`POST /api/rem/stop` | REM sleep lifecycle, consolidate & dream modes, 409 concurrency lock, status polling, node capping (12 max), insight & proposal generation. | Tiers 1–4 |
| `tests/api-proposal.spec.ts` | `POST /api/proposals/[id]/approve`<br>`POST /api/proposals/[id]/reject`<br>`POST /api/persona/revert`<br>`POST /api/session/reset` | Human-in-the-loop persona approval/rejection, version incrementation, prompt propagation to next chat, version rollback, session reset. | Tiers 1–4 |
| `tests/api-debug.spec.ts` | `GET /api/debug/calls`<br>`GET /api/debug/metrics`<br>`POST /api/debug/reset-all` | LLM invocation logging, operational metrics, div-by-zero protection, 200 buffer cap, factory reset idempotency. | Tiers 1–4 |

---

## 4. Environment & Configuration

### `playwright.config.ts`
The configuration specifies:
- `testDir: "tests"`
- `use: { baseURL: "http://localhost:3123" }`
- `webServer`:
  - `command: process.platform === "win32" ? "npm.cmd run start -- -p 3123" : "npm run start -- -p 3123"`
  - `url: "http://localhost:3123"`
  - `reuseExistingServer: true`
  - `env: { MODEL_MOCK: "1", ...process.env }`

### Windows PowerShell Environment Requirement
All commands run in PowerShell with NodeJS and Git on PATH:
```powershell
$env:PATH = "C:\Program Files\nodejs;C:\Program Files\Git\cmd;" + $env:PATH;
Set-Location "C:\Users\User\.gemini\antigravity\scratch\rem-dream";
```

---

## 5. Test Execution Commands

### Run Full API Test Suite
```powershell
$env:MODEL_MOCK="1"; npx.cmd playwright test tests/api-*.spec.ts
```

### Run Specific Test Suites
```powershell
# Chat & State API
$env:MODEL_MOCK="1"; npx.cmd playwright test tests/api-chat.spec.ts

# REM Sleep API
$env:MODEL_MOCK="1"; npx.cmd playwright test tests/api-rem.spec.ts

# Proposal & Persona Versioning API
$env:MODEL_MOCK="1"; npx.cmd playwright test tests/api-proposal.spec.ts

# Debug, Metrics & Reset API
$env:MODEL_MOCK="1"; npx.cmd playwright test tests/api-debug.spec.ts
```

---

## 6. Verification and Reporting

When all stages (Stages 2–6) are implemented:
1. Run `npm.cmd run build` to verify Next.js build and TypeScript compilation.
2. Execute `$env:MODEL_MOCK="1"; npx.cmd playwright test tests/api-*.spec.ts`.
3. Check results against `TEST_READY.md`.
