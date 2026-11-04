import { NextResponse } from "next/server";
import { updateStore } from "@/lib/store";
import { extractMeanings, splitWithModel } from "@/lib/story/preprocess";
import { pieceText, type MeaningDraft, type Piece } from "@/lib/story/groups";
import type { Meaning, MemoryNode, SplitMethod, Story } from "@/lib/types";

interface StoryRequestBody {
  sessionId?: unknown;
  text?: unknown;
}

export async function POST(req: Request) {
  // 1. Parse JSON body
  let body: StoryRequestBody;
  try {
    body = (await req.json()) as StoryRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Request body must be a valid JSON object" },
      { status: 400 }
    );
  }

  // 2. Validate sessionId
  if (typeof body.sessionId !== "string" || !body.sessionId.trim()) {
    return NextResponse.json(
      { error: "sessionId is required" },
      { status: 400 }
    );
  }
  const sessionId = body.sessionId.trim();

  // 3. Validate text
  if (typeof body.text !== "string" || !body.text.trim()) {
    return NextResponse.json(
      { error: "text is required and cannot be empty" },
      { status: 400 }
    );
  }
  const text = body.text;

  // 4. Validate length limit (8,000 chars)
  if (text.length > 8000) {
    return NextResponse.json(
      { error: "Payload exceeds 8000 character limit" },
      { status: 413 }
    );
  }

  // 5. 모델 호출은 updateStore 밖에서 한다 (callModel이 기록을 쓰려고 updateStore를 부른다 → 안에서 부르면 대기열이 막힘)
  let pieces: Piece[];
  let method: SplitMethod;
  let drafts: MeaningDraft[];
  try {
    ({ pieces, method } = await splitWithModel(text));
    drafts = await extractMeanings(text, pieces);
  } catch (err) {
    console.error("[/api/story] preprocess error:", err);
    return NextResponse.json({ error: "Failed to split story" }, { status: 500 });
  }

  // 6. 한 번의 updateStore로 이야기·노드·의미를 같이 저장
  try {
    const result = await updateStore((store) => {
      if (!store.stories) store.stories = [];
      if (!store.meanings) store.meanings = [];

      const storyId = store.stories.reduce((max, s) => Math.max(max, s.id), 0) + 1;
      let nextNodeId = store.nodes.reduce((max, n) => Math.max(max, n.id), 0) + 1;
      let nextOrder =
        store.nodes.filter((n) => n.sessionId === sessionId).reduce((max, n) => Math.max(max, n.order), 0) + 1;
      const now = new Date().toISOString();

      const createdNodes: MemoryNode[] = pieces.map((piece) => ({
        id: nextNodeId++,
        sessionId,
        order: nextOrder++,
        createdAt: now,
        user: pieceText(text, piece),
        ai: piece.reply ?? "이야기 잘 들었어요.",
        storyId,
        storySpans: piece.spans,
        topic: piece.topic,
      }));
      store.nodes.push(...createdNodes);

      const story: Story = {
        id: storyId,
        sessionId,
        rawText: text,
        nodeIds: createdNodes.map((n) => n.id),
        createdAt: now,
      };
      store.stories.push(story);

      let nextMeaningId = store.meanings.reduce((max, m) => Math.max(max, m.id), 0) + 1;
      const createdMeanings: Meaning[] = drafts.map((d) => ({
        id: nextMeaningId++,
        storyId,
        sessionId,
        nodeIds: d.pieceIndexes.map((i) => createdNodes[i].id),
        title: d.title,
        essence: d.essence,
        keywords: d.keywords,
        createdAt: now,
      }));
      store.meanings.push(...createdMeanings);

      return { story, nodes: createdNodes, meanings: createdMeanings, method };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[/api/story] Persistence error:", err);
    return NextResponse.json({ error: "Failed to persist story" }, { status: 500 });
  }
}
