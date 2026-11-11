import { NextResponse } from "next/server";
import { updateStore } from "@/lib/store";

/** 메일 보낸 기록(가린 주소)만 모두 지운다 */
export async function DELETE() {
  await updateStore((s) => {
    s.mails = [];
  });
  return NextResponse.json({ ok: true });
}
