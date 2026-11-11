import { NextResponse } from "next/server";
import { updateStore } from "@/lib/store";
import { deleteImages } from "@/lib/uploads";
import { removeSession, sessionLastAt } from "@/lib/records";

/** 마지막 기록이 N시간보다 오래된 세션을 통째로 지운다: { olderThanHours } (0이면 전부) */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { olderThanHours?: unknown } | null;
  const hours = body?.olderThanHours;
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours < 0) {
    return NextResponse.json({ error: "olderThanHours must be a number ≥ 0" }, { status: 400 });
  }
  const cutoff = Date.now() - hours * 3600_000;
  const { removed, imageIds } = await updateStore((store) => {
    const old = [...sessionLastAt(store).entries()].filter(([, at]) => Date.parse(at) <= cutoff).map(([sid]) => sid);
    return { removed: old, imageIds: old.flatMap((sid) => removeSession(store, sid)) };
  });
  await deleteImages(imageIds);
  return NextResponse.json({ ok: true, removed });
}
