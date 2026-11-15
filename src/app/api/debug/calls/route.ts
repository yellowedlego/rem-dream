import { connection, NextResponse } from "next/server";
import { readStore } from "@/lib/store";

export async function GET() {
  await connection();
  const store = await readStore();
  const calls = (store.calls ?? []).slice(-200);
  return NextResponse.json(calls, { status: 200 });
}
