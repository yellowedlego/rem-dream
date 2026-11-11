# Handoff Report: Milestone 1 API Proposal & Lifecycle Investigation

- **Author**: Explorer 2 (Milestone 1: Persona & Proposal Lifecycle)
- **State Folder**: `C:\Users\User\.gemini\antigravity\scratch\rem-dream\.agents\teamwork\explorer_m1_2\`
- **Date**: 2026-11-11T06:09:00Z

---

## 1. Observation

### 1.1 Current Test Suite Status (`tests/api-proposal.spec.ts`)
Execution of Playwright command:
```powershell
$env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH; $env:MODEL_MOCK="1"; npx playwright test tests/api-proposal.spec.ts
```
Direct output:
- **Result**: `14 failed` out of 14 tests.
- **Verbatim Error (sample)**:
  ```text
  1) tests\api-proposal.spec.ts:61:9 › Stage 4: Persona Proposals & Versioning API › Tier 1: Feature Coverage › POST /api/proposals/[id]/approve approves pending proposal and increments activePersona 
     Error: Approve failed with status 404
     Expected: 200
     Received: 404
  ```
- **Root Cause**: All 4 target API routes (`/api/proposals/[id]/approve`, `/api/proposals/[id]/reject`, `/api/persona/revert`, `/api/session/reset`) and helper library `src/lib/persona.ts` currently do not exist in the codebase.

### 1.2 Structure & Inventory of `tests/api-proposal.spec.ts`
The test file contains 14 tests categorized into 4 tiers, supported by 2 helper functions:

#### Helper Functions
1. `makeSessionId(prefix = "prop-test"): string` (lines 4-6):
   - Returns `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
2. `getOrCreatePendingProposal(request)` (lines 12-53):
   - Queries `GET /api/state`. If a proposal with `status === "pending"` exists, returns `{ proposalId: pending.id, sessionId: "demo-1" }`.
   - Otherwise, invokes `POST /api/chat` with `{ sessionId, message: "오늘 힘든 일이 있었는데 위로받고 싶어." }` followed by `POST /api/rem/start` with `{ sessionId, mode: "consolidate" }`.
   - Polls `GET /api/rem/status?runId=${runId}` up to 30 times (200ms interval) until `run.status === "done" && run.proposalId`.

#### Complete Inventory of Test Cases
| Tier | # | Test Name | Endpoint | Method | Payload / Params | Status Code | Expected Body / Assertions | State Checks |
|---|---|---|---|---|---|---|---|---|
| **Tier 1** | 1 | approves pending proposal and increments activePersona | `/api/proposals/${proposalId}/approve` | POST | None (path `proposalId` from helper) | 200 | `{ ok: true, activePersona: number >= 2 }` | `approvedProp.status === "approved"`, `approvedProp.decidedAt !== null`, `state.activePersona === approveBody.activePersona` |
| **Tier 1** | 2 | marks proposal rejected without changing activePersona | `/api/proposals/${proposalId}/reject` | POST | None (path `proposalId` from helper) | 200 | `{ ok: true }` | `rejectedProp.status === "rejected"`, `rejectedProp.decidedAt !== null`, `afterState.activePersona === previousActivePersona` |
| **Tier 1** | 3 | switches active persona back to version 1 | `/api/persona/revert` | POST | `{ version: 1 }` | 200 | `{ ok: true, activePersona: 1 }` | `state.activePersona === 1` |
| **Tier 1** | 4 | clears visitor session data and resets active persona to 1 | `/api/session/reset` | POST | `{ sessionId }` | 200 | `{ ok: true }` | `GET /api/state?sessionId=${sessionId}` nodes length is 0, `state.activePersona === 1` |
| **Tier 2** | 5 | approve with non-numeric id returns 400 Bad Request | `/api/proposals/invalid-non-numeric/approve` | POST | None | 400 | `{ error: string }` | None |
| **Tier 2** | 6 | approve with non-existent id returns 404 Not Found | `/api/proposals/9999999/approve` | POST | None | 404 | `{ error: string }` | None |
| **Tier 2** | 7 | approve on already approved proposal returns 400 Bad Request | `/api/proposals/1/approve` | POST | None (proposal 1 is seed approved) | 400 | `{ error: string }` | None |
| **Tier 2** | 8 | reject with non-existent id returns 404 Not Found | `/api/proposals/9999999/reject` | POST | None | 404 | `{ error: string }` | None |
| **Tier 2** | 9 | revert with non-existent version returns 404 Not Found | `/api/persona/revert` | POST | `{ version: 99999 }` | 404 | `{ error: string }` | None |
| **Tier 2** | 10 | revert with missing or invalid version payload returns 400 | `/api/persona/revert` | POST | Tested 3 cases: `{}`, `{ version: "not-a-number" }`, `{ version: -1 }` | 400 | Status 400 on all 3 cases | None |
| **Tier 2** | 11 | reset without sessionId returns 400 Bad Request | `/api/session/reset` | POST | `{}` | 400 | `{ error: string }` | None |
| **Tier 3** | 12 | Persona approval immediately propagates new persona prompt to subsequent chat | `/api/proposals/${proposalId}/approve` | POST | None | 200 | `{ activePersona: newVersion }` | Baseline chat succeeds; after approval, next chat `/api/chat` returns valid response; `state.personas` contains `newVersion` with `systemPrompt === targetProposal.proposedPrompt` |
| **Tier 3** | 13 | Persona revert restores previous persona and subsequent chat reflects rollback | `/api/persona/revert` | POST | `{ version: 1 }` | 200 | Status 200 | Next `/api/chat` succeeds under version 1; `state.activePersona === 1` |
| **Tier 4** | 14 | Exhibition visitor persona evolution, review, approval, and booth handoff | Multi-step lifecycle | POST | Chats, REM start, Approve, Chat, Reset | 202, 200, 200, 200 | Proposal approved, chat with new persona, session reset | Fresh state query shows 0 nodes for session and `activePersona === 1` |

### 1.3 Analysis of Other Test Files & Setup Scripts
1. **`tests/challenger-m1-2.spec.ts`**:
   - Status: **11 passed** (verified via `npx playwright test tests/challenger-m1-2.spec.ts`).
   - Verifies:
     - Deterministic model mock response discrimination for personas v1, v2, v3 (`prompt: "나에 대해 어떻게 생각해?"`).
     - REM 409 conflict locking on active runs in `/api/chat`.
     - `/api/chat` input validation (HTTP 400 on invalid `sessionId`, empty/invalid `message`, malformed payloads).
     - Live active persona verification through `/api/chat` as `activePersona` changes from 1 to 2 to 3.
     - Concurrency stress handling 10 simultaneous chat requests.
2. **`tests/api-rem.spec.ts`**:
   - Tests REM sleep endpoints (`/api/rem/start`, `/api/rem/status`, `/api/rem/stop`).
   - In Tier 3 (line 279) and Tier 4 (line 362), REM completion asserts that `run.proposalId !== null` and creates a `PersonaProposal` with `status: "pending"` in `store.proposals`.
3. **`tests/api-chat.spec.ts`**:
   - Interacts with `/api/state` and `/api/chat`, asserting that `state.activePersona` is a number and `state.proposals` is an array.
4. **`scripts/make-fake-store.mjs` & `data/store.json`**:
   - Seed data contains 2 personas (`version: 1`, `version: 2`), `activePersona: 2`, and 2 proposals:
     - Proposal 1: `status: "approved"`, `baseVersion: 1`, `decidedAt: "2026-11-04T22:52:00+09:00"`.
     - Proposal 2: `status: "pending"`, `baseVersion: 2`, `decidedAt: null`.
5. **`src/lib/records.ts`**:
   - Exports `removeSession(store: Store, sessionId: string): string[]` (lines 5-30). Already fully implemented. Clears nodes, stories, meanings, profiles, mails, session-specific insights, proposals, and runs, returning `imageIds`.
6. **`src/lib/store.ts`**:
   - Exports `updateStore<T>`, `readStore`, `getActivePersona`. Note that `getActivePersona` in `store.ts` (line 237) is async and returns `Promise<PersonaVersion>`. Next.js API routes in `src/app/api/chat/route.ts` consume `await getActivePersona(store)`.

---

## 2. Logic Chain

1. **Endpoint Requirements**:
   - `tests/api-proposal.spec.ts` exercises 4 distinct HTTP POST endpoints:
     - `POST /api/proposals/[id]/approve`
     - `POST /api/proposals/[id]/reject`
     - `POST /api/persona/revert`
     - `POST /api/session/reset`
   - Every single test currently fails because none of these 4 route handlers exist in `src/app/api/`.

2. **Route Parameter Handling in Next.js 16**:
   - Observed in `src/app/api/sessions/[sessionId]/route.ts` and `src/app/api/insights/[id]/route.ts`:
     In Next.js App Router, `ctx.params` is a `Promise`. Handlers must do:
     ```ts
     const { id } = await ctx.params;
     ```
   - For `approve` and `reject`, `id` is a string that must be parsed as an integer (`parseInt(id, 10)`).
   - If `id` is not numeric or <= 0, the handler must return 400 with `{ error: "..." }`.
   - If `id` is not in `store.proposals`, return 404 with `{ error: "..." }`.
   - If proposal status !== `"pending"`, return 400 with `{ error: "..." }`.

3. **Data Schema & State Mutations for `approve`**:
   - Per `src/lib/types.ts`:
     - Proposal update: `proposal.status = "approved"`, `proposal.decidedAt = new Date().toISOString()`.
     - Version calculation: `nextVersion = Math.max(...store.personas.map(p => p.version), 0) + 1`.
     - Persona creation: Append to `store.personas`:
       ```ts
       const newPersona: PersonaVersion = {
         version: nextVersion,
         systemPrompt: proposal.proposedPrompt,
         sourceInsightIds: proposal.sourceInsightIds ?? [],
         approvedAt: new Date().toISOString(),
         parentVersion: proposal.baseVersion ?? store.activePersona,
       };
       ```
     - Active persona update: `store.activePersona = nextVersion`.
     - Response: 200 `{ ok: true, activePersona: nextVersion }`.

4. **Data Schema & State Mutations for `reject`**:
   - Proposal update: `proposal.status = "rejected"`, `proposal.decidedAt = new Date().toISOString()`.
   - Active persona and personas array remain unchanged.
   - Response: 200 `{ ok: true }`.

5. **Data Schema & State Mutations for `revert`**:
   - Body: `{ version: number }`.
   - Validation:
     - Body must have `version` of type `number`, `!Number.isNaN(version)`, `version >= 1`. Otherwise 400.
     - Version must exist in `store.personas.some(p => p.version === version)`. If not, return 404.
   - Mutation: `store.activePersona = version`.
   - Response: 200 `{ ok: true, activePersona: version }`.

6. **Data Schema & State Mutations for `reset`**:
   - Body: `{ sessionId: string }`.
   - Validation: `sessionId` must be non-empty string. Otherwise 400.
   - Mutation:
     - `const imageIds = removeSession(store, sessionId.trim())`.
     - `store.activePersona = 1`.
     - Asynchronously clean up images via `deleteImages(imageIds)` from `@/lib/uploads`.
   - Response: 200 `{ ok: true }`.

7. **Cross-Milestone Test Dependency (Crucial Finding)**:
   - In `data/store.json`, there is only **one** pending proposal (id: 2).
   - Test 1 (`Tier 1: Feature Coverage`) approves proposal 2.
   - Test 2 (`Tier 1: Feature Coverage`) calls `getOrCreatePendingProposal`. Because proposal 2 is now approved and no other pending proposal exists, `getOrCreatePendingProposal` attempts to create one by calling `POST /api/rem/start`.
   - Furthermore, Test 14 (`Tier 4: Real-World Scenarios`) directly executes `POST /api/rem/start` at line 292-295 and explicitly asserts `expect(remRes.status()).toBe(202)`.
   - Because `POST /api/rem/start` belongs to Milestone 3 (`src/app/api/rem/start/route.ts`), running the entire `tests/api-proposal.spec.ts` suite before Milestone 3 is implemented will encounter 404 on `POST /api/rem/start` during Test 14 (and Test 2 / Test 12 if pending proposals in runtime store are exhausted).

---

## 3. Caveats

1. **Cross-Milestone Dependency on `/api/rem/start`**:
   - `tests/api-proposal.spec.ts` is not strictly isolated from Milestone 3; Test 14 (and the `getOrCreatePendingProposal` fallback) requires `/api/rem/start` to return 202.
   - In Milestone 1, the files within M1 scope (`src/lib/persona.ts`, `/api/proposals/[id]/approve`, `/api/proposals/[id]/reject`, `/api/persona/revert`, `/api/session/reset`) will satisfy all proposal/persona lifecycle endpoints, but Test 14 will only pass when `/api/rem/start` is available (M3).
   - If tests are run with a fresh runtime store reset per test, or if `data/store.json` contains multiple pending proposals, Test 2 and Test 12 can use pending proposals from state; however, Test 14 explicitly calls `/api/rem/start`.
2. **Playwright Shared Runtime Store**:
   - `playwright.config.ts` sets `workers: 1`, `fullyParallel: false`, with runtime store at `data/runtime-test/store.json`. State changes persist across tests in the same test run.
3. **Async vs Sync `getActivePersona`**:
   - `src/lib/store.ts` already contains an `export async function getActivePersona(providedStore?: Store): Promise<PersonaVersion>`.
   - `PROJECT.md` line 58 states `getActivePersona(store?: Store): PersonaVersion`.
   - In `src/lib/persona.ts`, `getActivePersona` should either take `(store?: Store)` and if `store` is provided return `PersonaVersion` synchronously, or support both, and re-export cleanly to avoid signature mismatch with `src/app/api/chat/route.ts` which uses `await getActivePersona(store)`.

---

## 4. Conclusion

1. **Implementation Deliverables for Milestone 1 Worker**:
   - `src/lib/persona.ts`:
     Implement and export `getActivePersona`, `approveProposal`, `rejectProposal`, `revertPersona`, and `resetSession`. Ensure atomic store updates via `updateStore` from `src/lib/store.ts` and image cleanup via `deleteImages` from `src/lib/uploads.ts`.
   - `src/app/api/proposals/[id]/approve/route.ts`:
     Implement `POST` handler with Next.js 16 async params `ctx: { params: Promise<{ id: string }> }`. Validate numeric id (400), check existence (404), check pending status (400), execute proposal approval, return 200 `{ ok: true, activePersona }`.
   - `src/app/api/proposals/[id]/reject/route.ts`:
     Implement `POST` handler with async params. Validate numeric id (400), check existence (404), check pending status (400), execute proposal rejection, return 200 `{ ok: true }`.
   - `src/app/api/persona/revert/route.ts`:
     Implement `POST` handler reading JSON `{ version }`. Validate numeric positive version (400), check persona version existence in `store.personas` (404), revert `store.activePersona`, return 200 `{ ok: true, activePersona }`.
   - `src/app/api/session/reset/route.ts`:
     Implement `POST` handler reading JSON `{ sessionId }`. Validate non-empty string `sessionId` (400), invoke `removeSession` and image cleanup, reset `store.activePersona = 1`, return 200 `{ ok: true }`.

2. **Compliance with Scope**:
   - Strictly limit code modifications to the 5 designated files. Do not modify other files.

---

## 5. Verification Method

To verify the investigation and future milestone implementation:

1. **Verify Baseline Failure (Current State)**:
   ```powershell
   $env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH; cd C:\Users\User\.gemini\antigravity\scratch\rem-dream; $env:MODEL_MOCK="1"; npx playwright test tests/api-proposal.spec.ts
   ```
   *Expected Current Output*: 14 failed (all return 404 on missing endpoints).

2. **Verify Challenger M1-2 Harness**:
   ```powershell
   $env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH; cd C:\Users\User\.gemini\antigravity\scratch\rem-dream; $env:MODEL_MOCK="1"; npx playwright test tests/challenger-m1-2.spec.ts
   ```
   *Expected Output*: 11 passed (100% pass on persona discrimination, 409 locking, validation, and concurrency).

3. **Verify Implementation (Post-Milestone 1)**:
   - Inspect newly created files:
     - `src/lib/persona.ts`
     - `src/app/api/proposals/[id]/approve/route.ts`
     - `src/app/api/proposals/[id]/reject/route.ts`
     - `src/app/api/persona/revert/route.ts`
     - `src/app/api/session/reset/route.ts`
   - Run unit/feature tests:
     ```powershell
     $env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH; cd C:\Users\User\.gemini\antigravity\scratch\rem-dream; npx playwright test tests/api-proposal.spec.ts --grep="Tier 1|Tier 2|Tier 3"
     ```
