import { NextResponse } from "next/server";
import { readStore, updateStore } from "@/lib/store";
import { mailStatus, sendMail } from "@/lib/mail";
import { isEmail, maskEmail } from "@/lib/profile/build";

/** 프로필 하나로 보낼 수 있는 메일 수 (전시장 장난 방지) */
const MAILS_PER_PROFILE = 3;

/** 사전 프롬프트를 메일로 보낸다: { to, consent: true }. 주소는 저장하지 않고 가린 주소만 기록한다 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  const body = (await req.json().catch(() => null)) as { to?: unknown; consent?: unknown } | null;
  const to = typeof body?.to === "string" ? body.to.trim() : "";
  if (!isEmail(to)) return NextResponse.json({ error: "메일 주소 모양을 확인해 주세요." }, { status: 400 });
  if (body?.consent !== true) {
    return NextResponse.json({ error: "보내기 전에 안내에 동의해 주세요." }, { status: 400 });
  }
  if (!mailStatus().ready) {
    return NextResponse.json({ error: "이 컴퓨터는 메일 보내기가 설정되지 않았어요." }, { status: 503 });
  }

  const store = await readStore();
  const profile = (store.profiles ?? []).find((p) => p.id === id);
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  if ((store.mails ?? []).filter((m) => m.profileId === id).length >= MAILS_PER_PROFILE) {
    return NextResponse.json({ error: `한 프롬프트는 ${MAILS_PER_PROFILE}번까지 보낼 수 있어요.` }, { status: 429 });
  }

  try {
    await sendMail(to, profile);
  } catch (err) {
    console.error("[/api/profiles/mail] send failure:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "메일을 보내지 못했어요. 인터넷 연결이나 메일 설정을 확인해 주세요." },
      { status: 502 },
    );
  }
  const masked = maskEmail(to);
  await updateStore((s) => {
    if (!s.mails) s.mails = [];
    s.mails.push({
      id: s.mails.reduce((m, x) => Math.max(m, x.id), 0) + 1,
      at: new Date().toISOString(),
      sessionId: profile.sessionId,
      profileId: id,
      to: masked,
    });
  });
  return NextResponse.json({ ok: true, to: masked });
}
