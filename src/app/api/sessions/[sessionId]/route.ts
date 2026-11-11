import { NextResponse } from "next/server";
import { updateStore } from "@/lib/store";
import { deleteImages } from "@/lib/uploads";
import { removeSession } from "@/lib/records";

/** 세션 하나의 기록을 모두 지운다: 노드·이야기·의미·"내 AI" 프로필·메일 기록·통찰·REM 기록, 사진 파일 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  if (!sessionId || !sessionId.trim()) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }
  const imageIds = await updateStore((store) => removeSession(store, sessionId.trim()));
  await deleteImages(imageIds);
  return NextResponse.json({ ok: true }, { status: 200 });
}
