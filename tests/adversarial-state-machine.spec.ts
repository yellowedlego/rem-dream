import { test, expect } from "@playwright/test";
import type { PersonaProposal, PersonaVersion } from "@/lib/types";

test.describe("Adversarial State Transitions, Itemized Decisions & Rollbacks", () => {
  const sessionId = "adv-visitor-session";

  test.beforeEach(async ({ request }) => {
    // Reset session before each test
    const resetRes = await request.post("/api/session/reset", {
      data: { sessionId },
    });
    expect(resetRes.status()).toBe(200);
  });

  test("1. Partial Item Approval followed by Rejection maintains monotonic version and proposal status", async ({
    request,
  }) => {
    // Seed chat memories to trigger proposal generation
    await request.post("/api/chat", {
      data: { sessionId, message: "오늘 하루 너무 피곤하고 지쳤어." },
    });
    await request.post("/api/chat", {
      data: { sessionId, message: "그래도 목표했던 공부는 다 끝내서 다행이야." },
    });

    // Start consolidate REM run
    const startRes = await request.post("/api/rem/start", {
      data: { sessionId, mode: "consolidate" },
    });
    expect(startRes.status()).toBe(202);
    const { runId } = await startRes.json();

    // Poll until complete
    let attempts = 0;
    while (attempts < 30) {
      await new Promise((r) => setTimeout(r, 80));
      const statusRes = await request.get(`/api/rem/status?runId=${runId}`);
      const statusData = await statusRes.json();
      if (statusData.status !== "running") break;
      attempts++;
    }

    const state1 = await request.get(`/api/state?sessionId=${sessionId}`).then((r) => r.json());
    const proposal = state1.proposals.find((p: PersonaProposal) => p.runId === runId);
    expect(proposal).toBeDefined();
    expect(proposal.items.length).toBeGreaterThanOrEqual(2);

    const maxExisting = Math.max(...state1.personas.map((p: PersonaVersion) => p.version));
    const expectedNewVersion = maxExisting + 1;

    // Step A: Approve item 1 only
    const approveRes = await request.post(
      `/api/proposals/${proposal.id}/items/1/approve`
    );
    expect(approveRes.status()).toBe(200);
    const approveData = await approveRes.json();
    expect(approveData.ok).toBe(true);
    expect(approveData.itemStatus).toBe("approved");
    expect(approveData.activePersona).toBe(expectedNewVersion);
    expect(approveData.proposalStatus).toBe("pending"); // Because item 2 is still pending

    // Verify intermediate state
    const stateInter = await request.get(`/api/state?sessionId=${sessionId}`).then((r) => r.json());
    expect(stateInter.activePersona).toBe(expectedNewVersion);
    const propInter = stateInter.proposals.find((p: PersonaProposal) => p.id === proposal.id);
    expect(propInter.status).toBe("pending");
    expect(propInter.items[0].status).toBe("approved");
    expect(propInter.items[1].status).toBe("pending");

    // Step B: Reject item 2
    const rejectRes = await request.post(
      `/api/proposals/${proposal.id}/items/2/reject`
    );
    expect(rejectRes.status()).toBe(200);
    const rejectData = await rejectRes.json();
    expect(rejectData.ok).toBe(true);
    expect(rejectData.itemStatus).toBe("rejected");
    // All items now decided -> proposal becomes 'done'
    expect(rejectData.proposalStatus).toBe("done");
    // Persona must remain at the incremented version from item 1 approval
    expect(rejectData.activePersona).toBe(expectedNewVersion);

    // Final state verification
    const finalState = await request.get(`/api/state?sessionId=${sessionId}`).then((r) => r.json());
    expect(finalState.activePersona).toBe(expectedNewVersion);
    const finalProp = finalState.proposals.find((p: PersonaProposal) => p.id === proposal.id);
    expect(finalProp.status).toBe("done");
    expect(finalProp.decidedAt).not.toBeNull();
  });

  test("2. Rejection of all items marks proposal as 'rejected' without persona increment", async ({
    request,
  }) => {
    // Seed chat memories
    await request.post("/api/chat", {
      data: { sessionId, message: "오늘 시험 준비하느라 책을 많이 읽었어." },
    });
    await request.post("/api/chat", {
      data: { sessionId, message: "내일도 도서관에 일찍 가야 해." },
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

    const currentVersion = state.activePersona || 1;

    // Reject all items in sequence
    for (let i = 0; i < proposal.items.length; i++) {
      const item = proposal.items[i];
      const res = await request.post(
        `/api/proposals/${proposal.id}/items/${item.id}/reject`
      );
      expect(res.status()).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.itemStatus).toBe("rejected");
      if (i === proposal.items.length - 1) {
        expect(data.proposalStatus).toBe("rejected");
      }
    }

    // Verify persona version did NOT increment
    const afterState = await request.get("/api/state").then((r) => r.json());
    expect(afterState.activePersona).toBe(currentVersion);
    const afterProp = afterState.proposals.find((p: PersonaProposal) => p.id === proposal.id);
    expect(afterProp.status).toBe("rejected");
  });

  test("3. Batch decide idempotency and rejection of invalid / duplicate decisions", async ({
    request,
  }) => {
    await request.post("/api/chat", {
      data: { sessionId, message: "새로운 취미를 시작해보려고 해." },
    });
    await request.post("/api/chat", {
      data: { sessionId, message: "사진 찍는 걸 배워보고 싶어." },
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

    // 1. Empty decision payload -> 400
    const emptyDecide = await request.post(`/api/proposals/${proposal.id}/decide`, {
      data: { approve: [], reject: [] },
    });
    expect(emptyDecide.status()).toBe(400);

    // 2. Non-existent item ID -> 404
    const nonExistentItem = await request.post(`/api/proposals/${proposal.id}/decide`, {
      data: { approve: [9999] },
    });
    expect(nonExistentItem.status()).toBe(404);

    // 3. Valid batch decide: approve item 1, reject item 2
    const validBatch = await request.post(`/api/proposals/${proposal.id}/decide`, {
      data: { approve: [1], reject: [2] },
    });
    expect(validBatch.status()).toBe(200);
    const batchData = await validBatch.json();
    expect(batchData.ok).toBe(true);
    expect(batchData.proposalStatus).toBe("done");

    // 4. Duplicate batch decide on finished proposal -> 400
    const duplicateBatch = await request.post(`/api/proposals/${proposal.id}/decide`, {
      data: { approve: [1] },
    });
    expect(duplicateBatch.status()).toBe(400);

    // 5. Subsequent single approve on finished proposal -> 400
    const postApprove = await request.post(`/api/proposals/${proposal.id}/items/1/approve`);
    expect(postApprove.status()).toBe(400);

    // 6. Subsequent single reject on finished proposal -> 400
    const postReject = await request.post(`/api/proposals/${proposal.id}/items/2/reject`);
    expect(postReject.status()).toBe(400);
  });

  test("4. Revert to prior version preserves complete snapshot history and enforces boundary validation", async ({
    request,
  }) => {
    // Create new persona version via chat & REM
    await request.post("/api/chat", {
      data: { sessionId, message: "오늘 하루 이야기를 나눠보자." },
    });
    await request.post("/api/chat", {
      data: { sessionId, message: "기분이 많이 좋아졌어." },
    });

    const run1 = await request
      .post("/api/rem/start", { data: { sessionId, mode: "consolidate" } })
      .then((r) => r.json());

    while (true) {
      await new Promise((r) => setTimeout(r, 60));
      const s = await request.get(`/api/rem/status?runId=${run1.runId}`).then((r) => r.json());
      if (s.status !== "running") break;
    }

    const s1 = await request.get(`/api/state?sessionId=${sessionId}`).then((r) => r.json());
    const prop1 = s1.proposals.find((p: PersonaProposal) => p.runId === run1.runId);

    const maxExisting = Math.max(...s1.personas.map((p: PersonaVersion) => p.version));
    const newlyCreatedVersion = maxExisting + 1;

    // Approve proposal 1 to create newlyCreatedVersion
    const app1 = await request.post(`/api/proposals/${prop1.id}/approve`);
    expect(app1.status()).toBe(200);

    const s2 = await request.get(`/api/state?sessionId=${sessionId}`).then((r) => r.json());
    expect(s2.activePersona).toBe(newlyCreatedVersion);
    expect(s2.personas.length).toBeGreaterThanOrEqual(2);

    // Adversarial Revert Calls
    // A. Revert with negative version -> 400
    const revNeg = await request.post("/api/persona/revert", { data: { version: -1 } });
    expect(revNeg.status()).toBe(400);

    // B. Revert with zero version -> 400
    const revZero = await request.post("/api/persona/revert", { data: { version: 0 } });
    expect(revZero.status()).toBe(400);

    // C. Revert with string version -> 400
    const revStr = await request.post("/api/persona/revert", { data: { version: "two" } });
    expect(revStr.status()).toBe(400);

    // D. Revert with missing version -> 400
    const revEmpty = await request.post("/api/persona/revert", { data: {} });
    expect(revEmpty.status()).toBe(400);

    // E. Revert to non-existent version 999 -> 404
    const revMissing = await request.post("/api/persona/revert", { data: { version: 999 } });
    expect(revMissing.status()).toBe(404);

    // F. Revert to version 1 -> 200
    const rev1 = await request.post("/api/persona/revert", { data: { sessionId, version: 1 } });
    expect(rev1.status()).toBe(200);
    const revData = await rev1.json();
    expect(revData.ok).toBe(true);
    expect(revData.activePersona).toBe(1);

    // Verify state after revert to 1:
    // - activePersona is 1
    // - store.personas still contains newlyCreatedVersion (immutable history preserved!)
    const stateAfterRev = await request.get(`/api/state?sessionId=${sessionId}`).then((r) => r.json());
    expect(stateAfterRev.activePersona).toBe(1);
    expect(stateAfterRev.personas.some((p: PersonaVersion) => p.version === newlyCreatedVersion)).toBe(true);

    // G. Revert back forward to newlyCreatedVersion -> 200 (이 세션의 인격만 되돌린다)
    const revForward = await request.post("/api/persona/revert", { data: { sessionId, version: newlyCreatedVersion } });
    expect(revForward.status()).toBe(200);
    const stateAfterRevForward = await request.get(`/api/state?sessionId=${sessionId}`).then((r) => r.json());
    expect(stateAfterRevForward.activePersona).toBe(newlyCreatedVersion);
  });
});
