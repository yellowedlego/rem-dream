import { connection, NextResponse } from "next/server";
import { readStore } from "@/lib/store";

export async function GET(req: Request) {
  await connection();

  const { searchParams } = new URL(req.url);
  const rawSessionId = searchParams.get("sessionId");
  const sessionId = rawSessionId?.trim() || null;

  const rawQ = searchParams.get("q");
  const q = rawQ?.trim().toLowerCase() || null;

  const rawLimit = searchParams.get("limit");
  let limit = 50;
  if (rawLimit !== null) {
    const parsed = parseInt(rawLimit, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      limit = Math.min(parsed, 500);
    }
  }

  const store = await readStore();
  let nodes = store.nodes;

  // Filter by sessionId if provided
  if (sessionId) {
    nodes = nodes.filter((n) => n.sessionId === sessionId);
  }

  // Filter by query substring across sessionId, user, ai, topic
  if (q) {
    nodes = nodes.filter((n) => {
      const matchSession = n.sessionId.toLowerCase().includes(q);
      const matchUser = n.user.toLowerCase().includes(q);
      const matchAi = n.ai.toLowerCase().includes(q);
      const matchTopic = n.topic ? n.topic.toLowerCase().includes(q) : false;
      return matchSession || matchUser || matchAi || matchTopic;
    });
  }

  const paginatedNodes = nodes.slice(0, limit);

  return NextResponse.json({ nodes: paginatedNodes }, { status: 200 });
}
