import { NextResponse } from "next/server";
import { resetToSeed } from "../../_lib/mockStore";

// POST /api-mock/debug/reset-all — 전체 초기화(시드로 되돌림)
export async function POST() {
  await resetToSeed();
  return NextResponse.json({ ok: true });
}
