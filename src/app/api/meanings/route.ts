import { connection } from "next/server";
import { NextResponse } from "next/server";
import { readStore } from "@/lib/store";

export async function GET(req: Request) {
  await connection();
  const sessionId = new URL(req.url).searchParams.get("sessionId")?.trim() || null;
  const store = await readStore();
  const all = store.meanings ?? [];
  const meanings = sessionId ? all.filter((m) => m.sessionId === sessionId) : all;
  return NextResponse.json({ meanings }, { status: 200 });
}
