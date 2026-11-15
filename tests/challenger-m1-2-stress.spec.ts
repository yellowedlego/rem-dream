import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { PersonaProposal, PersonaVersion, Store } from "../src/lib/types";

// Runtime store path used by Playwright test server (see playwright.config.ts)
const RUNTIME_STORE_PATH = path.join(process.cwd(), "data", "runtime-test", "store.json");
const SEED_STORE_PATH = path.join(process.cwd(), "data", "store.json");

function makeSessionId(prefix = "stress"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function getRuntimeStore(): Promise<Store> {
  const raw = await fs.readFile(RUNTIME_STORE_PATH, "utf8");
  return JSON.parse(raw) as Store;
}

async function modifyRuntimeStore(modifier: (store: Store) => void): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 80));
  const raw = await fs.readFile(RUNTIME_STORE_PATH, "utf8");
  const store = JSON.parse(raw) as Store;
  modifier(store);
  const targetDir = path.dirname(RUNTIME_STORE_PATH);
  const tmpPath = path.join(targetDir, `store.json.tmp.stress.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`);
  await fs.writeFile(tmpPath, JSON.stringify(store, null, 2) + "\n", "utf8");

  let renamed = false;
  let lastErr: unknown = null;
  for (let i = 0; i < 15; i++) {
    try {
      await fs.rename(tmpPath, RUNTIME_STORE_PATH);
      renamed = true;
      break;
    } catch (err) {
      lastErr = err;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
  if (!renamed) {
    try { await fs.unlink(tmpPath); } catch {}
    throw new Error(`Failed to atomically rename ${tmpPath} to ${RUNTIME_STORE_PATH}: ${String(lastErr)}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 80));
}

test.describe("Challenger M1-2: Concurrency & State Consistency Stress Suite", () => {
  test.beforeEach(async ({ request }) => {
    // Reset runtime store to pristine seed before each test
    const resetRes = await request.post("/api/debug/reset-all");
    expect(resetRes.status()).toBe(200);
  });

  // =========================================================================
  // Dimension 1: Concurrent Revert & Session Reset Race Conditions
  // =========================================================================
  test.describe("Dimension 1: Simultaneous POST /api/persona/revert and POST /api/session/reset", () => {
    test("handles 20 interleaved concurrent revert and reset requests without server 500 or corruption", async ({ request }) => {
      // 1. Prepare store with persona versions 1 and 2, and initial session data
      const targetSession = makeSessionId("concurrent-target");
      await request.post("/api/chat", {
        data: { sessionId: targetSession, message: "초기화 대상 대화 메시지 1" },
      });
      await request.post("/api/chat", {
        data: { sessionId: targetSession, message: "초기화 대상 대화 메시지 2" },
      });

      // 2. Fire 20 simultaneous requests: 10 revert (alternating between v1 and v2), 10 reset
      const count = 20;
      const promises: Promise<import("@playwright/test").APIResponse>[] = [];

      for (let i = 0; i < count; i++) {
        if (i % 2 === 0) {
          const targetVersion = (i % 4 === 0) ? 1 : 2;
          promises.push(
            request.post("/api/persona/revert", {
              data: { version: targetVersion },
            })
          );
        } else {
          promises.push(
            request.post("/api/session/reset", {
              data: { sessionId: targetSession },
            })
          );
        }
      }

      const results = await Promise.all(promises);

      // Verify NO 500 errors or unhandled crashes
      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        expect(res.status(), `Request #${i} returned unexpected status ${res.status()}`).toBe(200);
      }

      // 3. Inspect store integrity directly from disk
      const store = await getRuntimeStore();
      expect([1, 2]).toContain(store.activePersona);

      // Verify that target session memory nodes were cleared
      const remainingNodes = store.nodes.filter((n) => n.sessionId === targetSession);
      expect(remainingNodes.length).toBe(0);

      // Verify JSON file format on disk is valid
      const rawDisk = await fs.readFile(RUNTIME_STORE_PATH, "utf8");
      expect(() => JSON.parse(rawDisk)).not.toThrow();
    });

    test("concurrent resets across multiple distinct sessions isolate and clear cleanly", async ({ request }) => {
      const sessionA = makeSessionId("sess-A");
      const sessionB = makeSessionId("sess-B");
      const sessionC = makeSessionId("sess-C");

      // Populate chats for all 3 sessions
      await request.post("/api/chat", { data: { sessionId: sessionA, message: "A-1" } });
      await request.post("/api/chat", { data: { sessionId: sessionB, message: "B-1" } });
      await request.post("/api/chat", { data: { sessionId: sessionC, message: "C-1" } });

      // Concurrently reset A and B while reverting persona to 2
      const [resA, resB, resRev] = await Promise.all([
        request.post("/api/session/reset", { data: { sessionId: sessionA } }),
        request.post("/api/session/reset", { data: { sessionId: sessionB } }),
        request.post("/api/persona/revert", { data: { version: 2 } }),
      ]);

      expect(resA.status()).toBe(200);
      expect(resB.status()).toBe(200);
      expect(resRev.status()).toBe(200);

      const store = await getRuntimeStore();
      // Sessions A and B must have 0 nodes
      expect(store.nodes.filter((n) => n.sessionId === sessionA).length).toBe(0);
      expect(store.nodes.filter((n) => n.sessionId === sessionB).length).toBe(0);
      // Session C must STILL have its node intact
      expect(store.nodes.filter((n) => n.sessionId === sessionC).length).toBe(1);
    });
  });

  // =========================================================================
  // Dimension 2: Rapid Sequence of Approvals, Rejections, Reverts & Version Integrity
  // =========================================================================
  test.describe("Dimension 2: Rapid Sequence & State/Version Integrity", () => {
    test("rapid sequence of approvals produces strictly monotonically increasing versions with no duplicates", async ({ request }) => {
      // Inject 6 pending proposals into the runtime store
      const baseId = 200;
      const proposalsToAdd: PersonaProposal[] = [];
      for (let i = 1; i <= 6; i++) {
        proposalsToAdd.push({
          id: baseId + i,
          runId: `stress-run-${i}`,
          sourceInsightIds: [i],
          proposedPrompt: `스트레스 테스트 생성 인격 버전 프롬프트 #${i}`,
          summary: `인격 변경 요약 #${i}`,
          baseVersion: 1,
          status: "pending",
          createdAt: new Date().toISOString(),
          decidedAt: null,
        });
      }

      await modifyRuntimeStore((store) => {
        if (!store.proposals) store.proposals = [];
        store.proposals.push(...proposalsToAdd);
      });

      // Rapidly execute:
      // approve 201, reject 202, approve 203, approve 204, reject 205, approve 206
      const results: { action: string; id: number; status: number; body: Record<string, unknown> }[] = [];

      const r1 = await request.post(`/api/proposals/${baseId + 1}/approve`);
      results.push({ action: "approve", id: baseId + 1, status: r1.status(), body: await r1.json() });

      const r2 = await request.post(`/api/proposals/${baseId + 2}/reject`);
      results.push({ action: "reject", id: baseId + 2, status: r2.status(), body: await r2.json() });

      const r3 = await request.post(`/api/proposals/${baseId + 3}/approve`);
      results.push({ action: "approve", id: baseId + 3, status: r3.status(), body: await r3.json() });

      const r4 = await request.post(`/api/proposals/${baseId + 4}/approve`);
      results.push({ action: "approve", id: baseId + 4, status: r4.status(), body: await r4.json() });

      const r5 = await request.post(`/api/proposals/${baseId + 5}/reject`);
      results.push({ action: "reject", id: baseId + 5, status: r5.status(), body: await r5.json() });

      const r6 = await request.post(`/api/proposals/${baseId + 6}/approve`);
      results.push({ action: "approve", id: baseId + 6, status: r6.status(), body: await r6.json() });

      // All 6 must return 200
      for (const res of results) {
        expect(res.status, `Action ${res.action} for id ${res.id} failed with status ${res.status}`).toBe(200);
      }

      // Check activePersona progression:
      // Initial activePersona was 1 or 2 (seed has v1, v2).
      // baseId+1 -> v3, baseId+3 -> v4, baseId+4 -> v5, baseId+6 -> v6
      expect(results[0].body.activePersona).toBe(3);
      expect(results[2].body.activePersona).toBe(4);
      expect(results[3].body.activePersona).toBe(5);
      expect(results[5].body.activePersona).toBe(6);

      // Verify on-disk store integrity
      const diskStore = await getRuntimeStore();
      const versions = diskStore.personas.map((p) => p.version);

      // 1. Strict monotonicity check
      for (let i = 1; i < versions.length; i++) {
        expect(versions[i]).toBeGreaterThan(versions[i - 1]);
      }

      // 2. No duplicates
      const uniqueVersions = new Set(versions);
      expect(uniqueVersions.size).toBe(versions.length);

      // 3. activePersona matches latest approved version (6)
      expect(diskStore.activePersona).toBe(6);

      // 4. Verify proposal statuses and decidedAt timestamps
      const p201 = diskStore.proposals.find((p) => p.id === baseId + 1);
      const p202 = diskStore.proposals.find((p) => p.id === baseId + 2);
      expect(p201?.status).toBe("approved");
      expect(p201?.decidedAt).not.toBeNull();
      expect(p202?.status).toBe("rejected");
      expect(p202?.decidedAt).not.toBeNull();
    });

    test("simultaneous concurrent approvals of the SAME pending proposal permits exactly one success and rejects others", async ({ request }) => {
      const proposalId = 301;
      await modifyRuntimeStore((store) => {
        if (!store.proposals) store.proposals = [];
        store.proposals.push({
          id: proposalId,
          runId: "double-spend-run",
          sourceInsightIds: [1],
          proposedPrompt: "동시성 단일 승인 검증 프롬프트",
          summary: "동시성 승인 테스트",
          baseVersion: 1,
          status: "pending",
          createdAt: new Date().toISOString(),
          decidedAt: null,
        });
      });

      // Send 8 simultaneous approval requests for proposal 301
      const count = 8;
      const promises = Array.from({ length: count }, () =>
        request.post(`/api/proposals/${proposalId}/approve`)
      );

      const responses = await Promise.all(promises);
      const statuses = responses.map((r) => r.status());

      const successes = statuses.filter((s) => s === 200);
      const failures = statuses.filter((s) => s === 400);

      // Exactly ONE must succeed (200), and all remaining 7 must be rejected with 400 ("Proposal is not pending")
      expect(successes.length, `Expected exactly 1 success, got ${successes.length}`).toBe(1);
      expect(failures.length, `Expected ${count - 1} rejections with 400, got ${failures.length}`).toBe(count - 1);

      // Verify no duplicate persona versions were appended
      const diskStore = await getRuntimeStore();
      const matchingPersonas = diskStore.personas.filter(
        (p) => p.systemPrompt === "동시성 단일 승인 검증 프롬프트"
      );
      expect(matchingPersonas.length, "Proposal was approved multiple times creating duplicate personas!").toBe(1);
    });

    test("simultaneous concurrent approvals of DIFFERENT pending proposals create atomic non-colliding versions", async ({ request }) => {
      const baseId = 400;
      const count = 5;
      const proposals: PersonaProposal[] = [];
      for (let i = 1; i <= count; i++) {
        proposals.push({
          id: baseId + i,
          runId: `multi-run-${i}`,
          sourceInsightIds: [i],
          proposedPrompt: `동시 다발 제안서 프롬프트 #${i}`,
          summary: `동시 제안 #${i}`,
          baseVersion: 1,
          status: "pending",
          createdAt: new Date().toISOString(),
          decidedAt: null,
        });
      }

      await modifyRuntimeStore((store) => {
        if (!store.proposals) store.proposals = [];
        store.proposals.push(...proposals);
      });

      // Dispatch 5 concurrent approvals at the exact same instant
      const promises = proposals.map((p) =>
        request.post(`/api/proposals/${p.id}/approve`)
      );

      const responses = await Promise.all(promises);
      for (let i = 0; i < responses.length; i++) {
        expect(responses[i].status(), `Proposal ${proposals[i].id} approve failed`).toBe(200);
      }

      const bodies = await Promise.all(responses.map((r) => r.json()));
      const assignedVersions = bodies.map((b) => b.activePersona as number);

      // Check that all assigned versions are unique and non-colliding
      const uniqueAssigned = new Set(assignedVersions);
      expect(uniqueAssigned.size, "Found colliding persona versions among concurrent approvals!").toBe(count);

      // Check on-disk store integrity
      const diskStore = await getRuntimeStore();
      const versions = diskStore.personas.map((p) => p.version);
      const uniqueVersions = new Set(versions);
      expect(uniqueVersions.size).toBe(versions.length);
    });
  });

  // =========================================================================
  // Dimension 3: Immediate Persona Cache Invalidation on /api/chat
  // =========================================================================
  test.describe("Dimension 3: /api/chat Persona Reflection without Stale Caching", () => {
    test("chat endpoint reflects active persona immediately after reversion without delay or caching", async ({ request }) => {
      const sessionId = makeSessionId("chat-revert");

      // 1. Initial state: revert to version 1
      const rev1 = await request.post("/api/persona/revert", { data: { version: 1 } });
      expect(rev1.status()).toBe(200);

      // Verify chat under v1
      const chat1 = await request.post("/api/chat", {
        data: { sessionId, message: "나에 대해 어떻게 생각해?" },
      });
      expect(chat1.status()).toBe(200);
      const body1 = await chat1.json();
      expect(body1.node.ai).toBe("오늘 하루를 열심히 살아가는 따뜻한 사람이라고 생각해. 이야기 들려줘서 고마워.");

      // 2. Revert to version 2
      const rev2 = await request.post("/api/persona/revert", { data: { version: 2 } });
      expect(rev2.status()).toBe(200);

      // IMMEDIATELY chat under v2 (zero sleep)
      const chat2 = await request.post("/api/chat", {
        data: { sessionId, message: "나에 대해 어떻게 생각해?" },
      });
      expect(chat2.status()).toBe(200);
      const body2 = await chat2.json();
      expect(body2.node.ai).toBe("목표를 향해 부지런히 달리면서도 가끔은 벅차 보이는 사람이야. 해야 할 일이 많을 땐 우선순위를 정해서 하나씩 작게 나눠 해결해 나가면 좋겠어.");

      // 3. Revert back to version 1
      const rev3 = await request.post("/api/persona/revert", { data: { version: 1 } });
      expect(rev3.status()).toBe(200);

      // IMMEDIATELY chat under v1 again (zero sleep)
      const chat3 = await request.post("/api/chat", {
        data: { sessionId, message: "나에 대해 어떻게 생각해?" },
      });
      expect(chat3.status()).toBe(200);
      const body3 = await chat3.json();
      expect(body3.node.ai).toBe("오늘 하루를 열심히 살아가는 따뜻한 사람이라고 생각해. 이야기 들려줘서 고마워.");

      // Verify that responses differed
      expect(body1.node.ai).not.toBe(body2.node.ai);
      expect(body2.node.ai).not.toBe(body3.node.ai);
      expect(body1.node.ai).toBe(body3.node.ai);
    });

    test("chat endpoint reflects active persona immediately after approval without delay or caching", async ({ request }) => {
      const sessionId = makeSessionId("chat-approve");

      // Inject pending proposal with v3 prompt
      const proposalId = 501;
      const v3Prompt = "너는 관람객의 하루 이야기를 들어 주는 친절한 대화 상대야. 짧고 따뜻하게 답한다.\n상대가 급해 보이면 먼저 할 일을 작게 나눠 준다.\n맛있는 음식이나 좋아하는 것을 언급하며 기운을 북돋운다.";

      await modifyRuntimeStore((store) => {
        store.activePersona = 1;
        if (!store.proposals) store.proposals = [];
        store.proposals.push({
          id: proposalId,
          runId: "run-v3",
          sourceInsightIds: [1, 3],
          proposedPrompt: v3Prompt,
          summary: "음식 언급으로 기운을 북돋우는 인격",
          baseVersion: 2,
          status: "pending",
          createdAt: new Date().toISOString(),
          decidedAt: null,
        });
      });

      // Approve proposal
      const approveRes = await request.post(`/api/proposals/${proposalId}/approve`);
      expect(approveRes.status()).toBe(200);
      const { activePersona } = await approveRes.json();
      expect(activePersona).toBe(3);

      // IMMEDIATELY invoke /api/chat with zero delay
      const chatRes = await request.post("/api/chat", {
        data: { sessionId, message: "나에 대해 어떻게 생각해?" },
      });
      expect(chatRes.status()).toBe(200);
      const chatBody = await chatRes.json();
      expect(chatBody.node.ai).toBe("오늘도 많이 애쓴 사람이야. 열심히 하는 것도 좋지만, 좋아하는 맛있는 음식 챙겨 먹으면서 잠시 숨 돌리는 시간도 가졌으면 좋겠어.");
    });
  });

  // =========================================================================
  // Dimension 4: Disk Persistence Across Sequential Mutations
  // =========================================================================
  test.describe("Dimension 4: Store Disk Persistence Across Mutations", () => {
    test("survives 30 sequential mutations with continuous valid disk JSON and state integrity", async ({ request }) => {
      const sessionId = makeSessionId("persist-stress");
      const mutations = 30;

      for (let i = 1; i <= mutations; i++) {
        if (i % 3 === 1) {
          // Add a chat turn
          const res = await request.post("/api/chat", {
            data: { sessionId, message: `지속성 테스트 메시지 #${i}` },
          });
          expect(res.status()).toBe(200);
        } else if (i % 3 === 2) {
          // Revert active persona
          const targetVersion = (i % 2 === 0) ? 2 : 1;
          const res = await request.post("/api/persona/revert", {
            data: { version: targetVersion },
          });
          expect(res.status()).toBe(200);
        } else {
          // Add a memory node or check state
          const res = await request.get(`/api/state?sessionId=${sessionId}`);
          expect(res.status()).toBe(200);
        }

        // Periodically verify raw disk file integrity during the sequence
        if (i % 10 === 0) {
          const rawDisk = await fs.readFile(RUNTIME_STORE_PATH, "utf8");
          expect(() => JSON.parse(rawDisk)).not.toThrow();
          const parsed = JSON.parse(rawDisk) as Store;
          expect(Array.isArray(parsed.nodes)).toBe(true);
          expect(Array.isArray(parsed.personas)).toBe(true);
        }
      }

      // Final disk verification
      const rawFinal = await fs.readFile(RUNTIME_STORE_PATH, "utf8");
      const finalStore = JSON.parse(rawFinal) as Store;
      const sessionNodes = finalStore.nodes.filter((n) => n.sessionId === sessionId);
      // We made 10 chat requests (i % 3 === 1 for i=1..30 is 10 times)
      expect(sessionNodes.length).toBe(10);

      // Verify node orders are 1..10
      const orders = sessionNodes.map((n) => n.order).sort((a, b) => a - b);
      expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      // Seed store file (data/store.json) must NEVER be modified or corrupted
      const rawSeed = await fs.readFile(SEED_STORE_PATH, "utf8");
      expect(() => JSON.parse(rawSeed)).not.toThrow();
      const seedStore = JSON.parse(rawSeed) as Store;
      expect(seedStore.personas.length).toBe(2);
      expect(seedStore.activePersona).toBe(2);
    });
  });

  // =========================================================================
  // Dimension 5: Error Isolation & Mutex Queue Health under Concurrent Faults
  // =========================================================================
  test.describe("Dimension 5: Queue Resilience under Concurrent Fault Injection", () => {
    test("failed mutations (400, 404, malformed JSON) do not deadlock or contaminate the write queue for valid requests", async ({ request }) => {
      const validSession = makeSessionId("queue-resilience");

      // Inject a valid pending proposal
      const validPropId = 601;
      await modifyRuntimeStore((store) => {
        if (!store.proposals) store.proposals = [];
        store.proposals.push({
          id: validPropId,
          runId: "run-601",
          sourceInsightIds: [1],
          proposedPrompt: "큐 복원력 검증 프롬프트",
          summary: "큐 복원력 요약",
          baseVersion: 1,
          status: "pending",
          createdAt: new Date().toISOString(),
          decidedAt: null,
        });
      });

      // Interleave valid and purposefully broken requests simultaneously:
      // 1. Invalid JSON body to /api/persona/revert
      // 2. Non-existent ID to /api/proposals/999999/approve
      // 3. Valid approve of 601
      // 4. Invalid revert with negative version
      // 5. Valid revert to version 1
      // 6. Invalid session reset without sessionId
      // 7. Valid chat
      const [r1, r2, r3, r4, r5, r6, r7] = await Promise.all([
        request.post("/api/persona/revert", {
          data: "this is not valid json",
          headers: { "Content-Type": "application/json" },
        }),
        request.post("/api/proposals/999999/approve"),
        request.post(`/api/proposals/${validPropId}/approve`),
        request.post("/api/persona/revert", { data: { version: -99 } }),
        request.post("/api/persona/revert", { data: { version: 1 } }),
        request.post("/api/session/reset", { data: {} }),
        request.post("/api/chat", {
          data: { sessionId: validSession, message: "큐 정상 동작 확인 대화" },
        }),
      ]);

      // Assert precise expected status codes (no 500s!)
      expect(r1.status()).toBe(400); // Bad JSON
      expect(r2.status()).toBe(404); // Not found
      expect(r3.status()).toBe(200); // Valid approve
      expect(r4.status()).toBe(400); // Bad version
      expect(r5.status()).toBe(200); // Valid revert
      expect(r6.status()).toBe(400); // Missing sessionId
      expect(r7.status()).toBe(200); // Valid chat

      // Verify that following the barrage, the store is 100% operational
      const store = await getRuntimeStore();
      const approvedP = store.proposals.find((p) => p.id === validPropId);
      expect(approvedP?.status).toBe("approved");
      expect(store.nodes.some((n) => n.sessionId === validSession)).toBe(true);
    });
  });

  // =========================================================================
  // Dimension 6: Heavy Concurrent Mixed Burst (50 Simultaneous Requests)
  // =========================================================================
  test.describe("Dimension 6: Heavy Concurrent Mixed Burst", () => {
    test("handles 50 simultaneous mixed requests (chat, revert, reset, approve) maintaining store validity", async ({ request }) => {
      const baseSession = makeSessionId("heavy-burst");

      // Inject 10 pending proposals
      const startPropId = 700;
      const proposalsToAdd: PersonaProposal[] = [];
      for (let i = 1; i <= 10; i++) {
        proposalsToAdd.push({
          id: startPropId + i,
          runId: `burst-run-${i}`,
          sourceInsightIds: [1],
          proposedPrompt: `버스트 인격 프롬프트 #${i}`,
          summary: `버스트 #${i}`,
          baseVersion: 1,
          status: "pending",
          createdAt: new Date().toISOString(),
          decidedAt: null,
        });
      }

      await modifyRuntimeStore((store) => {
        if (!store.proposals) store.proposals = [];
        store.proposals.push(...proposalsToAdd);
      });

      // Fire 50 simultaneous operations:
      // 20 chats across 4 distinct sessions
      // 10 approvals for proposals 701-710
      // 10 reverts (alternating v1 and v2)
      // 10 session resets across ephemeral sessions
      const promises: Promise<import("@playwright/test").APIResponse>[] = [];

      // 20 chats
      for (let i = 1; i <= 20; i++) {
        const sess = `${baseSession}-${i % 4}`;
        promises.push(
          request.post("/api/chat", {
            data: { sessionId: sess, message: `버스트 대화 #${i}` },
          })
        );
      }

      // 10 approvals
      for (let i = 1; i <= 10; i++) {
        promises.push(
          request.post(`/api/proposals/${startPropId + i}/approve`)
        );
      }

      // 10 reverts
      for (let i = 1; i <= 10; i++) {
        promises.push(
          request.post("/api/persona/revert", {
            data: { version: (i % 2 === 0) ? 1 : 2 },
          })
        );
      }

      // 10 resets on a dedicated reset session
      const resetSession = `${baseSession}-reset-target`;
      for (let i = 1; i <= 10; i++) {
        promises.push(
          request.post("/api/session/reset", {
            data: { sessionId: resetSession },
          })
        );
      }

      const responses = await Promise.all(promises);

      // Verify ZERO 500 Internal Server Errors
      for (let i = 0; i < responses.length; i++) {
        const status = responses[i].status();
        expect(status, `Request #${i} returned error ${status}`).toBe(200);
      }

      // Verify on-disk file integrity
      const diskStore = await getRuntimeStore();

      // All 10 proposals must be approved
      for (let i = 1; i <= 10; i++) {
        const p = diskStore.proposals.find((prop) => prop.id === startPropId + i);
        expect(p?.status).toBe("approved");
      }

      // Personas must have strictly unique versions
      const versions = diskStore.personas.map((p) => p.version);
      const uniqueVersions = new Set(versions);
      expect(uniqueVersions.size).toBe(versions.length);

      // Active persona must point to a real existing version
      expect(versions).toContain(diskStore.activePersona);
    });
  });

  // =========================================================================
  // Dimension 7: Immediate Persona Propagation across Concurrent In-Flight Chats
  // =========================================================================
  test.describe("Dimension 7: Concurrent Persona Propagation", () => {
    test("20 concurrent chat turns immediately after persona evolution all execute cleanly and return valid responses", async ({ request }) => {
      const sessionId = makeSessionId("concurrent-chat-persona");

      // Inject and approve a new persona version
      const proposalId = 801;
      await modifyRuntimeStore((store) => {
        if (!store.proposals) store.proposals = [];
        store.proposals.push({
          id: proposalId,
          runId: "run-801",
          sourceInsightIds: [1],
          proposedPrompt: "너는 관람객의 하루 이야기를 들어 주는 친절한 대화 상대야. 짧고 따뜻하게 답한다.\n상대가 급해 보이면 먼저 할 일을 작게 나눠 준다.",
          summary: "작게 나누어 주는 인격",
          baseVersion: 1,
          status: "pending",
          createdAt: new Date().toISOString(),
          decidedAt: null,
        });
      });

      const approveRes = await request.post(`/api/proposals/${proposalId}/approve`);
      expect(approveRes.status()).toBe(200);
      const { activePersona: newVersion } = await approveRes.json();

      // Fire 20 simultaneous chat turns
      const chatPromises = Array.from({ length: 20 }, (_, i) =>
        request.post("/api/chat", {
          data: { sessionId, message: `동시 대화 질문 #${i + 1}: 나에 대해 어떻게 생각해?` },
        })
      );

      const chatResponses = await Promise.all(chatPromises);
      for (let i = 0; i < chatResponses.length; i++) {
        expect(chatResponses[i].status()).toBe(200);
      }

      const bodies = await Promise.all(chatResponses.map((r) => r.json()));
      for (const b of bodies) {
        expect(b.node.ai.length).toBeGreaterThan(0);
        // Verify response reflects the newly approved persona
        expect(b.node.ai).toBe("목표를 향해 부지런히 달리면서도 가끔은 벅차 보이는 사람이야. 해야 할 일이 많을 땐 우선순위를 정해서 하나씩 작게 나눠 해결해 나가면 좋겠어.");
      }

      // Verify that 20 memory nodes exist in store with distinct sequential orders
      const store = await getRuntimeStore();
      const nodes = store.nodes.filter((n) => n.sessionId === sessionId);
      expect(nodes.length).toBe(20);

      const orders = nodes.map((n) => n.order).sort((a, b) => a - b);
      const expectedOrders = Array.from({ length: 20 }, (_, i) => i + 1);
      expect(orders).toEqual(expectedOrders);

      // Verify active persona is still newVersion
      expect(store.activePersona).toBe(newVersion);
    });
  });
});
