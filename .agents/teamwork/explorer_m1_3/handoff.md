# Milestone 1: Persona & Proposal Lifecycle — Architecture & Route Conventions Investigation

## 1. Observation

### 1.1 Project Environment & Next.js Version
- `package.json` lines 12–15:
  ```json
  "dependencies": {
    "next": "16.4.5",
    "nodemailer": "10.2.1",
    "qrcode": "1.5.4",
    "react": "19.3.0",
    "react-dom": "19.3.0",
    "server-only": "^0.0.1"
  }
  ```
- Toolchain environment confirmed: Node.js `v22.20.0` at `C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64\node.exe`.
- TypeScript compilation check (`npx tsc --noEmit`) passes with 0 errors on the baseline codebase.

### 1.2 Route Parameter & Response Conventions in Existing Handlers
Existing dynamic route handlers under `src/app/api/` confirm Next.js 16 dynamic route conventions:
1. `src/app/api/insights/[id]/route.ts` lines 4–8:
   ```ts
   export async function DELETE(
     _req: Request,
     ctx: { params: Promise<{ id: string }> }
   ) {
     const { id } = await ctx.params;
     const numId = parseInt(id, 10);
   ```
2. `src/app/api/nodes/[id]/route.ts` lines 5–9:
   ```ts
   export async function DELETE(
     _req: Request,
     ctx: { params: Promise<{ id: string }> }
   ) {
     const { id } = await ctx.params;
     const numId = parseInt(id, 10);
   ```
3. `src/app/api/sessions/[sessionId]/route.ts` lines 7–8:
   ```ts
   export async function DELETE(_req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
     const { sessionId } = await ctx.params;
   ```
4. Response formatting convention:
   - Success responses: `NextResponse.json({ ok: true, ... }, { status: 200 })`
   - Client errors: `NextResponse.json({ error: string }, { status: 400 | 404 | 409 | 413 })`
   - Server errors: `NextResponse.json({ error: "..." }, { status: 500 | 502 })`
5. JSON body parsing edge cases:
   - `src/app/api/chat/route.ts` lines 23–32:
     ```ts
     let body: ChatRequestBody;
     try {
       body = (await req.json()) as ChatRequestBody;
     } catch {
       return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
     }
     if (!body || typeof body !== "object") {
       return NextResponse.json({ error: "Request body must be a valid JSON object" }, { status: 400 });
     }
     ```

### 1.3 Existing Store, Record, and Upload Infrastructure
1. `src/lib/types.ts`:
   - `PersonaVersion` (lines 71–84):
     ```ts
     export interface PersonaVersion {
       version: number;
       systemPrompt: string;
       sourceInsightIds: number[];
       approvedAt: string;
       parentVersion: number | null;
       sourceMeaningIds?: number[];
     }
     ```
   - `PersonaProposal` (lines 126–139):
     ```ts
     export interface PersonaProposal {
       id: number;
       runId: string;
       sourceInsightIds: number[];
       proposedPrompt: string;
       summary: string;
       baseVersion: number;
       status: "pending" | "approved" | "rejected";
       createdAt: string;
       decidedAt: string | null;
     }
     ```
   - `Store` (lines 217–237):
     ```ts
     export interface Store {
       nodes: MemoryNode[];
       insights: Insight[];
       personas: PersonaVersion[];
       activePersona: number;
       proposals: PersonaProposal[];
       runs: RemRun[];
       ...
     }
     ```
2. `src/lib/store.ts`:
   - `updateStore<T>(updater: (store: Store) => Promise<T> | T): Promise<T>` manages an in-process serial promise queue mutex (`writeQueue`) and writes atomically via temporary file rename with retry loop (lines 42–78, 171–185).
   - `getActivePersona(providedStore?: Store): Promise<PersonaVersion>` (lines 237–249) looks up `store.personas.find(p => p.version === store.activePersona)`.
3. `src/lib/records.ts`:
   - `removeSession(store: Store, sessionId: string): string[]` (lines 5–30) cleans all nodes, stories, meanings, profiles, mails, run insights, session proposals (`!sessionRunIds.has(p.runId)`), and runs for that session, returning an array of image IDs to be deleted.
4. `src/lib/uploads.ts`:
   - `deleteImages(ids: string[]): Promise<void>` (lines 54–58) removes image files from disk gracefully.

### 1.4 Test Suite Baseline Execution
Command run:
```powershell
$env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH; $env:MODEL_MOCK="1"; npx playwright test tests/api-proposal.spec.ts
```
Direct observation: All 14 tests in `tests/api-proposal.spec.ts` failed with HTTP 404 because the 4 route handlers do not yet exist:
- `POST /api/proposals/[id]/approve` -> 404
- `POST /api/proposals/[id]/reject` -> 404
- `POST /api/persona/revert` -> 404
- `POST /api/session/reset` -> 404
- `src/lib/persona.ts` is absent.

---

## 2. Logic Chain

1. **Next.js 16 Route Parameter Handling**:
   - *Premise*: Next.js 16.4.5 enforces asynchronous route parameters in route handlers (`ctx: { params: Promise<{ ... }> }`).
   - *Observation*: As observed in `src/app/api/insights/[id]/route.ts:6-8` and `src/app/api/nodes/[id]/route.ts:7-9`, dynamic params must be resolved via `const { id } = await ctx.params`. Synchronous access will fail or return `undefined`.
   - *Inference*: Both `src/app/api/proposals/[id]/approve/route.ts` and `src/app/api/proposals/[id]/reject/route.ts` must type `ctx: { params: Promise<{ id: string }> }` and `await ctx.params`.

2. **Parameter Type Casting & Bad Request Rejection**:
   - *Observation*: `tests/api-proposal.spec.ts:149-155` tests `POST /api/proposals/invalid-non-numeric/approve` expecting status `400` with an `{ error }` payload.
   - *Inference*: The route handlers must execute `const numId = parseInt(id, 10);` and check `Number.isNaN(numId)`. If NaN, return `NextResponse.json({ error: "Invalid proposal ID" }, { status: 400 })`.

3. **Atomic Store Modification & Race Condition Prevention**:
   - *Observation*: `src/lib/store.ts` provides `updateStore(updater)`. Concurrency tests in `tests/challenger-m1-2.spec.ts:450-492` show that all disk mutations rely on `updateStore` to prevent data corruption.
   - *Inference*: All operations in `src/lib/persona.ts` (`approveProposal`, `rejectProposal`, `revertPersona`, `resetSession`) must wrap mutations inside `updateStore(...)`.

4. **Proposal Approval State Transition**:
   - *Observation*: In `tests/api-proposal.spec.ts:61-82`, approving proposal with ID 2 creates a new `PersonaVersion` with version incremented to 3, sets `activePersona = 3`, updates the proposal to `status: "approved"` and `decidedAt` to current timestamp, and returns `{ ok: true, activePersona: 3 }`.
   - *Observation*: `tests/api-proposal.spec.ts:163-169` tests approving an already approved proposal (e.g. ID 1) expecting `400` Bad Request.
   - *Observation*: `tests/api-proposal.spec.ts:156-162` tests approving a non-existent proposal ID expecting `404` Not Found.
   - *Inference*: `approveProposal` must locate the proposal by `id`. If missing -> 404 error; if `status !== "pending"` -> 400 error. The new version must be computed via `(store.personas ?? []).reduce((max, p) => Math.max(max, p.version), 0) + 1`. The new `PersonaVersion` must set `systemPrompt: proposal.proposedPrompt`, `sourceInsightIds: proposal.sourceInsightIds ?? []`, `approvedAt: now`, `parentVersion: proposal.baseVersion ?? store.activePersona ?? null`.

5. **Proposal Rejection State Transition**:
   - *Observation*: In `tests/api-proposal.spec.ts:84-105`, rejecting a proposal sets `status: "rejected"` and `decidedAt: now`, leaves `store.activePersona` strictly unchanged, and returns `{ ok: true }`.
   - *Observation*: `tests/api-proposal.spec.ts:171-176` tests rejecting a non-existent proposal ID expecting `404` Not Found.
   - *Inference*: `rejectProposal` must check presence (404) and pending status (400 if not pending), mutate only `status` and `decidedAt`, leaving `activePersona` unchanged.

6. **Persona Reversion State Transition**:
   - *Observation*: In `tests/api-proposal.spec.ts:107-119` and `178-202`, `POST /api/persona/revert` accepts `{ version: number }`. It must return 400 if version is missing, not a number, non-integer, or <= 0. If version is not in `store.personas`, return 404. If valid, set `store.activePersona = version` without modifying `store.personas` array, returning `{ ok: true, activePersona: version }`.

7. **Session Reset State Transition**:
   - *Observation*: In `tests/api-proposal.spec.ts:121-143` and `204-211`, `POST /api/session/reset` accepts `{ sessionId: string }`. If `sessionId` is missing or empty, return 400.
   - *Observation*: `src/lib/records.ts:removeSession` removes session memory nodes, stories, meanings, profiles, mails, run insights, session proposals, and runs, returning orphan `imageIds`.
   - *Inference*: `resetSession` must call `removeSession(store, sessionId.trim())`, set `store.activePersona = 1`, call `deleteImages(imageIds)` if any images were removed, and return `{ ok: true }`.

---

## 3. Caveats

1. **`tests/api-proposal.spec.ts` Tier 4 REM Dependency**:
   - *Finding*: Tests 1 through 13 in `tests/api-proposal.spec.ts` (Tiers 1, 2, and 3) test the persona & proposal lifecycle in isolation using seed proposal data (seed proposal `id: 2` is `pending`).
   - *Caveat*: Test 14 (Tier 4 scenario: lines 280–345) invokes `POST /api/rem/start` at line 292:
     ```ts
     const remRes = await request.post("/api/rem/start", {
       data: { sessionId: visitorSession, mode: "consolidate" },
     });
     expect(remRes.status()).toBe(202);
     ```
     `/api/rem/start` is owned by Milestone 3 (REM Engine Core & APIs) and does not exist in Milestone 1.
   - *Implication for Verification*: While M1 routes are standalone, test 14 requires M3 to pass completely. During M1 verification, running `npx playwright test tests/api-proposal.spec.ts --grep-invert "Tier 4"` will verify 100% of M1 functionality (13/13 passing). Once M3 is implemented, test 14 will automatically pass.

2. **`getActivePersona` Export Dual-Location**:
   - *Observation*: `src/lib/store.ts` already exports `getActivePersona(providedStore?: Store)`. `src/app/api/chat/route.ts:2` imports it from `@/lib/store`.
   - *Constraint*: `SCOPE.md` and `PROJECT.md` require `src/lib/persona.ts` to export `getActivePersona`.
   - *Resolution*: `src/lib/persona.ts` should export `getActivePersona` as specified, supporting both synchronous lookup when a `Store` is passed and async lookup when omitted. Do NOT break or remove the existing export in `src/lib/store.ts`.

---

## 4. Conclusion & Implementation Blueprints

The Worker must implement exactly the following 5 files with no modifications outside these boundaries.

### 4.1 File 1: `src/lib/persona.ts`
```ts
import "server-only";
import { readStore, updateStore } from "./store";
import { removeSession } from "./records";
import { deleteImages } from "./uploads";
import type { PersonaVersion, Store } from "./types";

export class PersonaError extends Error {
  constructor(message: string, public status: number = 400) {
    super(message);
    this.name = "PersonaError";
  }
}

/**
 * Returns the currently active persona version object.
 * If store is provided, returns synchronously; otherwise reads from store asynchronously.
 */
export function getActivePersona(store: Store): PersonaVersion;
export function getActivePersona(store?: Store): Promise<PersonaVersion>;
export function getActivePersona(store?: Store): PersonaVersion | Promise<PersonaVersion> {
  if (store) {
    const found = store.personas?.find((p) => p.version === store.activePersona);
    if (found) return found;
    if (store.personas && store.personas.length > 0) return store.personas[0];
    return {
      version: 1,
      systemPrompt: "너는 관람객의 하루 이야기를 들어 주는 친절한 대화 상대야. 짧고 따뜻하게 답한다.",
      sourceInsightIds: [],
      approvedAt: new Date().toISOString(),
      parentVersion: null,
    };
  }
  return readStore().then((s) => getActivePersona(s));
}

/**
 * Approves a pending persona proposal:
 * - Finds proposal by ID (throws 404 if not found, 400 if not pending)
 * - Sets proposal status = 'approved', decidedAt = now
 * - Calculates nextVersion = max(persona.version) + 1
 * - Appends new PersonaVersion to store.personas
 * - Sets store.activePersona = nextVersion
 */
export async function approveProposal(
  proposalId: number | string
): Promise<{ ok: boolean; activePersona: number }> {
  const numId = typeof proposalId === "string" ? parseInt(proposalId, 10) : proposalId;
  if (typeof numId !== "number" || Number.isNaN(numId)) {
    throw new PersonaError("Invalid proposal ID", 400);
  }

  return updateStore((store) => {
    if (!Array.isArray(store.proposals)) {
      store.proposals = [];
    }
    const proposal = store.proposals.find((p) => p.id === numId);
    if (!proposal) {
      throw new PersonaError("Proposal not found", 404);
    }
    if (proposal.status !== "pending") {
      throw new PersonaError("Proposal is not pending", 400);
    }

    if (!Array.isArray(store.personas)) {
      store.personas = [];
    }

    const nextVersion = store.personas.reduce((max, p) => Math.max(max, p.version), 0) + 1;
    const now = new Date().toISOString();

    proposal.status = "approved";
    proposal.decidedAt = now;

    const newPersona: PersonaVersion = {
      version: nextVersion,
      systemPrompt: proposal.proposedPrompt,
      sourceInsightIds: proposal.sourceInsightIds ?? [],
      approvedAt: now,
      parentVersion: proposal.baseVersion ?? store.activePersona ?? null,
    };
    // Include createdAt for compatibility with schemas expecting either approvedAt or createdAt
    (newPersona as Record<string, unknown>).createdAt = now;

    store.personas.push(newPersona);
    store.activePersona = nextVersion;

    return { ok: true, activePersona: nextVersion };
  });
}

/**
 * Rejects a pending persona proposal:
 * - Finds proposal by ID (throws 404 if not found, 400 if not pending)
 * - Sets proposal status = 'rejected', decidedAt = now
 * - store.activePersona remains unchanged
 */
export async function rejectProposal(
  proposalId: number | string
): Promise<{ ok: boolean }> {
  const numId = typeof proposalId === "string" ? parseInt(proposalId, 10) : proposalId;
  if (typeof numId !== "number" || Number.isNaN(numId)) {
    throw new PersonaError("Invalid proposal ID", 400);
  }

  return updateStore((store) => {
    if (!Array.isArray(store.proposals)) {
      store.proposals = [];
    }
    const proposal = store.proposals.find((p) => p.id === numId);
    if (!proposal) {
      throw new PersonaError("Proposal not found", 404);
    }
    if (proposal.status !== "pending") {
      throw new PersonaError("Proposal is not pending", 400);
    }

    const now = new Date().toISOString();
    proposal.status = "rejected";
    proposal.decidedAt = now;

    return { ok: true };
  });
}

/**
 * Reverts active persona to an existing version:
 * - Validates version number (throws 400 if invalid)
 * - Checks if version exists in store.personas (throws 404 if not found)
 * - Updates store.activePersona = version
 */
export async function revertPersona(
  version: number
): Promise<{ ok: boolean; activePersona: number }> {
  if (typeof version !== "number" || !Number.isInteger(version) || version <= 0) {
    throw new PersonaError("Valid version number is required", 400);
  }

  return updateStore((store) => {
    if (!Array.isArray(store.personas)) {
      store.personas = [];
    }
    const exists = store.personas.some((p) => p.version === version);
    if (!exists) {
      throw new PersonaError("Persona version not found", 404);
    }

    store.activePersona = version;
    return { ok: true, activePersona: version };
  });
}

/**
 * Resets visitor session:
 * - Clears session memory nodes, stories, meanings, profiles, mails, insights, proposals, runs
 * - Deletes associated uploaded image files
 * - Resets store.activePersona = 1
 */
export async function resetSession(
  sessionId: string
): Promise<{ ok: boolean }> {
  if (typeof sessionId !== "string" || !sessionId.trim()) {
    throw new PersonaError("sessionId is required", 400);
  }

  const trimmedSessionId = sessionId.trim();
  const imageIds = await updateStore((store) => {
    const cleanedImageIds = removeSession(store, trimmedSessionId);
    store.activePersona = 1;
    return cleanedImageIds;
  });

  if (imageIds && imageIds.length > 0) {
    await deleteImages(imageIds);
  }

  return { ok: true };
}
```

### 4.2 File 2: `src/app/api/proposals/[id]/approve/route.ts`
```ts
import { NextResponse } from "next/server";
import { approveProposal, PersonaError } from "@/lib/persona";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const numId = parseInt(id, 10);
    if (Number.isNaN(numId)) {
      return NextResponse.json({ error: "Invalid proposal ID" }, { status: 400 });
    }

    const result = await approveProposal(numId);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof PersonaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[/api/proposals/[id]/approve] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

### 4.3 File 3: `src/app/api/proposals/[id]/reject/route.ts`
```ts
import { NextResponse } from "next/server";
import { rejectProposal, PersonaError } from "@/lib/persona";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const numId = parseInt(id, 10);
    if (Number.isNaN(numId)) {
      return NextResponse.json({ error: "Invalid proposal ID" }, { status: 400 });
    }

    const result = await rejectProposal(numId);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof PersonaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[/api/proposals/[id]/reject] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

### 4.4 File 4: `src/app/api/persona/revert/route.ts`
```ts
import { NextResponse } from "next/server";
import { revertPersona, PersonaError } from "@/lib/persona";

interface RevertRequestBody {
  version?: unknown;
}

export async function POST(req: Request) {
  let body: RevertRequestBody;
  try {
    body = (await req.json()) as RevertRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be a valid JSON object" }, { status: 400 });
  }

  if (
    body.version === undefined ||
    body.version === null ||
    typeof body.version !== "number" ||
    !Number.isInteger(body.version) ||
    body.version <= 0
  ) {
    return NextResponse.json({ error: "Valid version number is required" }, { status: 400 });
  }

  try {
    const result = await revertPersona(body.version);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof PersonaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[/api/persona/revert] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

### 4.5 File 5: `src/app/api/session/reset/route.ts`
```ts
import { NextResponse } from "next/server";
import { resetSession, PersonaError } from "@/lib/persona";

interface ResetRequestBody {
  sessionId?: unknown;
}

export async function POST(req: Request) {
  let body: ResetRequestBody;
  try {
    body = (await req.json()) as ResetRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Request body must be a valid JSON object" }, { status: 400 });
  }

  if (typeof body.sessionId !== "string" || !body.sessionId.trim()) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  try {
    const result = await resetSession(body.sessionId.trim());
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof PersonaError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[/api/session/reset] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

---

## 5. Verification Method

### 5.1 Verification Commands
The Worker, Reviewers, and Forensic Auditor should execute the following commands in PowerShell from the project root (`C:\Users\User\.gemini\antigravity\scratch\rem-dream`):

1. **TypeScript Compilation Check**:
   ```powershell
   $env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH; npx tsc --noEmit
   ```
   *Expected result*: Exit code 0, 0 errors.

2. **Milestone 1 Test Suite Execution**:
   ```powershell
   $env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH; $env:MODEL_MOCK="1"; npx playwright test tests/api-proposal.spec.ts --grep-invert "Tier 4"
   ```
   *Expected result*: 13 passed (100% of Tiers 1, 2, and 3 passing).

3. **Existing Chat & Regression Tests**:
   ```powershell
   $env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH; $env:MODEL_MOCK="1"; npx playwright test tests/api-chat.spec.ts
   ```
   *Expected result*: All chat regression tests pass.

4. **Next.js Production Build**:
   ```powershell
   $env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH; npm run build
   ```
   *Expected result*: Exit code 0, Next.js build output includes all dynamic route endpoints.

### 5.2 Invalidation Conditions
This design is invalidated if:
- Next.js route parameter typing causes a build error with Next.js 16 type generator.
- `updateStore` throws unhandled promise rejections on validation errors (mitigated by catching `PersonaError`).
- Any test in Tiers 1–3 of `tests/api-proposal.spec.ts` fails to receive expected `{ ok: true, activePersona: N }`, `{ ok: true }`, or `{ error: string }`.
