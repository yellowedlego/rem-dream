import { NextResponse } from "next/server";
import { resetSchoolAi } from "@/lib/school/rem";

export async function DELETE() {
  try {
    await resetSchoolAi();
    return NextResponse.json({ ok: true, message: "School AI reset successfully" }, { status: 200 });
  } catch (caught) {
    const err = caught as { message?: string; name?: string };
    return NextResponse.json({ error: err.message || "Failed to reset school AI" }, { status: 500 });
  }
}
