import { NextResponse } from "next/server";
import { updateStore } from "@/lib/store";
import { splitStory, PayloadTooLargeError } from "@/lib/story/split";
import type { MemoryNode, Story } from "@/lib/types";

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

  // 5. Split story into spans
  let splitResult;
  try {
    splitResult = await splitStory(text);
  } catch (err) {
    if (err instanceof PayloadTooLargeError || (err as { status?: number })?.status === 413) {
      return NextResponse.json(
        { error: "Payload exceeds 8000 character limit" },
        { status: 413 }
      );
    }
    console.error("[/api/story] splitStory error:", err);
    return NextResponse.json(
      { error: "Failed to split story" },
      { status: 500 }
    );
  }

  const { spans } = splitResult;

  // 6. Atomically persist Story and MemoryNodes in runtime store
  try {
    const result = await updateStore((store) => {
      if (!store.stories) {
        store.stories = [];
      }

      const maxStoryId = store.stories.reduce((max, s) => Math.max(max, s.id), 0);
      const storyId = maxStoryId + 1;

      let nextNodeId = store.nodes.reduce((max, n) => Math.max(max, n.id), 0) + 1;
      const sessionNodes = store.nodes.filter((n) => n.sessionId === sessionId);
      let nextOrder = sessionNodes.reduce((max, n) => Math.max(max, n.order), 0) + 1;

      const now = new Date().toISOString();
      const createdNodes: MemoryNode[] = [];

      for (const span of spans) {
        const userSlice = text.slice(span.start, span.end);
        const node: MemoryNode = {
          id: nextNodeId++,
          sessionId,
          order: nextOrder++,
          createdAt: now,
          user: userSlice,
          ai: "이야기 잘 들었어요.",
          storyId,
          storySpan: [span.start, span.end],
          topic: span.topic,
        };
        store.nodes.push(node);
        createdNodes.push(node);
      }

      const story: Story = {
        id: storyId,
        sessionId,
        rawText: text,
        nodeIds: createdNodes.map((n) => n.id),
        createdAt: now,
      };

      store.stories.push(story);

      return {
        story,
        nodes: createdNodes,
      };
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[/api/story] Persistence error:", err);
    return NextResponse.json(
      { error: "Failed to persist story" },
      { status: 500 }
    );
  }
}
