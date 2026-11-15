import { NextResponse } from "next/server";
import { loadAllReplays } from "@/lib/rem/replay";

export async function GET() {
  const replays = await loadAllReplays();
  return NextResponse.json(replays, { status: 200 });
}
