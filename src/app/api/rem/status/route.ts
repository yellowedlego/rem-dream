import { connection, NextResponse } from "next/server";
import { readStore } from "@/lib/store";

export async function GET(req: Request) {
  await connection();
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get("runId");

  if (!runId || !runId.trim()) {
    return NextResponse.json(
      { error: "runId parameter is required" },
      { status: 400 }
    );
  }

  const store = await readStore();
  const run = store.runs?.find((r) => r.id === runId.trim());

  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json(run, { status: 200 });
}
