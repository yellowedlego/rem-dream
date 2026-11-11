import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Store, PersonaProposal } from "../src/lib/types";

const RUNTIME_DIR = path.resolve(process.cwd(), process.env.REM_RUNTIME_DIR || path.join("data", "runtime-test"));
const RUNTIME_STORE_PATH = path.join(RUNTIME_DIR, "store.json");

/**
 * Safely initialize or modify the runtime test store with dedicated test fixtures.
 * Uses atomic rename to ensure the Next.js dev/test server reads clean JSON.
 */
async function setupTestFixtures(): Promise<void> {
  await fs.mkdir(RUNTIME_DIR, { recursive: true });

  let baseStore: Store;
  try {
    const raw = await fs.readFile(RUNTIME_STORE_PATH, "utf8");
    baseStore = JSON.parse(raw);
  } catch {
    const seedPath = path.join(process.cwd(), "data", "store.json");
    const rawSeed = await fs.readFile(seedPath, "utf8");
    baseStore = JSON.parse(rawSeed);
  }

  // Ensure necessary arrays exist
  if (!Array.isArray(baseStore.proposals)) baseStore.proposals = [];
  if (!Array.isArray(baseStore.personas)) baseStore.personas = [];
  if (!Array.isArray(baseStore.nodes)) baseStore.nodes = [];
  if (!Array.isArray(baseStore.runs)) baseStore.runs = [];

  // Guarantee Persona versions 1 and 2 exist
  if (!baseStore.personas.some((p) => p.version === 1)) {
    baseStore.personas.push({
      version: 1,
      systemPrompt: "너는 관람객의 하루 이야기를 들어 주는 친절한 대화 상대야. 짧고 따뜻하게 답한다.",
      sourceInsightIds: [],
      approvedAt: "2026-11-04T08:00:00+09:00",
      parentVersion: null,
    });
  }
  if (!baseStore.personas.some((p) => p.version === 2)) {
    baseStore.personas.push({
      version: 2,
      systemPrompt: "너는 관람객의 하루 이야기를 들어 주는 친절한 대화 상대야. 짧고 따뜻하게 답한다.\n상대가 급해 보이면 먼저 할 일을 작게 나눠 준다.",
      sourceInsightIds: [1],
      approvedAt: "2026-11-04T22:52:00+09:00",
      parentVersion: 1,
    });
  }

  // Remove previous test proposals (IDs >= 1000)
  baseStore.proposals = baseStore.proposals.filter((p) => p.id < 1000);

  // Add deterministic test proposals for adversarial suites
  const testProposals: PersonaProposal[] = [
    {
      id: 1001,
      runId: "run-test-1001",
      sourceInsightIds: [1],
      proposedPrompt: "인격 제안 1001: 친절하고 다정한 어조로 응답합니다.",
      summary: "테스트 제안 1001 요약",
      baseVersion: 1,
      status: "pending",
      createdAt: new Date().toISOString(),
      decidedAt: null,
    },
    {
      id: 1002,
      runId: "run-test-1002",
      sourceInsightIds: [1],
      proposedPrompt: "인격 제안 1002: 이미 승인된 제안입니다.",
      summary: "테스트 제안 1002 요약",
      baseVersion: 1,
      status: "approved",
      createdAt: new Date().toISOString(),
      decidedAt: new Date().toISOString(),
    },
    {
      id: 1003,
      runId: "run-test-1003",
      sourceInsightIds: [1],
      proposedPrompt: "인격 제안 1003: 이미 거절된 제안입니다.",
      summary: "테스트 제안 1003 요약",
      baseVersion: 1,
      status: "rejected",
      createdAt: new Date().toISOString(),
      decidedAt: new Date().toISOString(),
    },
    {
      id: 1004,
      runId: "run-test-1004",
      sourceInsightIds: [1],
      proposedPrompt: "인격 제안 1004: 거절 테스트 대상 제안입니다.",
      summary: "테스트 제안 1004 요약",
      baseVersion: 1,
      status: "pending",
      createdAt: new Date().toISOString(),
      decidedAt: null,
    },
    {
      id: 1005,
      runId: "run-test-1005",
      sourceInsightIds: [1],
      proposedPrompt: "인격 제안 1005: 병렬 승인 동시성 스트레스 제안입니다.",
      summary: "테스트 제안 1005 요약",
      baseVersion: 1,
      status: "pending",
      createdAt: new Date().toISOString(),
      decidedAt: null,
    },
    {
      id: 1006,
      runId: "run-test-1006",
      sourceInsightIds: [1],
      proposedPrompt: "인격 제안 1006: 병렬 거절 동시성 스트레스 제안입니다.",
      summary: "테스트 제안 1006 요약",
      baseVersion: 1,
      status: "pending",
      createdAt: new Date().toISOString(),
      decidedAt: null,
    },
    {
      id: 1007,
      runId: "run-test-1007",
      sourceInsightIds: [1],
      proposedPrompt: "인격 제안 1007: 동시 승인/거절 경쟁 제안입니다.",
      summary: "테스트 제안 1007 요약",
      baseVersion: 1,
      status: "pending",
      createdAt: new Date().toISOString(),
      decidedAt: null,
    },
    {
      id: 1008,
      runId: "run-test-1008",
      sourceInsightIds: [1],
      proposedPrompt: "인격 제안 1008: 중복 승인 상태 전이 위반 테스트 대상입니다.",
      summary: "테스트 제안 1008 요약",
      baseVersion: 1,
      status: "pending",
      createdAt: new Date().toISOString(),
      decidedAt: null,
    },
    {
      id: 1009,
      runId: "run-test-1009",
      sourceInsightIds: [1],
      proposedPrompt: "인격 제안 1009: 중복 거절 상태 전이 위반 테스트 대상입니다.",
      summary: "테스트 제안 1009 요약",
      baseVersion: 1,
      status: "pending",
      createdAt: new Date().toISOString(),
      decidedAt: null,
    },
  ];

  baseStore.proposals.push(...testProposals);

  // Add deterministic test nodes for session isolation testing
  baseStore.nodes = baseStore.nodes.filter((n) => n.sessionId !== "adv-session-wipe" && n.sessionId !== "adv-session-keep");
  baseStore.nodes.push(
    {
      id: 9901,
      sessionId: "adv-session-wipe",
      order: 1,
      createdAt: new Date().toISOString(),
      user: "지워질 세션 노드 1",
      ai: "지워질 세션 응답 1",
    },
    {
      id: 9902,
      sessionId: "adv-session-wipe",
      order: 2,
      createdAt: new Date().toISOString(),
      user: "지워질 세션 노드 2",
      ai: "지워질 세션 응답 2",
    },
    {
      id: 9903,
      sessionId: "adv-session-keep",
      order: 1,
      createdAt: new Date().toISOString(),
      user: "유지될 세션 노드 1",
      ai: "유지될 세션 응답 1",
    }
  );

  baseStore.activePersona = 1;

  // Write atomically
  const tmpPath = path.join(RUNTIME_DIR, `store.json.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`);
  await fs.writeFile(tmpPath, JSON.stringify(baseStore, null, 2) + "\n", "utf8");
  await fs.rename(tmpPath, RUNTIME_STORE_PATH);
}

test.describe("Challenger M1-1: Empirical Adversarial Stress Harness", () => {
  test.beforeAll(async ({ request }) => {
    // 1. Setup deterministic fixtures in runtime store
    await setupTestFixtures();
    // 2. Warm up Next.js server
    const stateRes = await request.get("/api/state");
    expect(stateRes.status()).toBe(200);
  });

  // =========================================================================
  // Suite 1: Malformed Proposal IDs on POST /api/proposals/[id]/approve
  // =========================================================================
  test.describe("Suite 1: Malformed Proposal IDs on /api/proposals/[id]/approve", () => {
    const invalidIds: Array<{ label: string; id: string }> = [
      { label: "Alphabetic string", id: "abc" },
      { label: "Word token 'invalid'", id: "invalid" },
      { label: "JS token 'undefined'", id: "undefined" },
      { label: "JS token 'null'", id: "null" },
      { label: "JS token 'NaN'", id: "NaN" },
      { label: "Boolean token 'true'", id: "true" },
      { label: "Boolean token 'false'", id: "false" },
      { label: "Special symbols '!@#$%' (encoded)", id: encodeURIComponent("!@#$%^&*()") },
      { label: "Semicolon shell injection token ';ls'", id: ";ls" },
      { label: "Path traversal '../proposals'", id: "..%2Fproposals" },
      { label: "Path traversal '/etc/passwd'", id: "%2Fetc%2Fpasswd" },
      { label: "Floating point '1.5'", id: "1.5" },
      { label: "Floating point '3.14159'", id: "3.14159" },
      { label: "Floating point '0.1'", id: "0.1" },
      { label: "Negative float '-0.5'", id: "-0.5" },
      { label: "Scientific notation '1e5'", id: "1e5" },
      { label: "Negative integer '-1'", id: "-1" },
      { label: "Negative integer '-999'", id: "-999" },
      { label: "Zero '0'", id: "0" },
      { label: "Negative zero '-0'", id: "-0" },
      { label: "Leading zero '01'", id: "01" },
      { label: "Leading zero '007'", id: "007" },
      { label: "Hexadecimal string '0x10'", id: "0x10" },
      { label: "Octal string '0o77'", id: "0o77" },
      { label: "Binary string '0b101'", id: "0b101" },
      { label: "Number with trailing characters '1abc'", id: "1abc" },
      { label: "Number with leading characters 'abc1'", id: "abc1" },
      { label: "Whitespace padded ' 1001 '", id: "%201001%20" },
      { label: "Whitespace prefix ' 1001'", id: "%201001" },
      { label: "Whitespace suffix '1001 '", id: "1001%20" },
      { label: "SQL injection '1 OR 1=1'", id: "1%20OR%201=1" },
      { label: "SQL injection '1; DROP TABLE proposals'", id: "1;%20DROP%20TABLE%20proposals" },
      { label: "SQL injection \"' UNION SELECT * --\"", id: "'%20UNION%20SELECT%20*%20--" },
      { label: "NoSQL injection '{\"$gt\": \"\"}'", id: "%7B%22$gt%22%3A%22%22%7D" },
      { label: "Extreme overflow integer '999999999999999999999999'", id: "999999999999999999999999" },
      { label: "MAX_SAFE_INTEGER + 2 precision loss integer '9007199254740993'", id: "9007199254740993" },
    ];

    for (const { label, id } of invalidIds) {
      test(`rejects ${label} (id: "${id}") with 400 Bad Request`, async ({ request }) => {
        const res = await request.post(`/api/proposals/${id}/approve`);
        expect(res.status(), `Expected 400 for ${label} but got ${res.status()}`).toBe(400);
        const body = await res.json();
        expect(body).toHaveProperty("error");
      });
    }

    test("returns 404 Not Found for non-existent valid integer ID '9999999'", async ({ request }) => {
      const res = await request.post("/api/proposals/9999999/approve");
      expect(res.status()).toBe(404);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });
  });

  // =========================================================================
  // Suite 2: Malformed Proposal IDs on POST /api/proposals/[id]/reject
  // =========================================================================
  test.describe("Suite 2: Malformed Proposal IDs on /api/proposals/[id]/reject", () => {
    const invalidIds: Array<{ label: string; id: string }> = [
      { label: "Alphabetic string", id: "abc" },
      { label: "Word token 'invalid'", id: "invalid" },
      { label: "JS token 'undefined'", id: "undefined" },
      { label: "JS token 'null'", id: "null" },
      { label: "JS token 'NaN'", id: "NaN" },
      { label: "Special symbols '!@#$%' (encoded)", id: encodeURIComponent("!@#$%^&*()") },
      { label: "Floating point '1.5'", id: "1.5" },
      { label: "Floating point '3.14159'", id: "3.14159" },
      { label: "Negative integer '-1'", id: "-1" },
      { label: "Zero '0'", id: "0" },
      { label: "Leading zero '01'", id: "01" },
      { label: "Hexadecimal string '0x10'", id: "0x10" },
      { label: "SQL injection '1 OR 1=1'", id: "1%20OR%201=1" },
      { label: "SQL injection '1; DROP TABLE'", id: "1;%20DROP%20TABLE" },
      { label: "Extreme overflow integer", id: "999999999999999999999999" },
    ];

    for (const { label, id } of invalidIds) {
      test(`rejects ${label} (id: "${id}") with 400 Bad Request`, async ({ request }) => {
        const res = await request.post(`/api/proposals/${id}/reject`);
        expect(res.status(), `Expected 400 for ${label} but got ${res.status()}`).toBe(400);
        const body = await res.json();
        expect(body).toHaveProperty("error");
      });
    }

    test("returns 404 Not Found for non-existent valid integer ID '9999999'", async ({ request }) => {
      const res = await request.post("/api/proposals/9999999/reject");
      expect(res.status()).toBe(404);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });
  });

  // =========================================================================
  // Suite 3: Malformed JSON Bodies & Boundary Values on POST /api/persona/revert
  // =========================================================================
  test.describe("Suite 3: Malformed JSON Payloads on /api/persona/revert", () => {
    test("rejects truncated JSON body with 400 Bad Request", async ({ request }) => {
      const res = await request.post("/api/persona/revert", {
        data: '{"version": ',
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/Invalid JSON body|Request body must be a valid JSON object/);
    });

    test("rejects empty string raw body with 400 Bad Request", async ({ request }) => {
      const res = await request.post("/api/persona/revert", {
        data: "",
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(400);
    });

    test("rejects plain text string body with 400 Bad Request", async ({ request }) => {
      const res = await request.post("/api/persona/revert", {
        data: "revert to version 1 please",
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(400);
    });

    test("rejects JSON array payload instead of object with 400 Bad Request", async ({ request }) => {
      const res1 = await request.post("/api/persona/revert", {
        data: [1, 2, 3],
      });
      expect(res1.status()).toBe(400);

      const res2 = await request.post("/api/persona/revert", {
        data: [{ version: 1 }],
      });
      expect(res2.status()).toBe(400);

      const res3 = await request.post("/api/persona/revert", {
        data: [],
      });
      expect(res3.status()).toBe(400);
    });

    test("rejects primitive number JSON payload with 400 Bad Request", async ({ request }) => {
      const res = await request.post("/api/persona/revert", {
        data: 1,
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(400);
    });

    test("rejects primitive boolean JSON payload with 400 Bad Request", async ({ request }) => {
      const res = await request.post("/api/persona/revert", {
        data: true,
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(400);
    });

    test("rejects null JSON payload with 400 Bad Request", async ({ request }) => {
      const res = await request.post("/api/persona/revert", {
        data: null as unknown as string,
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(400);
    });

    test("rejects empty object payload (missing version) with 400 Bad Request", async ({ request }) => {
      const res = await request.post("/api/persona/revert", {
        data: {},
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Valid version number is required");
    });

    const invalidVersionTypes: Array<{ label: string; payload: unknown }> = [
      { label: "string number '1'", payload: { version: "1" } },
      { label: "string text 'v1'", payload: { version: "v1" } },
      { label: "floating point 1.5", payload: { version: 1.5 } },
      { label: "floating point 2.0001", payload: { version: 2.0001 } },
      { label: "zero 0", payload: { version: 0 } },
      { label: "negative integer -1", payload: { version: -1 } },
      { label: "negative integer -999", payload: { version: -999 } },
      { label: "null version", payload: { version: null } },
      { label: "boolean true", payload: { version: true } },
      { label: "boolean false", payload: { version: false } },
      { label: "array version [1]", payload: { version: [1] } },
      { label: "object version { ver: 1 }", payload: { version: { ver: 1 } } },
      { label: "NaN token string", payload: { version: "NaN" } },
    ];

    for (const { label, payload } of invalidVersionTypes) {
      test(`rejects ${label} with 400 Bad Request`, async ({ request }) => {
        const res = await request.post("/api/persona/revert", { data: payload });
        expect(res.status(), `Expected 400 for ${label} but got ${res.status()}`).toBe(400);
        const body = await res.json();
        expect(body).toHaveProperty("error");
      });
    }

    test("returns 404 Not Found when reverting to non-existent version 99999", async ({ request }) => {
      const res = await request.post("/api/persona/revert", {
        data: { version: 99999 },
      });
      expect(res.status()).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("Persona version not found");
    });

    test("successfully reverts to version 1 and returns 200 with activePersona: 1", async ({ request }) => {
      const res = await request.post("/api/persona/revert", {
        data: { version: 1 },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true, activePersona: 1 });

      const state = await (await request.get("/api/state")).json();
      expect(state.activePersona).toBe(1);
    });

    test("successfully reverts to version 2 and returns 200 with activePersona: 2", async ({ request }) => {
      const res = await request.post("/api/persona/revert", {
        data: { version: 2 },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true, activePersona: 2 });

      const state = await (await request.get("/api/state")).json();
      expect(state.activePersona).toBe(2);
    });
  });

  // =========================================================================
  // Suite 4: Malformed JSON Bodies & Boundary Values on POST /api/session/reset
  // =========================================================================
  test.describe("Suite 4: Malformed JSON Payloads on /api/session/reset", () => {
    test("rejects truncated JSON body with 400 Bad Request", async ({ request }) => {
      const res = await request.post("/api/session/reset", {
        data: '{"sessionId": ',
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/Invalid JSON body|Request body must be a valid JSON object/);
    });

    test("rejects empty string raw body with 400 Bad Request", async ({ request }) => {
      const res = await request.post("/api/session/reset", {
        data: "",
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(400);
    });

    test("rejects plain text string body with 400 Bad Request", async ({ request }) => {
      const res = await request.post("/api/session/reset", {
        data: "please reset my session",
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(400);
    });

    test("rejects JSON array payload with 400 Bad Request", async ({ request }) => {
      const res = await request.post("/api/session/reset", {
        data: ["session-123"],
      });
      expect(res.status()).toBe(400);
    });

    test("rejects primitive number JSON payload with 400 Bad Request", async ({ request }) => {
      const res = await request.post("/api/session/reset", {
        data: 12345,
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(400);
    });

    test("rejects primitive boolean JSON payload with 400 Bad Request", async ({ request }) => {
      const res = await request.post("/api/session/reset", {
        data: false,
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status()).toBe(400);
    });

    test("rejects empty object payload (missing sessionId) with 400 Bad Request", async ({ request }) => {
      const res = await request.post("/api/session/reset", {
        data: {},
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("sessionId is required");
    });

    const invalidSessionCases: Array<{ label: string; payload: unknown }> = [
      { label: "empty string ''", payload: { sessionId: "" } },
      { label: "whitespace only spaces '   '", payload: { sessionId: "   " } },
      { label: "whitespace only tab and newline '\\t\\n\\r'", payload: { sessionId: "\t\n\r" } },
      { label: "numeric sessionId 12345", payload: { sessionId: 12345 } },
      { label: "boolean sessionId true", payload: { sessionId: true } },
      { label: "boolean sessionId false", payload: { sessionId: false } },
      { label: "null sessionId", payload: { sessionId: null } },
      { label: "array sessionId ['demo']", payload: { sessionId: ["demo"] } },
      { label: "object sessionId { id: 'demo' }", payload: { sessionId: { id: "demo" } } },
    ];

    for (const { label, payload } of invalidSessionCases) {
      test(`rejects ${label} with 400 Bad Request`, async ({ request }) => {
        const res = await request.post("/api/session/reset", { data: payload });
        expect(res.status(), `Expected 400 for ${label} but got ${res.status()}`).toBe(400);
        const body = await res.json();
        expect(body).toHaveProperty("error");
      });
    }

    test("gracefully succeeds (200) and resets activePersona to 1 on non-existent sessionId", async ({ request }) => {
      // First ensure active persona is set to 2
      await request.post("/api/persona/revert", { data: { version: 2 } });
      const stateBefore = await (await request.get("/api/state")).json();
      expect(stateBefore.activePersona).toBe(2);

      // Reset a sessionId that has never been used
      const nonExistentId = `phantom-session-${Date.now()}`;
      const res = await request.post("/api/session/reset", {
        data: { sessionId: nonExistentId },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ ok: true });

      // Verify activePersona was reset to 1
      const stateAfter = await (await request.get("/api/state")).json();
      expect(stateAfter.activePersona).toBe(1);
    });
  });

  // =========================================================================
  // Suite 5: State Transition Violations
  // =========================================================================
  test.describe("Suite 5: State Transition Violations", () => {
    test("approving an already approved proposal (id: 1002) returns 400 Bad Request", async ({ request }) => {
      const res = await request.post("/api/proposals/1002/approve");
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Proposal is not pending");
    });

    test("rejecting an already approved proposal (id: 1002) returns 400 Bad Request", async ({ request }) => {
      const res = await request.post("/api/proposals/1002/reject");
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Proposal is not pending");
    });

    test("approving an already rejected proposal (id: 1003) returns 400 Bad Request", async ({ request }) => {
      const res = await request.post("/api/proposals/1003/approve");
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Proposal is not pending");
    });

    test("rejecting an already rejected proposal (id: 1003) returns 400 Bad Request", async ({ request }) => {
      const res = await request.post("/api/proposals/1003/reject");
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Proposal is not pending");
    });

    test("double approve sequence (id: 1008): 1st succeeds (200), 2nd fails (400)", async ({ request }) => {
      // 1st approve
      const res1 = await request.post("/api/proposals/1008/approve");
      expect(res1.status()).toBe(200);
      const body1 = await res1.json();
      expect(body1.ok).toBe(true);
      expect(typeof body1.activePersona).toBe("number");

      // 2nd approve must fail with 400
      const res2 = await request.post("/api/proposals/1008/approve");
      expect(res2.status()).toBe(400);
      const body2 = await res2.json();
      expect(body2.error).toContain("Proposal is not pending");
    });

    test("double reject sequence (id: 1009): 1st succeeds (200), 2nd fails (400)", async ({ request }) => {
      // 1st reject
      const res1 = await request.post("/api/proposals/1009/reject");
      expect(res1.status()).toBe(200);
      const body1 = await res1.json();
      expect(body1).toEqual({ ok: true });

      // 2nd reject must fail with 400
      const res2 = await request.post("/api/proposals/1009/reject");
      expect(res2.status()).toBe(400);
      const body2 = await res2.json();
      expect(body2.error).toContain("Proposal is not pending");
    });
  });

  // =========================================================================
  // Suite 6: Session Reset Data Isolation & Persona State Reset
  // =========================================================================
  test.describe("Suite 6: Session Reset Data Isolation", () => {
    test("clears target session nodes while preserving other sessions and resetting activePersona", async ({ request }) => {
      // Confirm pre-existing test nodes for wipe and keep
      const preState = await (await request.get("/api/state")).json();
      const wipeNodesBefore = preState.nodes.filter((n: { sessionId: string }) => n.sessionId === "adv-session-wipe");
      const keepNodesBefore = preState.nodes.filter((n: { sessionId: string }) => n.sessionId === "adv-session-keep");
      expect(wipeNodesBefore.length).toBe(2);
      expect(keepNodesBefore.length).toBe(1);

      // Set active persona to 2
      await request.post("/api/persona/revert", { data: { version: 2 } });

      // Execute session reset on 'adv-session-wipe'
      const resetRes = await request.post("/api/session/reset", {
        data: { sessionId: "adv-session-wipe" },
      });
      expect(resetRes.status()).toBe(200);
      expect(await resetRes.json()).toEqual({ ok: true });

      // Check post-state
      const postState = await (await request.get("/api/state")).json();

      // adv-session-wipe nodes must be 0
      const wipeNodesAfter = postState.nodes.filter((n: { sessionId: string }) => n.sessionId === "adv-session-wipe");
      expect(wipeNodesAfter.length).toBe(0);

      // adv-session-keep nodes must be untouched (exactly 1)
      const keepNodesAfter = postState.nodes.filter((n: { sessionId: string }) => n.sessionId === "adv-session-keep");
      expect(keepNodesAfter.length).toBe(1);

      // activePersona must be reset to 1
      expect(postState.activePersona).toBe(1);
    });
  });

  // =========================================================================
  // Suite 7: Concurrency & Race Condition Stress
  // =========================================================================
  test.describe("Suite 7: Concurrency & Race Condition Stress", () => {
    test("5 concurrent approval requests on pending proposal 1005: exactly 1 succeeds, 4 fail with 400", async ({ request }) => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () => request.post("/api/proposals/1005/approve"))
      );

      const statuses = results.map((r) => r.status());
      const successCount = statuses.filter((s) => s === 200).length;
      const conflictCount = statuses.filter((s) => s === 400).length;

      expect(successCount, `Expected exactly 1 success (200), got statuses: ${statuses.join(", ")}`).toBe(1);
      expect(conflictCount, `Expected 4 rejections (400), got statuses: ${statuses.join(", ")}`).toBe(4);
    });

    test("5 concurrent reject requests on pending proposal 1006: exactly 1 succeeds, 4 fail with 400", async ({ request }) => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () => request.post("/api/proposals/1006/reject"))
      );

      const statuses = results.map((r) => r.status());
      const successCount = statuses.filter((s) => s === 200).length;
      const conflictCount = statuses.filter((s) => s === 400).length;

      expect(successCount, `Expected exactly 1 success (200), got statuses: ${statuses.join(", ")}`).toBe(1);
      expect(conflictCount, `Expected 4 rejections (400), got statuses: ${statuses.join(", ")}`).toBe(4);
    });

    test("simultaneous approve and reject on pending proposal 1007: exactly 1 succeeds, 1 fails with 400", async ({ request }) => {
      const [approveRes, rejectRes] = await Promise.all([
        request.post("/api/proposals/1007/approve"),
        request.post("/api/proposals/1007/reject"),
      ]);

      const statuses = [approveRes.status(), rejectRes.status()];
      const successCount = statuses.filter((s) => s === 200).length;
      const failCount = statuses.filter((s) => s === 400).length;

      expect(successCount, `Expected exactly 1 success among [approve, reject], got: ${statuses.join(", ")}`).toBe(1);
      expect(failCount, `Expected exactly 1 failure among [approve, reject], got: ${statuses.join(", ")}`).toBe(1);
    });
  });
});
