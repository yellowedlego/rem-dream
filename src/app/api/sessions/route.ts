import { connection, NextResponse } from "next/server";
import { readStore } from "@/lib/store";
import type { MemoryNode } from "@/lib/types";

export interface SessionSummary {
  sessionId: string;
  nodeCount: number;
  lastAt: string;
  preview: string;
}

export async function GET() {
  await connection();

  const store = await readStore();

  const sessionNodesMap = new Map<string, MemoryNode[]>();

  // Collect nodes by sessionId
  for (const node of store.nodes) {
    if (!node.sessionId) continue;
    let list = sessionNodesMap.get(node.sessionId);
    if (!list) {
      list = [];
      sessionNodesMap.set(node.sessionId, list);
    }
    list.push(node);
  }

  // Include any sessions present only in stories
  if (Array.isArray(store.stories)) {
    for (const story of store.stories) {
      if (!story.sessionId) continue;
      if (!sessionNodesMap.has(story.sessionId)) {
        sessionNodesMap.set(story.sessionId, []);
      }
    }
  }

  const sessions: SessionSummary[] = [];

  for (const [sessionId, nodes] of sessionNodesMap.entries()) {
    // Sort nodes by order / createdAt
    nodes.sort((a, b) => a.order - b.order || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const lastNode = nodes.length > 0 ? nodes[nodes.length - 1] : null;

    let lastAt = lastNode ? lastNode.createdAt : "";
    if (!lastAt && Array.isArray(store.stories)) {
      const sessionStories = store.stories.filter((s) => s.sessionId === sessionId);
      if (sessionStories.length > 0) {
        lastAt = sessionStories[sessionStories.length - 1].createdAt;
      }
    }

    const preview = lastNode
      ? lastNode.user.length > 60
        ? lastNode.user.slice(0, 57) + "..."
        : lastNode.user
      : "";

    sessions.push({
      sessionId,
      nodeCount: nodes.length,
      lastAt,
      preview,
    });
  }

  // Sort sessions: most recently updated first
  sessions.sort((a, b) => {
    const timeA = a.lastAt ? new Date(a.lastAt).getTime() : 0;
    const timeB = b.lastAt ? new Date(b.lastAt).getTime() : 0;
    return timeB - timeA;
  });

  return NextResponse.json(sessions, { status: 200 });
}
