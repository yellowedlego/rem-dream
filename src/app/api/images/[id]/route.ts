import { NextResponse } from "next/server";
import { isImageId, mimeOfId, readImage } from "@/lib/uploads";

/** 첨부 이미지 한 장을 돌려준다. id는 "<uuid>.<확장자>" 모양만 받는다 (그 밖의 모양은 404) */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isImageId(id)) return NextResponse.json({ error: "Image not found" }, { status: 404 });
  const file = await readImage(id);
  if (!file) return NextResponse.json({ error: "Image not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(file), {
    status: 200,
    headers: {
      "Content-Type": mimeOfId(id),
      // 파일 이름이 곧 번호(uuid)라 내용이 바뀌지 않는다
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
