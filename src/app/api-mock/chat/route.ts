import { NextResponse } from "next/server";
import type { MemoryNode } from "@/lib/types";
import { mockReply, nextNodeId, nextOrder, withStore } from "../_lib/mockStore";

// POST /api-mock/chat  { sessionId, message } → { node }   (명세: docs/backend-plan.md 5절)
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { sessionId?: string; message?: string } | null;
  const sessionId = body?.sessionId?.trim();
  const message = body?.message?.trim();
  if (!sessionId || !message) return NextResponse.json({ error: "sessionId와 message가 필요해요." }, { status: 400 });
  if (message.length > 2000) return NextResponse.json({ error: "메시지는 2,000자까지 보낼 수 있어요." }, { status: 413 });

  // 모델 대신 잠깐 기다렸다가 가짜 답을 준다 (화면의 '생각 중' 상태를 보려고)
  await new Promise((r) => setTimeout(r, 600));

  const node = await withStore((s) => {
    const n: MemoryNode = {
      id: nextNodeId(s),
      sessionId,
      order: nextOrder(s, sessionId),
      createdAt: new Date().toISOString(),
      user: message,
      ai: mockReply(message),
    };
    s.nodes.push(n);
    return n;
  }, true);

  return NextResponse.json({ node });
}
