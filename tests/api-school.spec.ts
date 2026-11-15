import { test, expect } from "@playwright/test";

test.describe("B-09 School AI integration", () => {
  test("GET /api/school returns active school persona and pool", async ({ request }) => {
    const res = await request.get("/api/school");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("activePersona");
    expect(body).toHaveProperty("poolCount");
    expect(Array.isArray(body.meanings)).toBeTruthy();
  });

  test("POST /api/session/mode updates session mode", async ({ request }) => {
    const sessId = `test_school_mode_${Date.now()}`;
    const res = await request.post("/api/session/mode", {
      data: { sessionId: sessId, mode: "school" },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.mode).toBe("school");
  });

  test("POST /api/chat branches to school AI in school mode", async ({ request }) => {
    const sessId = `test_school_chat_${Date.now()}`;
    // Switch to school mode
    await request.post("/api/session/mode", {
      data: { sessionId: sessId, mode: "school" },
    });

    // Chat
    const chatRes = await request.post("/api/chat", {
      data: {
        sessionId: sessId,
        message: "오늘 학교 생활 어땠어?",
      },
    });
    expect(chatRes.ok()).toBeTruthy();
    const chatBody = await chatRes.json();
    expect(chatBody.node).toBeDefined();
    expect(chatBody.node.ai.length).toBeGreaterThan(0);
  });
});

test.describe("B-10 School REM integration", () => {
  test("DELETE /api/admin/school resets pool and active persona version to 1", async ({ request }) => {
    const delRes = await request.delete("/api/admin/school");
    expect(delRes.ok()).toBeTruthy();
    const delBody = await delRes.json();
    expect(delBody.ok).toBe(true);

    const schoolRes = await request.get("/api/school");
    expect(schoolRes.ok()).toBeTruthy();
    const schoolBody = await schoolRes.json();
    expect(schoolBody.poolCount).toBe(0);
    expect(schoolBody.version).toBe(1);
  });

  test("POST /api/admin/school/rem fails with 422 if pool has fewer than 2 items", async ({ request }) => {
    // Reset pool first
    await request.delete("/api/admin/school");

    const remRes = await request.post("/api/admin/school/rem");
    expect(remRes.status()).toBe(422);
    const body = await remRes.json();
    expect(body.error).toContain("부족해요");
  });

  test("POST /api/admin/school/rem auto-applies with >= 2 items, reverts, and resets", async ({ request }) => {
    // Reset first
    await request.delete("/api/admin/school");

    // Add at least 3 distinct meanings via /api/school/pool
    await request.post("/api/school/pool", {
      data: {
        title: "수학 시험의 추억",
        meaning: "오늘 수학 시험 보느라 모두 긴장하고 피곤했어요.",
        keywords: ["시험", "수학", "피곤"],
      },
    });
    await request.post("/api/school/pool", {
      data: {
        title: "운동장 점심 축구",
        meaning: "점심시간에 친구들과 운동장에서 축구하며 신나게 뛰놀았어요.",
        keywords: ["운동장", "축구", "점심"],
      },
    });
    await request.post("/api/school/pool", {
      data: {
        title: "동아리 축제 준비",
        meaning: "방과 후에 동아리 활동 준비로 다 같이 회의를 했어요.",
        keywords: ["방과후", "동아리", "회의"],
      },
    });

    // Verify pool has items
    const poolRes = await request.get("/api/school");
    const poolBody = await poolRes.json();
    expect(poolBody.poolCount).toBeGreaterThanOrEqual(2);

    // Run School REM
    const remRes = await request.post("/api/admin/school/rem");
    expect(remRes.ok()).toBeTruthy();
    const remBody = await remRes.json();
    expect(remBody.run).toBeDefined();
    expect(remBody.run.scope).toBe("school");
    expect(remBody.run.status).toBe("done");
    expect(remBody.appliedCount).toBeGreaterThanOrEqual(1);
    expect(remBody.newVersion).toBeGreaterThan(1);

    // Verify school persona updated with appliedBy: "auto"
    const updatedRes = await request.get("/api/school");
    const updatedBody = await updatedRes.json();
    expect(updatedBody.version).toBe(remBody.newVersion);
    expect(updatedBody.activePersona.appliedBy).toBe("auto");

    // Revert school persona
    const revertRes = await request.post("/api/admin/school/revert", {
      data: { version: 1 },
    });
    expect(revertRes.ok()).toBeTruthy();
    const revertBody = await revertRes.json();
    expect(revertBody.ok).toBe(true);
    expect(revertBody.version).toBe(1);

    const revertedRes = await request.get("/api/school");
    const revertedBody = await revertedRes.json();
    expect(revertedBody.version).toBe(1);

    // Cleanup: DELETE /api/admin/school
    const finalDel = await request.delete("/api/admin/school");
    expect(finalDel.ok()).toBeTruthy();
  });
});
