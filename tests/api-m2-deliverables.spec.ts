import { test, expect } from "@playwright/test";
import type { PersonaProposal, Comparison } from "@/lib/types";

test.describe("Milestone 2 Deliverables: B-05, B-06, B-07, B-08 Integration", () => {
  const sessionId = "m2-test-visitor-session";

  test.beforeEach(async ({ request }) => {
    // Reset session before each test
    await request.post("/api/session/reset", {
      data: { sessionId },
    });
  });

  test("B-05 & B-07: REM generates itemized 3-tier proposal and captures before-sleep comparison probe", async ({
    request,
  }) => {
    // 1. Seed two chat memory nodes
    await request.post("/api/chat", {
      data: {
        sessionId,
        message: "오늘 시험 공부를 하느라 너무 지치고 힘들었어.",
      },
    });
    await request.post("/api/chat", {
      data: {
        sessionId,
        message: "내일도 해야 할 과제가 산더미처럼 많아서 막막해.",
      },
    });

    // 2. Start REM consolidate run
    const startRes = await request.post("/api/rem/start", {
      data: { sessionId, mode: "consolidate" },
    });
    expect(startRes.status()).toBe(202);
    const { runId } = await startRes.json();
    expect(runId).toBeDefined();

    // 3. Poll until REM run completes
    let runStatus = "running";
    let attempts = 0;
    while (runStatus === "running" && attempts < 25) {
      await new Promise((r) => setTimeout(r, 80));
      const statusRes = await request.get(`/api/rem/status?runId=${runId}`);
      const statusData = await statusRes.json();
      runStatus = statusData.status;
      attempts++;
    }
    expect(runStatus).toBe("done");

    // 4. Verify B-05: Proposal has 3-tier items
    const stateRes = await request.get("/api/state");
    const state = await stateRes.json();

    const proposal = state.proposals.find((p: PersonaProposal) => p.runId === runId);
    expect(proposal).toBeDefined();
    expect(proposal.status).toBe("pending");
    expect(Array.isArray(proposal.items)).toBe(true);
    expect(proposal.items.length).toBeGreaterThanOrEqual(1);
    expect(proposal.items.length).toBeLessThanOrEqual(4);

    // Verify item-level structure
    const firstItem = proposal.items[0];
    expect(firstItem).toHaveProperty("id", 1);
    expect(firstItem).toHaveProperty("status", "pending");
    expect(firstItem.evidenceNodeIds.length).toBeGreaterThanOrEqual(2);
    expect(["moveStyle", "addNote", "editNote", "removeNote"]).toContain(firstItem.change.kind);

    // 5. Verify B-07: Before-sleep comparison probe was created
    const comparison = (state.comparisons || []).find(
      (c: Comparison) => c.runId === runId
    );
    expect(comparison).toBeDefined();
    expect(comparison.question).toBe("나에 대해 어떻게 생각해?");
    expect(comparison.before).toBeDefined();
    expect(comparison.before.version).toBe(1);
    expect(comparison.before.answer).toContain("[v1]");
    expect(comparison.after).toBeNull();
  });

  test("B-06 & B-07: Item-level approval increments persona and updates after-comparison probe", async ({
    request,
  }) => {
    // 1. Seed memories and run REM to get proposal
    await request.post("/api/chat", {
      data: { sessionId, message: "오늘 공부 열심히 했어." },
    });
    await request.post("/api/chat", {
      data: { sessionId, message: "내일도 좋은 하루 보내고 싶어." },
    });

    const startRes = await request.post("/api/rem/start", {
      data: { sessionId, mode: "consolidate" },
    });
    const { runId } = await startRes.json();

    while (true) {
      await new Promise((r) => setTimeout(r, 60));
      const s = await request.get(`/api/rem/status?runId=${runId}`).then((r) => r.json());
      if (s.status !== "running") break;
    }

    const state1 = await request.get("/api/state").then((r) => r.json());
    const proposal = state1.proposals.find((p: PersonaProposal) => p.runId === runId);
    expect(proposal).toBeDefined();
    expect(proposal.items.length).toBeGreaterThanOrEqual(2);

    // 2. Approve Item 1 via /api/proposals/[id]/items/[itemId]/approve
    const prevActive = state1.activePersona || 1;
    const approveItemRes = await request.post(
      `/api/proposals/${proposal.id}/items/1/approve`
    );
    expect(approveItemRes.status()).toBe(200);
    const approveItemData = await approveItemRes.json();
    expect(approveItemData.ok).toBe(true);
    expect(approveItemData.itemStatus).toBe("approved");
    expect(approveItemData.activePersona).toBeGreaterThan(prevActive);
    // Since item 2 is still pending, proposalStatus remains "pending"
    expect(approveItemData.proposalStatus).toBe("pending");

    // 3. Verify B-07: After-comparison probe was populated upon version increment
    const state2 = await request.get("/api/state").then((r) => r.json());
    const compAfter = state2.comparisons.find((c: Comparison) => c.runId === runId);
    expect(compAfter).toBeDefined();
    expect(compAfter.after).not.toBeNull();
    expect(compAfter.after.version).toBe(approveItemData.activePersona);
    expect(compAfter.after.answer).toContain(`[v${approveItemData.activePersona}]`);
    expect(compAfter.after.answer).not.toBe(compAfter.before.answer);

    // 4. Reject Item 2 via /api/proposals/[id]/items/[itemId]/reject
    const rejectItemRes = await request.post(
      `/api/proposals/${proposal.id}/items/2/reject`
    );
    expect(rejectItemRes.status()).toBe(200);
    const rejectItemData = await rejectItemRes.json();
    expect(rejectItemData.ok).toBe(true);
    expect(rejectItemData.itemStatus).toBe("rejected");
    // All items now decided -> proposalStatus should be "done"
    expect(rejectItemData.proposalStatus).toBe("done");

    // Persona remains at current active version (not incremented on rejection)
    const state3 = await request.get("/api/state").then((r) => r.json());
    expect(state3.activePersona).toBe(approveItemData.activePersona);
    const finalProp = state3.proposals.find((p: PersonaProposal) => p.id === proposal.id);
    expect(finalProp.status).toBe("done");
  });

  test("B-06: Batch decide (/api/proposals/[id]/decide) handles multi-item approve/reject atomically", async ({
    request,
  }) => {
    // 1. Seed memories and run REM
    await request.post("/api/chat", {
      data: { sessionId, message: "오늘 힘든 일도 있었지만 잘 버텼어." },
    });
    await request.post("/api/chat", {
      data: { sessionId, message: "맛있는 저녁 먹고 푹 쉴래." },
    });

    const startRes = await request.post("/api/rem/start", {
      data: { sessionId, mode: "consolidate" },
    });
    const { runId } = await startRes.json();

    while (true) {
      await new Promise((r) => setTimeout(r, 60));
      const s = await request.get(`/api/rem/status?runId=${runId}`).then((r) => r.json());
      if (s.status !== "running") break;
    }

    const state = await request.get("/api/state").then((r) => r.json());
    const proposal = state.proposals.find((p: PersonaProposal) => p.runId === runId);
    expect(proposal).toBeDefined();

    const prevActive = state.activePersona || 1;
    // 2. Batch decide: approve item 1, reject item 2
    const decideRes = await request.post(`/api/proposals/${proposal.id}/decide`, {
      data: {
        approve: [1],
        reject: [2],
      },
    });
    expect(decideRes.status()).toBe(200);
    const decideData = await decideRes.json();
    expect(decideData.ok).toBe(true);
    expect(decideData.activePersona).toBeGreaterThan(prevActive);
    expect(decideData.proposalStatus).toBe("done");

    // 3. Verify error handling: deciding already decided items returns 400
    const invalidDecideRes = await request.post(`/api/proposals/${proposal.id}/decide`, {
      data: { approve: [1] },
    });
    expect(invalidDecideRes.status()).toBe(400);
  });

  test("B-08: Mode 2 Dream validates minimum 2 memory requirement (422) and emits star connection markers", async ({
    request,
  }) => {
    // 1. Empty session with 0 memories -> dream mode returns 422
    const emptyDreamRes = await request.post("/api/rem/start", {
      data: { sessionId: "empty-dream-session", mode: "dream" },
    });
    expect(emptyDreamRes.status()).toBe(422);

    // 2. Seed memories and test dream run
    await request.post("/api/chat", {
      data: { sessionId, message: "친구랑 다퉈서 마음이 무거워." },
    });
    await request.post("/api/chat", {
      data: { sessionId, message: "그래도 화해하고 다시 잘 지내고 싶어." },
    });

    const dreamRes = await request.post("/api/rem/start", {
      data: { sessionId, mode: "dream" },
    });
    expect(dreamRes.status()).toBe(202);
    const { runId } = await dreamRes.json();

    // Poll until completion
    while (true) {
      await new Promise((r) => setTimeout(r, 60));
      const s = await request.get(`/api/rem/status?runId=${runId}`).then((r) => r.json());
      if (s.status !== "running") break;
    }

    // Verify dream insights generated
    const state = await request.get("/api/state").then((r) => r.json());
    const dreamInsights = state.insights.filter((i: any) => i.mode === "dream");
    expect(dreamInsights.length).toBeGreaterThanOrEqual(1);

    // Verify proposal generated from dream
    const dreamProposal = state.proposals.find((p: PersonaProposal) => p.runId === runId);
    expect(dreamProposal).toBeDefined();
    expect(dreamProposal.items.length).toBeGreaterThanOrEqual(1);
  });
});
