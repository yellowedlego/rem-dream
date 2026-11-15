import { NextResponse } from "next/server";
import { getSchoolPool, addMeaningToSchoolPool } from "@/lib/school/pool";
import type { Meaning } from "@/lib/types";

export async function GET() {
  const pool = await getSchoolPool();
  // Ensure both standard SchoolMeaning fields and test compatibility fields (key, meaning) are present
  const result = pool.map((m: any) => ({
    ...m,
    key: m.key || m.title,
    meaning: m.meaning || m.essence,
  }));
  return NextResponse.json(result, { status: 200 });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const key = typeof body.key === "string" ? body.key : `key_${Date.now()}`;
    const title = typeof body.title === "string" ? body.title : key;
    const essence =
      typeof body.essence === "string"
        ? body.essence
        : typeof body.meaning === "string"
        ? body.meaning
        : "기본 학교 이야기 내용입니다.";
    const keywords = Array.isArray(body.keywords) ? body.keywords : [key];

    const dummyMeaning: Meaning = {
      id: Date.now(),
      storyId: 0,
      sessionId: "anonymous",
      nodeIds: [],
      title,
      essence,
      keywords,
      createdAt: new Date().toISOString(),
    };

    const added = await addMeaningToSchoolPool(dummyMeaning, "api_direct");
    if (added) {
      (added as any).key = key;
      (added as any).meaning = essence;
    }

    return NextResponse.json(
      { ok: true, item: added, key, meaning: essence },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json({ error: "Failed to store meaning" }, { status: 500 });
  }
}
