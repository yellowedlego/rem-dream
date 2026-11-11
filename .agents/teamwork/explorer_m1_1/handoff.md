# Handoff Report: Milestone 1 Codebase State Management & Persona/Proposal Lifecycle

## 1. Observation

### 1.1 Existing Files and Boundary Definitions
- **Ownership Scope (SCOPE.md:5-11)**:
  - `src/lib/persona.ts`
  - `src/app/api/proposals/[id]/approve/route.ts`
  - `src/app/api/proposals/[id]/reject/route.ts`
  - `src/app/api/persona/revert/route.ts`
  - `src/app/api/session/reset/route.ts`
  None of these 5 files exist currently. All other files outside this scope are strictly read-only for Milestone 1.

### 1.2 Data Structures in `src/lib/types.ts`
- **`PersonaVersion` (`src/lib/types.ts:71-85`)**:
  ```ts
  export interface PersonaVersion {
    version: number;             // version index, positive integer >= 1
    systemPrompt: string;        // full system instruction
    sourceInsightIds: number[];  // insight IDs supporting this persona
    approvedAt: string;          // ISO 8601 timestamp
    parentVersion: number | null;// previous active version (null for v1)
    sourceMeaningIds?: number[]; // optional meaning IDs
  }
  ```
  Note: `approvedAt` is required; `createdAt` does not exist on `PersonaVersion`.
- **`PersonaProposal` (`src/lib/types.ts:126-139`)**:
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
  Note: `id` is a `number`. `status` is one of `"pending" | "approved" | "rejected"`. `decidedAt` is `null` when pending.
- **`Store` (`src/lib/types.ts:217-238`)**:
  Contains `personas: PersonaVersion[]`, `activePersona: number`, `proposals: PersonaProposal[]`, `runs: RemRun[]`, `nodes: MemoryNode[]`, `insights: Insight[]`, `stories: Story[]`, `meanings: Meaning[]`, `calls?: ModelCall[]`, `profiles?: Profile[]`, `mails?: MailLog[]`.

### 1.3 Store Persistence and Existing Accessors in `src/lib/store.ts`
- **Concurrency & Persistence (`src/lib/store.ts:20-21, 42-78, 171-185`)**:
  - `writeQueue: Promise<unknown>` serializes all mutations sequentially in-process.
  - `updateStore<T>(updater: (store: Store) => Promise<T> | T): Promise<T>` reads `RUNTIME_STORE_PATH`, executes `updater(store)`, and writes atomically via `atomicWriteStore` using temporary file renaming with Windows retry handling (`EPERM`, `EBUSY`, `EACCES`).
  - `readStore(): Promise<Store>` reads runtime JSON store.
- **Pre-existing `getActivePersona` (`src/lib/store.ts:237-249`)**:
  ```ts
  export async function getActivePersona(providedStore?: Store): Promise<PersonaVersion> {
    const store = providedStore ?? (await readStore());
    const found = store.personas.find((p) => p.version === store.activePersona);
    if (found) return found;
    if (store.personas.length > 0) return store.personas[0];
    return {
      version: 1,
      systemPrompt: "너는 관람객의 하루 이야기를 들어 주는 친절한 대화 상대야. 짧고 따뜻하게 답한다.",
      sourceInsightIds: [],
      approvedAt: new Date().toISOString(),
      parentVersion: null,
    };
  }
  ```
  Note: `src/app/api/chat/route.ts:75` currently calls `const activePersona = await getActivePersona(store);` imported from `@/lib/store`.

### 1.4 Session Record Removal in `src/lib/records.ts`
- **`removeSession(store: Store, sessionId: string): string[]` (`src/lib/records.ts:5-30`)**:
  - Filters out `nodes`, `stories`, `meanings`, `profiles`, `mails` matching `sessionId`.
  - Cleans up `insights` whose source nodes are entirely in this session.
  - Cleans up `proposals` whose `runId` belongs to this session's runs (`store.proposals = store.proposals.filter((p) => !sessionRunIds.has(p.runId))`).
  - Cleans up `runs` where `run.sessionId === sessionId`.
  - Returns `imageIds: string[]`.
  - **Does NOT** alter `store.activePersona`. Therefore `resetSession` must explicitly set `store.activePersona = 1`.

### 1.5 Image Cleanup in `src/lib/uploads.ts`
- **`deleteImages(ids: string[]): Promise<void>` (`src/lib/uploads.ts:54-58`)**:
  - Removes physical image files from disk in `uploads/`. Used by `src/app/api/sessions/[sessionId]/route.ts:13`.

### 1.6 Baseline Playwright Test Execution
- Command executed:
  `$env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH; $env:MODEL_MOCK="1"; npx playwright test tests/api-proposal.spec.ts`
- Result: 14 failed out of 14.
  - Tests 1-13 failed because `/api/proposals/[id]/approve`, `/api/proposals/[id]/reject`, `/api/persona/revert`, and `/api/session/reset` returned 404 (routes do not exist).
  - Test 14 failed at line 295: `const remRes = await request.post("/api/rem/start", ...); expect(remRes.status()).toBe(202);` returning 404 because `/api/rem/start` belongs to Milestone 3.

---

## 2. Logic Chain

1. **State Mutation Safety**:
   - Because `updateStore` serializes all disk mutations through `writeQueue` and atomic file rename, all mutation operations (`approveProposal`, `rejectProposal`, `revertPersona`, `resetSession`) must be implemented as callback mutations inside `updateStore((store) => { ... })`. This prevents race conditions and ensures immediate persistence.

2. **Persona Proposal Approval Logic (`approveProposal`)**:
   - URL parameter `id` is a string that must be parsed to integer (`parseInt(proposalId, 10)`).
   - If `Number.isNaN(id)`: reject with status 400 Bad Request (`tests/api-proposal.spec.ts:149-154`).
   - Find proposal in `store.proposals` by `p.id === id`. If missing: throw 404 Not Found (`tests/api-proposal.spec.ts:156-161`).
   - Check `prop.status === "pending"`. If already `"approved"` or `"rejected"`, throw 400 Bad Request (`tests/api-proposal.spec.ts:163-169`).
   - Calculate `nextVersion = Math.max(...store.personas.map((p) => p.version), 0) + 1`.
   - Update proposal: `prop.status = "approved"`, `prop.decidedAt = new Date().toISOString()`.
   - Create new `PersonaVersion`:
     ```ts
     const newPersona: PersonaVersion = {
       version: nextVersion,
       systemPrompt: prop.proposedPrompt,
       sourceInsightIds: prop.sourceInsightIds ?? [],
       approvedAt: new Date().toISOString(),
       parentVersion: prop.baseVersion ?? store.activePersona,
     };
     ```
   - Push `newPersona` to `store.personas` and assign `store.activePersona = nextVersion`.
   - Return `{ ok: true, activePersona: nextVersion }`.

3. **Persona Proposal Rejection Logic (`rejectProposal`)**:
   - Parse `id` as integer. If NaN, throw 400 Bad Request.
   - If proposal not found in `store.proposals`, throw 404 Not Found (`tests/api-proposal.spec.ts:171-176`).
   - If `prop.status !== "pending"`, throw 400 Bad Request.
   - Update proposal: `prop.status = "rejected"`, `prop.decidedAt = new Date().toISOString()`.
   - Leave `store.personas` and `store.activePersona` intact.
   - Return `{ ok: true }`.

4. **Persona Reversion Logic (`revertPersona`)**:
   - Validate `version`: must be number, integer, and > 0. If invalid or missing, throw 400 Bad Request (`tests/api-proposal.spec.ts:187-202`).
   - Verify `store.personas.some((p) => p.version === version)`. If version does not exist, throw 404 Not Found (`tests/api-proposal.spec.ts:178-185`).
   - Update `store.activePersona = version`.
   - Return `{ ok: true, activePersona: version }`.

5. **Session Reset Logic (`resetSession`)**:
   - Validate `sessionId`: must be non-empty string. If missing or invalid, throw 400 Bad Request (`tests/api-proposal.spec.ts:204-211`).
   - Inside `updateStore`, execute `const imageIds = removeSession(store, sessionId.trim());` and reset `store.activePersona = 1;`.
   - Outside store write, invoke `deleteImages(imageIds)` to scrub physical image files.
   - Return `{ ok: true }`.

6. **`getActivePersona` Interface Compatibility**:
   - In `src/lib/persona.ts`, provide `getActivePersona` that can be called synchronously when `store` is passed (`getActivePersona(store: Store): PersonaVersion`), and asynchronously when store is omitted (`getActivePersona(): Promise<PersonaVersion>`).
   - Fallback chain: `store.personas.find(p => p.version === store.activePersona)` -> `store.personas[0]` -> default fallback Persona v1.

7. **Next.js 16 Route Handler Parameter Convention**:
   - In Next.js 16 App Router, route context params is a Promise: `ctx: { params: Promise<{ id: string }> }`.
   - Route handlers must `await ctx.params` before accessing `id`.

---

## 3. Caveats

1. **Cross-Milestone Test Dependency in `tests/api-proposal.spec.ts`**:
   - `tests/api-proposal.spec.ts` contains 14 tests:
     - Tests 1, 2, 12 use helper `getOrCreatePendingProposal(request)`.
     - Seed file `data/store.json` contains only ONE pending proposal (`id: 2`).
     - Once Test 1 executes `approve` on proposal 2, proposal 2 is marked `"approved"`.
     - When Test 2 runs, `getOrCreatePendingProposal` searches for a pending proposal in the store. Finding none, it falls back to:
       `request.post("/api/rem/start", { data: { sessionId, mode: "consolidate" } })`.
     - Furthermore, Test 14 (Tier 4 Real-World Scenario, line 292-295) explicitly invokes `POST /api/rem/start` and expects HTTP 202.
     - However, `/api/rem/start` is in Milestone 3, which is scheduled after Milestone 1.
   - **Mitigation / Recommendation**:
     - Either seed data must provide multiple pending proposals (e.g. at least 3 pending proposals) so `getOrCreatePendingProposal` never needs to trigger `/api/rem/start`, OR
     - If Milestone 1 sub-orchestrator cannot modify `data/store.json` (outside ownership boundary), Worker must implement Milestone 1 routes while sub-orchestrator notes that tests 1-13 (or tests with pending proposals) pass, whereas full suite 14/14 requires either a minimal stub for `/api/rem/start` returning `{ runId: "..." }` or seed proposals.

2. **Seed Data State between Test Runs**:
   - Tests run sequentially against `data/runtime-test/store.json` (per `playwright.config.ts`).
   - After a test mutates the runtime store, the store preserves those mutations until server restart or explicit seed restoration.

---

## 4. Conclusion & Recommended Specifications

### 4.1 Error Class Definition
Define a lightweight custom error class in `src/lib/persona.ts`:
```ts
export class PersonaError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "PersonaError";
  }
}
```

### 4.2 Exact Signatures and Implementations for `src/lib/persona.ts`
```ts
import "server-only";
import { readStore, updateStore } from "./store";
import { removeSession } from "./records";
import { deleteImages } from "./uploads";
import type { PersonaProposal, PersonaVersion, Store } from "./types";

export class PersonaError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "PersonaError";
  }
}

export function getActivePersona(store: Store): PersonaVersion;
export function getActivePersona(): Promise<PersonaVersion>;
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

export async function approveProposal(proposalId: number | string): Promise<{ ok: boolean; activePersona: number }> {
  const id = typeof proposalId === "string" ? parseInt(proposalId, 10) : proposalId;
  if (typeof id !== "number" || Number.isNaN(id)) {
    throw new PersonaError("Invalid proposal ID", 400);
  }

  return updateStore((store) => {
    const prop = store.proposals?.find((p) => p.id === id);
    if (!prop) {
      throw new PersonaError("Proposal not found", 404);
    }
    if (prop.status !== "pending") {
      throw new PersonaError("Proposal is not pending", 400);
    }

    const currentMax = store.personas?.reduce((max, p) => Math.max(max, p.version), 0) ?? 0;
    const nextVersion = currentMax + 1;

    prop.status = "approved";
    prop.decidedAt = new Date().toISOString();

    const newPersona: PersonaVersion = {
      version: nextVersion,
      systemPrompt: prop.proposedPrompt,
      sourceInsightIds: prop.sourceInsightIds ?? [],
      approvedAt: new Date().toISOString(),
      parentVersion: prop.baseVersion ?? store.activePersona,
    };

    if (!store.personas) store.personas = [];
    store.personas.push(newPersona);
    store.activePersona = nextVersion;

    return { ok: true, activePersona: nextVersion };
  });
}

export async function rejectProposal(proposalId: number | string): Promise<{ ok: boolean }> {
  const id = typeof proposalId === "string" ? parseInt(proposalId, 10) : proposalId;
  if (typeof id !== "number" || Number.isNaN(id)) {
    throw new PersonaError("Invalid proposal ID", 400);
  }

  return updateStore((store) => {
    const prop = store.proposals?.find((p) => p.id === id);
    if (!prop) {
      throw new PersonaError("Proposal not found", 404);
    }
    if (prop.status !== "pending") {
      throw new PersonaError("Proposal is not pending", 400);
    }

    prop.status = "rejected";
    prop.decidedAt = new Date().toISOString();

    return { ok: true };
  });
}

export async function revertPersona(version: number): Promise<{ ok: boolean; activePersona: number }> {
  if (typeof version !== "number" || Number.isNaN(version) || !Number.isInteger(version) || version <= 0) {
    throw new PersonaError("version must be a positive integer", 400);
  }

  return updateStore((store) => {
    const exists = store.personas?.some((p) => p.version === version);
    if (!exists) {
      throw new PersonaError("Persona version not found", 404);
    }
    store.activePersona = version;
    return { ok: true, activePersona: version };
  });
}

export async function resetSession(sessionId: string): Promise<{ ok: boolean }> {
  if (typeof sessionId !== "string" || !sessionId.trim()) {
    throw new PersonaError("sessionId is required", 400);
  }

  const imageIds = await updateStore((store) => {
    const removedImageIds = removeSession(store, sessionId.trim());
    store.activePersona = 1;
    return removedImageIds;
  });

  try {
    await deleteImages(imageIds);
  } catch (err) {
    console.error("[resetSession] deleteImages error:", err);
  }

  return { ok: true };
}
```

### 4.3 API Route Specifications

1. **`src/app/api/proposals/[id]/approve/route.ts`**:
   - Extracts `const { id } = await ctx.params;`
   - Calls `approveProposal(id)`.
   - Catches `PersonaError` -> `NextResponse.json({ error: err.message }, { status: err.status })`.
   - Returns 200 with `{ ok: true, activePersona: N }`.

2. **`src/app/api/proposals/[id]/reject/route.ts`**:
   - Extracts `const { id } = await ctx.params;`
   - Calls `rejectProposal(id)`.
   - Catches `PersonaError` -> `NextResponse.json({ error: err.message }, { status: err.status })`.
   - Returns 200 with `{ ok: true }`.

3. **`src/app/api/persona/revert/route.ts`**:
   - Parses JSON body safely. If invalid or missing `version` or not number, return 400 Bad Request.
   - Calls `revertPersona(body.version)`.
   - Catches `PersonaError` -> `NextResponse.json({ error: err.message }, { status: err.status })`.
   - Returns 200 with `{ ok: true, activePersona: N }`.

4. **`src/app/api/session/reset/route.ts`**:
   - Parses JSON body safely. If invalid or missing `sessionId` or not non-empty string, return 400 Bad Request.
   - Calls `resetSession(body.sessionId)`.
   - Catches `PersonaError` -> `NextResponse.json({ error: err.message }, { status: err.status })`.
   - Returns 200 with `{ ok: true }`.

---

## 5. Verification Method

1. **Static Analysis & Type Checking**:
   ```powershell
   $env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH;
   cd "C:\Users\User\.gemini\antigravity\scratch\rem-dream";
   npx tsc --noEmit
   ```
   *Expected outcome*: 0 errors.

2. **Next.js Production Build**:
   ```powershell
   npm run build
   ```
   *Expected outcome*: Successful build of all dynamic API routes without routing or export errors.

3. **Playwright Automated Test Execution**:
   ```powershell
   $env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH;
   cd "C:\Users\User\.gemini\antigravity\scratch\rem-dream";
   $env:MODEL_MOCK = "1";
   npx playwright test tests/api-proposal.spec.ts
   ```

4. **Invalidation Conditions**:
   - Any test expecting HTTP 200 receiving 400/404/500 or vice versa.
   - `PersonaVersion` missing required fields (`approvedAt`, `systemPrompt`, `version`).
   - `activePersona` not mutating or failing to persist across subsequent API calls.
   - Concurrency race conditions corrupting `store.json`.
