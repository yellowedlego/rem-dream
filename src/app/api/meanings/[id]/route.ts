import { NextResponse } from "next/server";
import { updateStore } from "@/lib/store";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const numId = parseInt(id, 10);

  if (Number.isNaN(numId)) {
    return NextResponse.json({ error: "Invalid meaning ID" }, { status: 400 });
  }

  const found = await updateStore((store) => {
    const before = store.meanings?.length ?? 0;
    store.meanings = (store.meanings ?? []).filter((m) => m.id !== numId);
    return store.meanings.length < before;
  });

  if (!found) {
    return NextResponse.json({ error: "Meaning not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true }, { status: 200 });
}
