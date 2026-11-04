import { NextResponse } from "next/server";
import { connection } from "next/server";
import { withStore } from "../_lib/mockStore";

// GET /api-mock/sessions → { sessions: [{ sessionId, nodeCount, lastAt, preview }] }  (최근 순)
export async function GET() {
  await connection();
  const sessions = await withStore((s) => {
    const by = new Map<string, { sessionId: string; nodeCount: number; lastAt: string; preview: string }>();
    for (const n of [...s.nodes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      const cur = by.get(n.sessionId);
      if (cur) {
        cur.nodeCount += 1;
        cur.lastAt = n.createdAt;
      } else {
        by.set(n.sessionId, {
          sessionId: n.sessionId,
          nodeCount: 1,
          lastAt: n.createdAt,
          preview: n.user.trim().slice(0, 40),
        });
      }
    }
    return [...by.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  });
  return NextResponse.json({ sessions });
}
