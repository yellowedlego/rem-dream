import { NextResponse } from "next/server";
import { revertSchoolPersona } from "@/lib/school/rem";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const version = typeof body?.version === "number" ? body.version : undefined;
    const result = await revertSchoolPersona(version);
    return NextResponse.json({ ok: true, version: result.version }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to revert school persona" }, { status: 500 });
  }
}
