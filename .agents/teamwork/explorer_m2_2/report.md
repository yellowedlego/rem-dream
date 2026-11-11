# Explorer 2 Investigation Report: Store Implementation, Call Logging, and Next.js API Conventions

**Milestone**: Milestone 2 (Debug Telemetry & Metrics — Stage 6)  
**Agent**: Explorer 2 (`explorer_m2_2`)  
**Target Routes**: `src/app/api/debug/calls/route.ts`, `src/app/api/debug/metrics/route.ts`  
**Date**: 2026-11-11  

---

## 1. Executive Summary

An in-depth investigation was performed across `src/lib/store.ts`, `src/lib/types.ts`, `src/lib/model/client.ts`, existing `src/app/api/*` routes, and `tests/api-debug.spec.ts`. 

Key findings:
1. **Model calls storage and ring buffer already exist**: `addModelCall()` in `src/lib/store.ts` automatically manages `store.calls`, enforcing an autoincrement integer `id`, ISO timestamp `at`, and a maximum sliding buffer limit of 200 calls (`slice(-200)`).
2. **Call logging occurs in `src/lib/model/client.ts`**: (Note: `src/lib/model.ts` does not exist; the actual implementation is `src/lib/model/client.ts`). Every call to `callModel()` records to `store.calls` inside its `finally` block.
3. **Critical Schema Difference (SCOPE.md vs Codebase)**: `sub_orch_m2/SCOPE.md` referenced hypothetical property names (`promptTokens`, `completionTokens`, `durationMs`, `success`). However, both the actual type definition (`src/lib/types.ts`) and the test suite (`tests/api-debug.spec.ts`) strictly expect:
   - For `ModelCall`: `id`, `at`, `purpose`, `runId`, `model`, `temperature`, `prompt`, `response`, `inputTokens`, `outputTokens`, `ms`, `error`.
   - For Metrics: `nodesCount`, `insightsCount`, `proposalsCount`, `runsCount`, `callsCount`, `totalInputTokens`, `totalOutputTokens`, `totalTokens`, `averageLatencyMs`, `errorCount`.
4. **Next.js 16 Route Handlers**: All dynamic GET handlers in `src/app/api/` import `connection` and `NextResponse` from `next/server`. Handlers await `connection()` at the top of the function to ensure request-time execution and return responses via `NextResponse.json(payload, { status: 200 })`.

---

## 2. Store Implementation & `ModelCall` Schema

### 2.1 Interface Definition (`src/lib/types.ts`)
Lines 141–158:
```typescript
export type ModelPurpose = "chat" | "story-split" | "story-meaning" | "rem-step" | "rem-proposal" | "profile" | "compare";

export interface ModelCall {
  id: number;
  at: string;
  purpose: ModelPurpose;
  runId: string | null;
  model: string;
  temperature: number;
  prompt: string;
  response: string;
  inputTokens: number | null;
  outputTokens: number | null;
  ms: number;
  error: string | null;
}
```

Lines 217–237 (`Store` interface):
```typescript
export interface Store {
  nodes: MemoryNode[];
  insights: Insight[];
  personas: PersonaVersion[];
  activePersona: number;
  proposals: PersonaProposal[];
  runs: RemRun[];
  calls?: ModelCall[];
  stories: Story[];
  meanings: Meaning[];
  profiles?: Profile[];
  mails?: MailLog[];
}
```

### 2.2 Store Operations (`src/lib/store.ts`)
- **Reading**: `readStore(): Promise<Store>` reads `data/runtime/store.json` (or falls back to `data/store.json` seed) using serial retry logic and JSON parsing.
- **Initialization**: `doEnsureStore()` initializes `if (!store.calls) store.calls = [];`.
- **Reset**: `resetStore()` restores `store.calls = seed.calls ?? [];` (which is `[]` in `data/store.json`).
- **Call insertion and Ring Buffer**:
  ```typescript
  export async function addModelCall(
    callData: Omit<ModelCall, "id" | "at">
  ): Promise<ModelCall> {
    return updateStore((store) => {
      if (!store.calls) {
        store.calls = [];
      }
      const maxId = store.calls.reduce((max, c) => Math.max(max, c.id), 0);
      const newRecord: ModelCall = {
        ...callData,
        id: maxId + 1,
        at: new Date().toISOString(),
      };
      store.calls.push(newRecord);
      if (store.calls.length > 200) {
        store.calls = store.calls.slice(-200);
      }
      return newRecord;
    });
  }
  ```

---

## 3. Call Logging Mechanism (`src/lib/model/client.ts`)

File location: `src/lib/model/client.ts` (Lines 80–189).

When `callModel(opts)` runs:
1. `startTime` is marked with `performance.now()`.
2. Under mock mode (`env.isMock`), `generateMockResponse()` provides simulated text, `inputTokens`, `outputTokens`, and `ms`.
3. Under live mode, Gemini API is called via `fetch()`. On success, tokens are extracted from `data.usageMetadata` (or estimated via `estimateTokens()`).
4. On failure, `callError` is scrubbed of API keys via `scrub()`, and network error code is identified via `networkCause()`.
5. In the `finally` block:
   ```typescript
   await addModelCall({
     purpose: opts.purpose,
     runId: opts.runId ?? null,
     model: env.isMock ? `mock-${model}` : model,
     temperature,
     prompt: opts.images?.length ? `[이미지 ${opts.images.length}장] ${opts.prompt}` : opts.prompt,
     response: resultText,
     inputTokens: callError ? null : inputTokens,
     outputTokens: callError ? null : outputTokens,
     ms: elapsedMs,
     error: callError,
   });
   ```

Note:
- Successful call: `error === null`, `inputTokens` and `outputTokens` are numbers.
- Errored call: `error !== null` (string), `inputTokens === null`, `outputTokens === null`.
- Because calls are pushed sequentially to `store.calls`, the last element in `store.calls` (`store.calls[store.calls.length - 1]`) is always the latest call.

---

## 4. Next.js API Conventions in Codebase

A survey of `src/app/api/*` (`src/app/api/state/route.ts`, `src/app/api/nodes/route.ts`, `src/app/api/sessions/route.ts`, `src/app/api/admin/records/route.ts`, `src/app/api/debug/reset-all/route.ts`) reveals consistent conventions:

1. **Dynamic Execution Assertion**:
   ```typescript
   import { connection, NextResponse } from "next/server";

   export async function GET() {
     await connection();
     ...
   }
   ```
   Calling `await connection()` at the top of dynamic GET handlers is required in Next.js 16 to assert request-time execution and prevent static build-time caching.

2. **JSON Response Construction**:
   - `NextResponse.json(body, { status: 200 })` is universally used.
   - Standard `Response.json(...)` is NOT used anywhere in `src/app/api/`.
   - Headers/status codes:
     - Success: `NextResponse.json(body, { status: 200 })`
     - Error: `NextResponse.json({ error: message }, { status: 400 | 404 | 409 | 500 })`

3. **Store Access**:
   - GET routes read store via `const store = await readStore();`.
   - No mutations occur inside GET routes.

---

## 5. Specifications for Milestone 2 Endpoints

### 5.1 `GET /api/debug/calls` (`src/app/api/debug/calls/route.ts`)

- **Requirements**:
  - Assert dynamic execution: `await connection()`.
  - Read store: `const store = await readStore()`.
  - Return JSON array of `ModelCall` records: `store.calls ?? []`.
  - Response status: 200.
- **Contract Verification (`tests/api-debug.spec.ts`)**:
  - `extractCalls(body)` checks `Array.isArray(body)` or `{ calls: ... }`. Returning array `store.calls ?? []` directly satisfies this.
  - Tests verify:
    ```typescript
    const latestCall = calls[calls.length - 1];
    expect(typeof latestCall.id).toBe("number");
    expect(typeof latestCall.at).toBe("string");
    expect(["chat", "rem-step", "rem-proposal"]).toContain(latestCall.purpose);
    expect(typeof latestCall.model).toBe("string");
    expect(typeof latestCall.temperature).toBe("number");
    expect(typeof latestCall.prompt).toBe("string");
    expect(typeof latestCall.response).toBe("string");
    expect(typeof latestCall.ms).toBe("number");
    expect(latestCall.ms).toBeGreaterThanOrEqual(0);
    ```
  - Up to 200 records (already capped by `addModelCall()`).

### 5.2 `GET /api/debug/metrics` (`src/app/api/debug/metrics/route.ts`)

- **Requirements**:
  - Assert dynamic execution: `await connection()`.
  - Read store: `const store = await readStore()`.
  - Aggregate metrics over `store`:
    - `calls`: `store.calls ?? []`
    - `nodesCount`: `store.nodes.length`
    - `insightsCount`: `(store.insights ?? []).length`
    - `proposalsCount`: `(store.proposals ?? []).length`
    - `runsCount`: `(store.runs ?? []).length`
    - `callsCount`: `calls.length`
    - `totalInputTokens`: `calls.reduce((sum, c) => sum + (c.inputTokens ?? 0), 0)`
    - `totalOutputTokens`: `calls.reduce((sum, c) => sum + (c.outputTokens ?? 0), 0)`
    - `totalTokens`: `totalInputTokens + totalOutputTokens`
    - `averageLatencyMs`: `callsCount === 0 ? 0 : Math.round(calls.reduce((sum, c) => sum + (c.ms ?? 0), 0) / callsCount)`
    - `errorCount`: `calls.filter((c) => Boolean(c.error) || (c as any).success === false).length`
  - Return JSON object with all 10 metric fields:
    ```typescript
    return NextResponse.json(
      {
        nodesCount,
        insightsCount,
        proposalsCount,
        runsCount,
        callsCount,
        totalInputTokens,
        totalOutputTokens,
        totalTokens,
        averageLatencyMs,
        errorCount,
      },
      { status: 200 }
    );
    ```
- **Corner Cases & Defensive Guardrails**:
  - **Divide-by-zero protection**: When `callsCount === 0`, `averageLatencyMs` must return `0`. Never return `NaN` or `Infinity`.
  - **Token consistency**: `totalTokens === totalInputTokens + totalOutputTokens` is explicitly tested in Tier 2.
  - **Null/Undefined tokens on error**: When calls error, `inputTokens` and `outputTokens` may be `null`. The calculation `(c.inputTokens ?? 0)` avoids `NaN`.

---

## 6. Pre-Implementation Test Baseline

Current test suite run:
```powershell
$env:PATH = "C:\Users\User\AppData\Local\Temp\node_extract\node-v22.20.0-win-x64;C:\Program Files\Git\cmd;" + $env:PATH; Set-Location C:\Users\User\.gemini\antigravity\scratch\rem-dream; $env:MODEL_MOCK="1"; npx playwright test tests/api-debug.spec.ts
```

Output:
```
Running 10 tests using 1 worker
  x   1 GET /api/debug/calls returns list of recent model invocations with valid schema (404)
  x   2 GET /api/debug/metrics returns complete operational metrics (404)
  ok  3 POST /api/debug/reset-all executes factory reset and returns ok: true
  x   4 Divide-by-zero protection: averageLatencyMs returns 0 when callsCount is 0 (404)
  x   5 Metric token consistency: totalTokens equals totalInputTokens + totalOutputTokens (404)
  ok  6 POST /api/debug/reset-all is idempotent and succeeds across multiple consecutive calls
  x   7 Model calls buffer is pruned and never exceeds 200 items (404)
  x   8 Chat interactions immediately increment callsCount and record call with purpose='chat' (404)
  ok  9 Factory reset cleans dynamic state and restores initial seed configuration
  x  10 Exhibition daily closing maintenance and operational health check (404)

  7 failed, 3 passed
```

The 3 passed tests belong to `POST /api/debug/reset-all`. The 7 failing tests all fail due to missing routes `/api/debug/calls` and `/api/debug/metrics` (HTTP 404). Implementing both route handlers will satisfy 100% of the 10 test cases across Tiers 1 through 4.
