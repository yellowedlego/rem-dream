import { NextResponse } from "next/server";
import { resetStore } from "@/lib/store";
import { clearUploads } from "@/lib/uploads";

/** 전체 초기화 (디버그용): 실행용 저장소를 시드(data/store.json)로 되돌린다. */
export async function POST() {
  await resetStore();
  await clearUploads(); // 첨부 이미지 파일도 모두 지운다
  return NextResponse.json({ ok: true }, { status: 200 });
}
