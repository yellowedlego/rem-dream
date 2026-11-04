import { NextResponse } from "next/server";
import { resetStore } from "@/lib/store";

/** 전체 초기화 (디버그용): 실행용 저장소를 시드(data/store.json)로 되돌린다. */
export async function POST() {
  await resetStore();
  return NextResponse.json({ ok: true }, { status: 200 });
}
