import { NextResponse } from "next/server";
import type { MemoryNode, Story } from "@/lib/types";
import {
  coversExactly,
  mockReply,
  nextNodeId,
  nextOrder,
  nextStoryId,
  splitStory,
  withStore,
} from "../_lib/mockStore";

const MAX_CHARS = 8000;

// POST /api-mock/story  { sessionId, text } → { story, nodes }
// 긴 이야기를 맥락 단위로 쪼개 노드 여러 개로 저장한다. 원문은 한 글자도 바꾸지 않는다.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { sessionId?: string; text?: string } | null;
  const sessionId = body?.sessionId?.trim();
  const text = body?.text;
  if (!sessionId || !text?.trim()) return NextResponse.json({ error: "sessionId와 text가 필요해요." }, { status: 400 });
  if (text.length > MAX_CHARS)
    return NextResponse.json({ error: `이야기는 ${MAX_CHARS.toLocaleString()}자까지 넣을 수 있어요.` }, { status: 413 });

  const pieces = splitStory(text);
  if (!coversExactly(text, pieces))
    return NextResponse.json({ error: "원문을 빠짐없이 나누지 못했어요." }, { status: 500 });

  await new Promise((r) => setTimeout(r, 800));

  const result = await withStore((s) => {
    const storyId = nextStoryId(s);
    let id = nextNodeId(s);
    let order = nextOrder(s, sessionId);
    const now = Date.now();
    const nodes: MemoryNode[] = pieces.map((p, i) => {
      // 원문 조각 그대로 (공백 포함). 같은 주제의 떨어진 구간이 여럿이면 줄바꿈 하나로만 이어 붙인다.
      const piece = p.spans.map(([s, e]) => text.slice(s, e)).join("\n");
      return {
        id: id++,
        sessionId,
        order: order++,
        createdAt: new Date(now + i).toISOString(),
        user: piece,
        ai: mockReply(piece.trim()),
        storyId,
        storySpans: p.spans,
        topic: p.topic,
      };
    });
    const story: Story = {
      id: storyId,
      sessionId,
      rawText: text,
      nodeIds: nodes.map((n) => n.id),
      createdAt: new Date(now).toISOString(),
    };
    s.nodes.push(...nodes);
    (s.stories ??= []).push(story);
    return { story, nodes };
  }, true);

  return NextResponse.json(result);
}
