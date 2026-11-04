import { test, expect } from "@playwright/test";
import type { PersonaProposal, PersonaVersion, MemoryNode } from "../src/lib/types";

function makeSessionId(prefix = "prop-test"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Helper to ensure a pending proposal exists for testing.
 * Uses REM run or finds an existing pending proposal in the store.
 */
async function getOrCreatePendingProposal(
  request: import("@playwright/test").APIRequestContext
): Promise<{ proposalId: number; sessionId: string }> {
  // Check if seed data has a pending proposal
  const stateRes = await request.get("/api/state");
  if (stateRes.status() === 200) {
    const state = await stateRes.json();
    const pending = state.proposals?.find((p: PersonaProposal) => p.status === "pending");
    if (pending) {
      return { proposalId: pending.id, sessionId: "demo-1" };
    }
  }

  // Otherwise, create one via chat + REM run
  const sessionId = makeSessionId("proposal-seed");
  await request.post("/api/chat", {
    data: { sessionId, message: "오늘 힘든 일이 있었는데 위로받고 싶어." },
  });
  const remRes = await request.post("/api/rem/start", {
    data: { sessionId, mode: "consolidate" },
  });
  const { runId } = await remRes.json();

  // Poll for completion
  let proposalId: number | null = null;
  for (let i = 0; i < 30; i++) {
    const statusRes = await request.get(`/api/rem/status?runId=${runId}`);
    if (statusRes.status() === 200) {
      const run = await statusRes.json();
      if (run.status === "done" && run.proposalId) {
        proposalId = run.proposalId;
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!proposalId) {
    throw new Error("Failed to generate a pending proposal for testing");
  }
  return { proposalId, sessionId };
}

test.describe("Stage 4: Persona Proposals & Versioning API", () => {

  // =========================================================================
  // Tier 1: Feature Coverage (Happy Path)
  // =========================================================================
  test.describe("Tier 1: Feature Coverage", () => {
    test("POST /api/proposals/[id]/approve approves pending proposal and increments activePersona", async ({ request }) => {
      const { proposalId } = await getOrCreatePendingProposal(request);

      const approveRes = await request.post(`/api/proposals/${proposalId}/approve`);
      expect(approveRes.status(), `Approve failed with status ${approveRes.status()}`).toBe(200);

      const approveBody = await approveRes.json();
      expect(approveBody).toHaveProperty("ok", true);
      expect(typeof approveBody.activePersona).toBe("number");
      expect(approveBody.activePersona).toBeGreaterThanOrEqual(2);

      // Verify state reflects approved proposal and updated active persona
      const stateRes = await request.get("/api/state");
      const state = await stateRes.json();

      const approvedProp = state.proposals.find((p: PersonaProposal) => p.id === proposalId);
      expect(approvedProp).toBeDefined();
      expect(approvedProp.status).toBe("approved");
      expect(approvedProp.decidedAt).not.toBeNull();

      expect(state.activePersona).toBe(approveBody.activePersona);
    });

    test("POST /api/proposals/[id]/reject marks proposal rejected without changing activePersona", async ({ request }) => {
      const { proposalId } = await getOrCreatePendingProposal(request);

      const beforeStateRes = await request.get("/api/state");
      const beforeState = await beforeStateRes.json();
      const previousActivePersona = beforeState.activePersona;

      const rejectRes = await request.post(`/api/proposals/${proposalId}/reject`);
      expect(rejectRes.status()).toBe(200);
      const rejectBody = await rejectRes.json();
      expect(rejectBody).toEqual({ ok: true });

      // Verify status is rejected and active persona did not change
      const afterStateRes = await request.get("/api/state");
      const afterState = await afterStateRes.json();

      const rejectedProp = afterState.proposals.find((p: PersonaProposal) => p.id === proposalId);
      expect(rejectedProp).toBeDefined();
      expect(rejectedProp.status).toBe("rejected");
      expect(rejectedProp.decidedAt).not.toBeNull();
      expect(afterState.activePersona).toBe(previousActivePersona);
    });

    test("POST /api/persona/revert switches active persona back to version 1", async ({ request }) => {
      const revertRes = await request.post("/api/persona/revert", {
        data: { version: 1 },
      });

      expect(revertRes.status()).toBe(200);
      const body = await revertRes.json();
      expect(body).toEqual({ ok: true, activePersona: 1 });

      const stateRes = await request.get("/api/state");
      const state = await stateRes.json();
      expect(state.activePersona).toBe(1);
    });

    test("POST /api/session/reset clears visitor session data and resets active persona to 1", async ({ request }) => {
      const sessionId = makeSessionId("session-reset");

      await request.post("/api/chat", {
        data: { sessionId, message: "초기화 대상 대화 메시지입니다." },
      });

      const resetRes = await request.post("/api/session/reset", {
        data: { sessionId },
      });

      expect(resetRes.status()).toBe(200);
      const resetBody = await resetRes.json();
      expect(resetBody).toEqual({ ok: true });

      // Query state for that session
      const stateRes = await request.get(`/api/state?sessionId=${sessionId}`);
      const state = await stateRes.json();
      const sessionNodes = state.nodes.filter((n: MemoryNode) => n.sessionId === sessionId);
      expect(sessionNodes.length).toBe(0);
      expect(state.activePersona).toBe(1);
    });
  });

  // =========================================================================
  // Tier 2: Boundary & Corner Cases
  // =========================================================================
  test.describe("Tier 2: Boundary & Corner Cases", () => {
    test("POST /api/proposals/[id]/approve with non-numeric id returns 400 Bad Request", async ({ request }) => {
      const res = await request.post("/api/proposals/invalid-non-numeric/approve");
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });

    test("POST /api/proposals/[id]/approve with non-existent id returns 404 Not Found", async ({ request }) => {
      const res = await request.post("/api/proposals/9999999/approve");
      expect(res.status()).toBe(404);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });

    test("POST /api/proposals/[id]/approve on already approved proposal returns 400 Bad Request", async ({ request }) => {
      // Find an already approved proposal (e.g., seed id 1)
      const res = await request.post("/api/proposals/1/approve");
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });

    test("POST /api/proposals/[id]/reject with non-existent id returns 404 Not Found", async ({ request }) => {
      const res = await request.post("/api/proposals/9999999/reject");
      expect(res.status()).toBe(404);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });

    test("POST /api/persona/revert with non-existent version returns 404 Not Found", async ({ request }) => {
      const res = await request.post("/api/persona/revert", {
        data: { version: 99999 },
      });
      expect(res.status()).toBe(404);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });

    test("POST /api/persona/revert with missing or invalid version payload returns 400 Bad Request", async ({ request }) => {
      const res1 = await request.post("/api/persona/revert", {
        data: {},
      });
      expect(res1.status()).toBe(400);

      const res2 = await request.post("/api/persona/revert", {
        data: { version: "not-a-number" },
      });
      expect(res2.status()).toBe(400);

      const res3 = await request.post("/api/persona/revert", {
        data: { version: -1 },
      });
      expect(res3.status()).toBe(400);
    });

    test("POST /api/session/reset without sessionId returns 400 Bad Request", async ({ request }) => {
      const res = await request.post("/api/session/reset", {
        data: {},
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body).toHaveProperty("error");
    });
  });

  // =========================================================================
  // Tier 3: Cross-Feature Combinations
  // =========================================================================
  test.describe("Tier 3: Cross-Feature Combinations", () => {
    test("Persona approval immediately propagates new persona prompt to subsequent chat", async ({ request }) => {
      const sessionId = makeSessionId("persona-propagation");

      // 1. Establish baseline chat
      const beforeChat = await request.post("/api/chat", {
        data: { sessionId, message: "안녕, 오늘 날씨가 참 좋다." },
      });
      expect(beforeChat.status()).toBe(200);

      // 2. Obtain a pending proposal
      const { proposalId } = await getOrCreatePendingProposal(request);

      // Read proposal's proposedPrompt
      const stateBefore = await (await request.get("/api/state")).json();
      const targetProposal = stateBefore.proposals.find((p: PersonaProposal) => p.id === proposalId);
      expect(targetProposal).toBeDefined();

      // 3. Approve proposal
      const approveRes = await request.post(`/api/proposals/${proposalId}/approve`);
      expect(approveRes.status()).toBe(200);
      const { activePersona: newVersion } = await approveRes.json();

      // 4. Send next chat message
      const afterChat = await request.post("/api/chat", {
        data: { sessionId, message: "나 지금 너무 바쁘고 정신없어!" },
      });
      expect(afterChat.status()).toBe(200);
      const afterBody = await afterChat.json();
      expect(afterBody.node.ai.length).toBeGreaterThan(0);

      // Verify active persona in state is indeed the new version
      const stateAfter = await (await request.get("/api/state")).json();
      expect(stateAfter.activePersona).toBe(newVersion);
      const activePersonaObj = stateAfter.personas.find((p: PersonaVersion) => p.version === newVersion);
      expect(activePersonaObj).toBeDefined();
      expect(activePersonaObj.systemPrompt).toBe(targetProposal.proposedPrompt);
    });

    test("Persona revert restores previous persona and subsequent chat reflects rollback", async ({ request }) => {
      const sessionId = makeSessionId("persona-rollback");

      // Revert to version 1
      const revertRes = await request.post("/api/persona/revert", {
        data: { version: 1 },
      });
      expect(revertRes.status()).toBe(200);

      // Verify next chat succeeds under version 1
      const chatRes = await request.post("/api/chat", {
        data: { sessionId, message: "되돌리기 후 첫 질문이야." },
      });
      expect(chatRes.status()).toBe(200);

      const state = await (await request.get("/api/state")).json();
      expect(state.activePersona).toBe(1);
    });
  });

  // =========================================================================
  // Tier 4: Real-World Scenarios
  // =========================================================================
  test.describe("Tier 4: Real-World Scenarios", () => {
    test("Exhibition visitor persona evolution, review, approval, and booth handoff", async ({ request }) => {
      const visitorSession = makeSessionId("visitor-booth");

      // Step 1: Visitor converses with AI
      await request.post("/api/chat", {
        data: { sessionId: visitorSession, message: "안녕하세요! 오늘 전시에서 만난 게 반가워요." },
      });
      await request.post("/api/chat", {
        data: { sessionId: visitorSession, message: "피곤할 때 힘이 나는 말 한마디 해줄 수 있나요?" },
      });

      // Step 2: System initiates REM and produces proposal
      const remRes = await request.post("/api/rem/start", {
        data: { sessionId: visitorSession, mode: "consolidate" },
      });
      expect(remRes.status()).toBe(202);
      const { runId } = await remRes.json();

      let proposalId: number | null = null;
      for (let i = 0; i < 30; i++) {
        const sRes = await request.get(`/api/rem/status?runId=${runId}`);
        if (sRes.status() === 200) {
          const run = await sRes.json();
          if (run.status === "done") {
            proposalId = run.proposalId;
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      if (!proposalId) {
        // Fallback to checking pending proposal in state
        const s = await (await request.get("/api/state")).json();
        const p = s.proposals.find((prop: PersonaProposal) => prop.status === "pending");
        proposalId = p?.id ?? null;
      }

      expect(proposalId).not.toBeNull();

      // Step 3: Visitor inspects proposal card and approves
      const approveRes = await request.post(`/api/proposals/${proposalId}/approve`);
      expect(approveRes.status()).toBe(200);
      const { activePersona } = await approveRes.json();
      expect(activePersona).toBeGreaterThanOrEqual(1);

      // Step 4: Visitor chats with evolved persona
      const evolvedChat = await request.post("/api/chat", {
        data: { sessionId: visitorSession, message: "너 정말 이전과 다르게 느껴져!" },
      });
      expect(evolvedChat.status()).toBe(200);

      // Step 5: Booth attendant resets session for next visitor
      const resetRes = await request.post("/api/session/reset", {
        data: { sessionId: visitorSession },
      });
      expect(resetRes.status()).toBe(200);

      // Verify next visitor sees empty history and baseline active persona
      const freshStateRes = await request.get(`/api/state?sessionId=${visitorSession}`);
      const freshState = await freshStateRes.json();
      const leftOverNodes = freshState.nodes.filter((n: MemoryNode) => n.sessionId === visitorSession);
      expect(leftOverNodes.length).toBe(0);
      expect(freshState.activePersona).toBe(1);
    });
  });
});
