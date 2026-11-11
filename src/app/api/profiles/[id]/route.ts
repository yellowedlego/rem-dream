import { NextResponse } from "next/server";
import { updateStore } from "@/lib/store";

/** 프로필 하나와 그 메일 기록을 지운다 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid profile ID" }, { status: 400 });
  const found = await updateStore((s) => {
    const before = (s.profiles ?? []).length;
    s.profiles = (s.profiles ?? []).filter((p) => p.id !== id);
    s.mails = (s.mails ?? []).filter((m) => m.profileId !== id);
    return s.profiles.length !== before;
  });
  if (!found) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
