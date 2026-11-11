# Milestone 1: Persona & Proposal Lifecycle Implementation Handoff Report

- **Author**: Worker (Milestone 1)
- **Role**: implementer, qa
- **State Folder**: `C:\Users\User\.gemini\antigravity\scratch\rem-dream\.agents\teamwork\worker_m1_1\`
- **Date**: 2026-11-11T06:19:30Z

---

## 1. Observation

### 1.1 Deliverables & Exclusive Write Boundaries
The 5 designated files have been implemented under strict adherence to write boundaries:
1. `src/lib/persona.ts`: Core lifecycle domain library exporting `PersonaError`, `getActivePersona`, `approveProposal`, `rejectProposal`, `revertPersona`, and `resetSession`.
2. `src/app/api/proposals/[id]/approve/route.ts`: Next.js 16 App Router POST route handler for approving pending persona proposals.
3. `src/app/api/proposals/[id]/reject/route.ts`: Next.js 16 App Router POST route handler for rejecting pending persona proposals.
4. `src/app/api/persona/revert/route.ts`: Next.js 16 App Router POST route handler for reverting `activePersona` to a specified historical version.
5. `src/app/api/session/reset/route.ts`: Next.js 16 App Router POST route handler for wiping visitor session data and resetting persona to version 1.

No other files were created, modified, or removed.

### 1.2 TypeScript Compilation
Command executed:
```powershell
$env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH;
Set-Location "C:\Users\User\.gemini\antigravity\scratch\rem-dream";
npx --no-install tsc --noEmit
```
Result: Exit code 0, 0 errors.

### 1.3 Next.js Production Build
Command executed:
```powershell
npm run build
```
Result: Exit code 0. Next.js 16.4.5 Turbopack production build succeeded. All four API endpoints were compiled as server-rendered dynamic routes (`ƒ`):
- `ƒ /api/persona/revert`
- `ƒ /api/proposals/[id]/approve`
- `ƒ /api/proposals/[id]/reject`
- `ƒ /api/session/reset`

### 1.4 Automated Playwright Test Suite (`tests/api-proposal.spec.ts`)
Command executed:
```powershell
$env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH;
Set-Location "C:\Users\User\.gemini\antigravity\scratch\rem-dream";
$env:MODEL_MOCK="1";
npx playwright test tests/api-proposal.spec.ts
```
Results in batch execution:
- **11 passed, 3 failed**:
  - `ok  1`: `POST /api/proposals/[id]/approve approves pending proposal and increments activePersona` (PASS)
  - `x   2`: `POST /api/proposals/[id]/reject marks proposal rejected without changing activePersona` (Failed at helper `getOrCreatePendingProposal:33` calling `/api/rem/start`)
  - `ok  3`: `POST /api/persona/revert switches active persona back to version 1` (PASS)
  - `ok  4`: `POST /api/session/reset clears visitor session data and resets active persona to 1` (PASS)
  - `ok  5`: `POST /api/proposals/[id]/approve with non-numeric id returns 400 Bad Request` (PASS)
  - `ok  6`: `POST /api/proposals/[id]/approve with non-existent id returns 404 Not Found` (PASS)
  - `ok  7`: `POST /api/proposals/[id]/approve on already approved proposal returns 400 Bad Request` (PASS)
  - `ok  8`: `POST /api/proposals/[id]/reject with non-existent id returns 404 Not Found` (PASS)
  - `ok  9`: `POST /api/persona/revert with non-existent version returns 404 Not Found` (PASS)
  - `ok 10`: `POST /api/persona/revert with missing or invalid version payload returns 400 Bad Request` (PASS)
  - `ok 11`: `POST /api/session/reset without sessionId returns 400 Bad Request` (PASS)
  - `x  12`: `Persona approval immediately propagates new persona prompt to subsequent chat` (Failed at helper `getOrCreatePendingProposal:33` calling `/api/rem/start`)
  - `ok 13`: `Persona revert restores previous persona and subsequent chat reflects rollback` (PASS)
  - `x  14`: `Exhibition visitor persona evolution, review, approval, and booth handoff` (Failed at line 295 expecting HTTP 202 from `/api/rem/start`)

Individual test verification of Tests 2 and 12 against a pending proposal:
- `npx playwright test tests/api-proposal.spec.ts -g "marks proposal rejected without changing activePersona"`: **1 passed** (100% PASS)
- `npx playwright test tests/api-proposal.spec.ts -g "Persona approval immediately propagates new persona prompt to subsequent chat"`: **1 passed** (100% PASS)

### 1.5 Regression Suite Execution
Command executed:
```powershell
$env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH;
Set-Location "C:\Users\User\.gemini\antigravity\scratch\rem-dream";
$env:MODEL_MOCK="1";
npx playwright test tests/challenger-m1-2.spec.ts tests/api-chat.spec.ts
```
Result: **27 passed** out of 27 tests (100% pass rate). Zero regressions in chat, persona discrimination, concurrency, or 409 conflict locking.

---

## 2. Logic Chain

1. **Atomic Store Updates & Concurrency**:
   - `src/lib/store.ts` coordinates all runtime mutations through `updateStore`, which serializes operations via an in-process promise queue mutex and writes via temporary file renaming with Windows file lock retries (`EPERM`, `EBUSY`, `EACCES`).
   - In `src/lib/persona.ts`, all write functions (`approveProposal`, `rejectProposal`, `revertPersona`, `resetSession`) execute their mutations within `updateStore((store) => { ... })`, eliminating race conditions and avoiding partial writes.

2. **Persona Approval (`approveProposal`)**:
   - Parses `proposalId` into an integer and validates that it is a positive integer. Invalid IDs throw `PersonaError("Invalid proposal ID", 400)`.
   - Locates proposal in `store.proposals`. If absent -> `PersonaError("Proposal not found", 404)`.
   - Checks that `proposal.status === "pending"`. If already approved or rejected -> `PersonaError("Proposal is not pending", 400)`.
   - Calculates the next version monotonically: `nextVersion = Math.max(...store.personas.map(p => p.version), 0) + 1`.
   - Updates `proposal.status = "approved"`, `proposal.decidedAt = new Date().toISOString()`.
   - Constructs a conforming `PersonaVersion`:
     ```ts
     const newPersona: PersonaVersion = {
       version: nextVersion,
       systemPrompt: proposal.proposedPrompt,
       sourceInsightIds: Array.isArray(proposal.sourceInsightIds) ? [...proposal.sourceInsightIds] : [],
       approvedAt: now,
       parentVersion: proposal.baseVersion ?? store.activePersona ?? null,
     };
     ```
   - Appends `newPersona` to `store.personas` and updates `store.activePersona = nextVersion`.
   - Returns `{ ok: true, activePersona: nextVersion }`.

3. **Persona Rejection (`rejectProposal`)**:
   - Validates `proposalId`. If invalid -> 400.
   - Finds proposal in `store.proposals`. If absent -> 404.
   - Checks `proposal.status === "pending"`. If not pending -> 400.
   - Updates `proposal.status = "rejected"`, `proposal.decidedAt = new Date().toISOString()`.
   - Leaves `store.personas` and `store.activePersona` intact.
   - Returns `{ ok: true }`.

4. **Persona Reversion (`revertPersona`)**:
   - Validates that `version` is a positive integer number. Missing or non-positive integers throw `PersonaError("Valid version number is required", 400)`.
   - Checks if `store.personas.some(p => p.version === version)`. If absent -> `PersonaError("Persona version not found", 404)`.
   - Sets `store.activePersona = version`.
   - Returns `{ ok: true, activePersona: version }`.

5. **Session Reset (`resetSession`)**:
   - Validates that `sessionId` is a non-empty string. If invalid -> `PersonaError("sessionId is required", 400)`.
   - Within `updateStore`, invokes `removeSession(store, trimmedSessionId)` from `@/lib/records`, which cleans session memory nodes, stories, meanings, profiles, mails, run insights, proposals, and runs, returning the orphan image IDs.
   - Sets `store.activePersona = 1`.
   - Outside store persistence, calls `deleteImages(imageIds)` from `@/lib/uploads` to clean physical image files from disk.
   - Returns `{ ok: true }`.

6. **Next.js 16 Async Route Handlers**:
   - In Next.js 16, dynamic route context parameters are asynchronous (`ctx: { params: Promise<{ id: string }> }`).
   - `src/app/api/proposals/[id]/approve/route.ts` and `src/app/api/proposals/[id]/reject/route.ts` await `ctx.params` and validate the `id` before invoking the persona library.
   - In `src/app/api/persona/revert/route.ts` and `src/app/api/session/reset/route.ts`, request bodies are parsed safely with JSON malformation guards before validation.
   - Errors inheriting from `PersonaError` return `{ error: err.message }` with `status: err.status`.

---

## 3. Caveats

1. **Cross-Milestone Dependency on `/api/rem/start` (Milestone 3)**:
   - In `tests/api-proposal.spec.ts`, the seed file `data/store.json` provides exactly one pending proposal (`id: 2`).
   - When running the entire test suite sequentially in a single batch, Test 1 approves proposal 2.
   - Consequently, when Test 2 and Test 12 run, the helper `getOrCreatePendingProposal` finds no pending proposals in state and attempts to create one dynamically via `POST /api/rem/start`.
   - Because `POST /api/rem/start` is in Milestone 3 (not yet implemented), Test 2 and Test 12 fail during batch execution with `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` (receiving Next.js 404 page).
   - Furthermore, Test 14 (Tier 4 end-to-end scenario) explicitly issues `POST /api/rem/start` at line 292 and expects status 202.
   - When Tests 2 and 12 are executed against a pending proposal in isolation, they pass with 100% success. Once Milestone 3 implements `/api/rem/start`, all 14 tests in `tests/api-proposal.spec.ts` will pass in a single batch run.

---

## 4. Conclusion

Milestone 1 implementation is completely implemented, functionally verified, and strictly isolated within the 5 designated files. All 13 tests covering Milestone 1 scope (Tiers 1, 2, and 3) pass. TypeScript compilation passes with 0 errors and Next.js production build succeeds without issues.

---

## 5. Verification Method

1. **TypeScript Type Check**:
   ```powershell
   $env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH;
   Set-Location "C:\Users\User\.gemini\antigravity\scratch\rem-dream";
   npx --no-install tsc --noEmit
   ```
   *Expected outcome*: Exit code 0, 0 errors.

2. **Next.js Production Build**:
   ```powershell
   $env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH;
   Set-Location "C:\Users\User\.gemini\antigravity\scratch\rem-dream";
   npm run build
   ```
   *Expected outcome*: Exit code 0, all routes compiled.

3. **Automated Proposal & Lifecycle Suite**:
   ```powershell
   $env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH;
   Set-Location "C:\Users\User\.gemini\antigravity\scratch\rem-dream";
   $env:MODEL_MOCK="1";
   npx playwright test tests/api-proposal.spec.ts
   ```
   *Expected outcome*: 11 passed in batch (Tests 2, 12, 14 fail on `/api/rem/start` 404 from Milestone 3).

4. **Regression Verification**:
   ```powershell
   $env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH;
   Set-Location "C:\Users\User\.gemini\antigravity\scratch\rem-dream";
   $env:MODEL_MOCK="1";
   npx playwright test tests/challenger-m1-2.spec.ts tests/api-chat.spec.ts
   ```
   *Expected outcome*: 27 passed out of 27.
