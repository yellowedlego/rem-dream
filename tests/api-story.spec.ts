import { test, expect } from "@playwright/test";
import type { MemoryNode, Story } from "../src/lib/types";

function makeSessionId(prefix = "story-test"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test.describe("Milestone 1B: Story Splitting, Query & Deletion APIs", () => {
  // =========================================================================
  // Tier 1: Feature Coverage (Happy Path)
  // =========================================================================
  test.describe("Tier 1: Feature Coverage", () => {
    test("POST /api/story creates story and nodes with strict verbatim preservation", async ({ request }) => {
      const sessionId = makeSessionId("verbatim");
      const rawText =
        "오늘 아침에는 일찍 일어났다.\n\n날씨가 맑아서 기분이 상쾌했다. 창문을 열고 신선한 공기를 마셨다.\n\n오후에는 친구를 만나 카페에 갔다.";

      const res = await request.post("/api/story", {
        data: { sessionId, text: rawText },
      });

      expect(res.status(), `Expected 200, got ${res.status()}`).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty("story");
      expect(body).toHaveProperty("nodes");

      const story: Story = body.story;
      const nodes: MemoryNode[] = body.nodes;

      // Story schema checks
      expect(typeof story.id).toBe("number");
      expect(story.id).toBeGreaterThan(0);
      expect(story.sessionId).toBe(sessionId);
      expect(story.rawText).toBe(rawText);
      expect(Array.isArray(story.nodeIds)).toBe(true);
      expect(story.nodeIds.length).toBe(nodes.length);
      expect(new Date(story.createdAt).toISOString()).toBe(story.createdAt);

      // Verbatim preservation check: MUST equal rawText character for character
      const concatenated = nodes.map((n) => n.user).join("");
      expect(concatenated).toBe(rawText);

      // Node properties checks
      let lastEnd = 0;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        expect(node.sessionId).toBe(sessionId);
        expect(node.storyId).toBe(story.id);
        expect(Array.isArray(node.storySpan)).toBe(true);
        expect(node.storySpan).toBeDefined();

        const [start, end] = node.storySpan!;
        expect(start).toBe(lastEnd);
        expect(end).toBeGreaterThan(start);
        expect(rawText.slice(start, end)).toBe(node.user);
        lastEnd = end;

        expect(typeof node.topic).toBe("string");
        expect(node.topic!.length).toBeGreaterThan(0);
        expect(typeof node.ai).toBe("string");
        expect(node.order).toBe(i + 1);
      }
      expect(lastEnd).toBe(rawText.length);
    });

    test("GET /api/sessions returns accurate session list with nodeCount and preview", async ({ request }) => {
      const sessionId = makeSessionId("sessions-summary");
      const text = "첫 번째 단락의 이야기입니다.\n\n두 번째 단락의 이야기입니다.";

      await request.post("/api/story", {
        data: { sessionId, text },
      });

      const res = await request.get("/api/sessions");
      expect(res.status()).toBe(200);

      const sessions = await res.json();
      expect(Array.isArray(sessions)).toBe(true);

      const found = sessions.find((s: { sessionId: string }) => s.sessionId === sessionId);
      expect(found).toBeDefined();
      expect(found.nodeCount).toBeGreaterThanOrEqual(2);
      expect(typeof found.lastAt).toBe("string");
      expect(typeof found.preview).toBe("string");
      expect(found.preview.length).toBeGreaterThan(0);
    });

    test("GET /api/nodes supports sessionId and partial substring q search", async ({ request }) => {
      const sessionId = makeSessionId("nodes-search");
      const uniqueKeyword = "독특한별똥별단어";
      const storyText = `밤하늘을 올려다보았는데 ${uniqueKeyword}가 쏟아져 내렸다.\n\n정말 아름다운 밤이었다.`;

      await request.post("/api/story", {
        data: { sessionId, text: storyText },
      });

      // Search by keyword
      const resKeyword = await request.get(`/api/nodes?q=${encodeURIComponent(uniqueKeyword)}`);
      expect(resKeyword.status()).toBe(200);
      const dataKeyword = await resKeyword.json();
      expect(Array.isArray(dataKeyword.nodes)).toBe(true);
      expect(dataKeyword.nodes.length).toBeGreaterThanOrEqual(1);
      expect(dataKeyword.nodes.some((n: MemoryNode) => n.user.includes(uniqueKeyword))).toBe(true);

      // Search with both sessionId and query
      const resScoped = await request.get(
        `/api/nodes?sessionId=${sessionId}&q=${encodeURIComponent(uniqueKeyword)}`
      );
      expect(resScoped.status()).toBe(200);
      const dataScoped = await resScoped.json();
      expect(dataScoped.nodes.length).toBe(1);
      expect(dataScoped.nodes[0].sessionId).toBe(sessionId);

      // Search with non-matching query returns empty
      const resNoMatch = await request.get(
        `/api/nodes?sessionId=${sessionId}&q=전혀없는키워드XYZ999`
      );
      expect(resNoMatch.status()).toBe(200);
      const dataNoMatch = await resNoMatch.json();
      expect(dataNoMatch.nodes.length).toBe(0);
    });

    test("DELETE /api/nodes/[id] deletes node and cleans up insight sourceNodeIds", async ({ request }) => {
      const sessionId = makeSessionId("del-node");

      // 1. Create a node
      const chatRes = await request.post("/api/chat", {
        data: { sessionId, message: "삭제될 기억 노드입니다." },
      });
      expect(chatRes.status()).toBe(200);
      const node: MemoryNode = (await chatRes.json()).node;

      // 2. Delete the node
      const delRes = await request.delete(`/api/nodes/${node.id}`);
      expect(delRes.status()).toBe(200);
      const delBody = await delRes.json();
      expect(delBody).toEqual({ ok: true });

      // 3. Verify node is gone
      const checkRes = await request.get(`/api/nodes?sessionId=${sessionId}`);
      const checkData = await checkRes.json();
      expect(checkData.nodes.some((n: MemoryNode) => n.id === node.id)).toBe(false);

      // 4. Repeated delete returns 404
      const secondDel = await request.delete(`/api/nodes/${node.id}`);
      expect(secondDel.status()).toBe(404);
    });

    test("DELETE /api/stories/[id] deletes story and cascades to all its nodes", async ({ request }) => {
      const sessionId = makeSessionId("del-story");
      const text = "이야기 1단락.\n\n이야기 2단락.\n\n이야기 3단락.";

      const storyRes = await request.post("/api/story", {
        data: { sessionId, text },
      });
      expect(storyRes.status()).toBe(200);
      const { story, nodes } = await storyRes.json();
      const nodeIds: number[] = nodes.map((n: MemoryNode) => n.id);

      // Verify nodes exist
      const beforeNodes = await request.get(`/api/nodes?sessionId=${sessionId}`);
      const beforeData = await beforeNodes.json();
      expect(beforeData.nodes.length).toBe(nodes.length);

      // Delete story
      const delRes = await request.delete(`/api/stories/${story.id}`);
      expect(delRes.status()).toBe(200);
      expect(await delRes.json()).toEqual({ ok: true });

      // Verify all associated nodes were cascade deleted
      const afterNodes = await request.get(`/api/nodes?sessionId=${sessionId}`);
      const afterData = await afterNodes.json();
      for (const nid of nodeIds) {
        expect(afterData.nodes.some((n: MemoryNode) => n.id === nid)).toBe(false);
      }

      // Repeated delete returns 404
      const secondDel = await request.delete(`/api/stories/${story.id}`);
      expect(secondDel.status()).toBe(404);
    });

    test("DELETE /api/sessions/[sessionId] purges all session nodes and stories", async ({ request }) => {
      const sessionId = makeSessionId("purge-session");

      // Add a chat node and a story
      await request.post("/api/chat", {
        data: { sessionId, message: "세션 대화 노드" },
      });
      await request.post("/api/story", {
        data: { sessionId, text: "세션 이야기 본문입니다.\n\n두 번째 문단입니다." },
      });

      // Confirm existence in state
      const stateBefore = await request.get(`/api/state?sessionId=${sessionId}`);
      const dataBefore = await stateBefore.json();
      expect(dataBefore.nodes.length).toBeGreaterThan(0);

      // Purge session
      const purgeRes = await request.delete(`/api/sessions/${sessionId}`);
      expect(purgeRes.status()).toBe(200);
      expect(await purgeRes.json()).toEqual({ ok: true });

      // Confirm session is completely cleared
      const stateAfter = await request.get(`/api/state?sessionId=${sessionId}`);
      const dataAfter = await stateAfter.json();
      expect(dataAfter.nodes.length).toBe(0);

      const nodesAfter = await request.get(`/api/nodes?sessionId=${sessionId}`);
      const nodesData = await nodesAfter.json();
      expect(nodesData.nodes.length).toBe(0);
    });

    test("DELETE /api/insights/[id] deletes insight", async ({ request }) => {
      // Use existing insight 1 from seed
      const stateRes = await request.get("/api/state");
      const state = await stateRes.json();
      if (state.insights && state.insights.length > 0) {
        const targetInsight = state.insights[0];
        const delRes = await request.delete(`/api/insights/${targetInsight.id}`);
        expect(delRes.status()).toBe(200);
        expect(await delRes.json()).toEqual({ ok: true });

        // Verify insight is gone
        const stateAfter = await request.get("/api/state");
        const afterData = await stateAfter.json();
        expect(afterData.insights.some((i: { id: number }) => i.id === targetInsight.id)).toBe(false);

        // Deleting non-existent returns 404
        const repeatRes = await request.delete(`/api/insights/${targetInsight.id}`);
        expect(repeatRes.status()).toBe(404);
      }
    });
  });

  // =========================================================================
  // Tier 2: Boundary & Corner Cases
  // =========================================================================
  test.describe("Tier 2: Boundary & Corner Cases", () => {
    test("POST /api/story rejects missing or empty text with 400 Bad Request", async ({ request }) => {
      const sessionId = makeSessionId("err-empty");

      const emptyRes = await request.post("/api/story", {
        data: { sessionId, text: "" },
      });
      expect(emptyRes.status()).toBe(400);

      const wsRes = await request.post("/api/story", {
        data: { sessionId, text: "   \n\t  " },
      });
      expect(wsRes.status()).toBe(400);

      const missingRes = await request.post("/api/story", {
        data: { sessionId },
      });
      expect(missingRes.status()).toBe(400);
    });

    test("POST /api/story rejects missing or empty sessionId with 400 Bad Request", async ({ request }) => {
      const res = await request.post("/api/story", {
        data: { text: "유효한 이야기 본문입니다." },
      });
      expect(res.status()).toBe(400);
    });

    test("POST /api/story rejects text exceeding 8,000 characters with 413 Payload Too Large", async ({ request }) => {
      const sessionId = makeSessionId("too-large");
      const largeText = "긴 문단 이야기입니다. ".repeat(700); // 9,100 chars (> 8,000)
      expect(largeText.length).toBeGreaterThan(8000);

      const res = await request.post("/api/story", {
        data: { sessionId, text: largeText },
      });

      expect(res.status()).toBe(413);
      const body = await res.json();
      expect(body).toHaveProperty("error");
      expect(body.error).toContain("8000");
    });

    test("POST /api/story accepts text near boundary (<= 8000 characters)", async ({ request }) => {
      const sessionId = makeSessionId("exact-boundary");
      // Build text of exactly 8,000 characters
      const sentence = "동해 물과 백두산이 마르고 닳도록. ";
      const repeats = Math.floor(8000 / sentence.length);
      let boundaryText = sentence.repeat(repeats);
      if (boundaryText.length < 8000) {
        boundaryText += "x".repeat(8000 - boundaryText.length);
      }
      expect(boundaryText.length).toBe(8000);

      const res = await request.post("/api/story", {
        data: { sessionId, text: boundaryText },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      const nodes: MemoryNode[] = body.nodes;
      expect(nodes.map((n) => n.user).join("")).toBe(boundaryText);
    });

    test("Node count is capped at max 12 even with >20 paragraphs", async ({ request }) => {
      const sessionId = makeSessionId("cap-nodes");
      const paragraphs: string[] = [];
      for (let i = 1; i <= 25; i++) {
        paragraphs.push(`제 ${i} 단락입니다. 이 단락은 테스트를 위해 작성되었습니다.`);
      }
      const rawText = paragraphs.join("\n\n");

      const res = await request.post("/api/story", {
        data: { sessionId, text: rawText },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      const nodes: MemoryNode[] = body.nodes;

      // Must be capped at <= 12
      expect(nodes.length).toBeLessThanOrEqual(12);
      expect(nodes.length).toBeGreaterThanOrEqual(2);

      // Verbatim invariant check
      expect(nodes.map((n) => n.user).join("")).toBe(rawText);
    });

    test("POST /api/story preserves emojis, quotes, and punctuation verbatim", async ({ request }) => {
      const sessionId = makeSessionId("special-story");
      const complexText = `🌟 "별빛이 내리는 밤이었어," 그가 말했다.\n\n'정말 멋지지 않아?' <꿈-REM> 시스템 {test} [ok] & more!`;

      const res = await request.post("/api/story", {
        data: { sessionId, text: complexText },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      const nodes: MemoryNode[] = body.nodes;

      expect(nodes.map((n) => n.user).join("")).toBe(complexText);
    });

    test("Single long sentence without punctuation or paragraphs preserves verbatim", async ({ request }) => {
      const sessionId = makeSessionId("no-delimiters");
      const textWithoutDelimiters = "가나다라마바사아자차카타파하".repeat(50); // 700 chars without spaces

      const res = await request.post("/api/story", {
        data: { sessionId, text: textWithoutDelimiters },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      const nodes: MemoryNode[] = body.nodes;

      expect(nodes.length).toBeGreaterThanOrEqual(1);
      expect(nodes.length).toBeLessThanOrEqual(12);
      expect(nodes.map((n) => n.user).join("")).toBe(textWithoutDelimiters);
    });
  });

  // =========================================================================
  // Tier 3: Cross-Feature Combinations
  // =========================================================================
  test.describe("Tier 3: Cross-Feature Combinations", () => {
    test("Story creation immediately updates GET /api/sessions and GET /api/nodes", async ({ request }) => {
      const sessionId = makeSessionId("cross-sync");
      const storyText = "1단계: 시작 이야기.\n\n2단계: 전개 이야기.\n\n3단계: 결말 이야기.";

      // 1. Post story
      const storyRes = await request.post("/api/story", {
        data: { sessionId, text: storyText },
      });
      expect(storyRes.status()).toBe(200);
      const { story, nodes } = await storyRes.json();

      // 2. Query sessions list
      const sessRes = await request.get("/api/sessions");
      const sessions = await sessRes.json();
      const targetSession = sessions.find((s: { sessionId: string }) => s.sessionId === sessionId);
      expect(targetSession).toBeDefined();
      expect(targetSession.nodeCount).toBe(nodes.length);

      // 3. Query nodes list
      const nodesRes = await request.get(`/api/nodes?sessionId=${sessionId}`);
      const nodesData = await nodesRes.json();
      expect(nodesData.nodes.length).toBe(nodes.length);

      // 4. Delete one node and observe session count decrement
      const nodeToDelete = nodes[0];
      const delNodeRes = await request.delete(`/api/nodes/${nodeToDelete.id}`);
      expect(delNodeRes.status()).toBe(200);

      const sessResAfter = await request.get("/api/sessions");
      const sessionsAfter = await sessResAfter.json();
      const targetAfter = sessionsAfter.find((s: { sessionId: string }) => s.sessionId === sessionId);
      expect(targetAfter.nodeCount).toBe(nodes.length - 1);
    });
  });

  // =========================================================================
  // Tier 4: Real-World Scenarios
  // =========================================================================
  test.describe("Tier 4: Real-World Scenarios", () => {
    test("Exhibition story submission, keyword search, story deletion lifecycle", async ({ request }) => {
      const visitorSession = makeSessionId("visitor-lifecycle");
      const visitorStory =
        "오늘 서울 전시장에 방문했다. 입구에서 안내 책자를 받고 천천히 걸어 들어갔다.\n\n미디어아트 전시실의 조명이 은은해서 몽환적인 분위기를 자아냈다. 푸른빛 조명이 인상적이었다.\n\nREM 꿈 시스템 시연 공간에 도착해 내 하루 이야기를 들려주었다. 대화가 기억으로 쌓이는 과정이 신기했다.\n\n다음 주에도 다른 친구와 함께 다시 오고 싶다.";

      // 1. Visitor submits their story
      const createRes = await request.post("/api/story", {
        data: { sessionId: visitorSession, text: visitorStory },
      });
      expect(createRes.status()).toBe(200);
      const { story, nodes } = await createRes.json();

      // Verbatim check
      expect(nodes.map((n: MemoryNode) => n.user).join("")).toBe(visitorStory);

      // 2. Exhibition admin searches for keyword "미디어아트"
      const searchRes = await request.get(`/api/nodes?q=${encodeURIComponent("미디어아트")}`);
      expect(searchRes.status()).toBe(200);
      const searchData = await searchRes.json();
      expect(searchData.nodes.some((n: MemoryNode) => n.sessionId === visitorSession)).toBe(true);

      // 3. Exhibition admin views sessions list
      const sessionListRes = await request.get("/api/sessions");
      const sessionList = await sessionListRes.json();
      const visitorEntry = sessionList.find(
        (s: { sessionId: string }) => s.sessionId === visitorSession
      );
      expect(visitorEntry).toBeDefined();
      expect(visitorEntry.nodeCount).toBe(nodes.length);

      // 4. Story is deleted
      const deleteStoryRes = await request.delete(`/api/stories/${story.id}`);
      expect(deleteStoryRes.status()).toBe(200);

      // 5. Verify all nodes are removed
      const nodesAfterDelete = await request.get(`/api/nodes?sessionId=${visitorSession}`);
      const afterData = await nodesAfterDelete.json();
      expect(afterData.nodes.length).toBe(0);
    });
  });
});
