import { NextResponse } from "next/server";
import { runSchoolRem } from "@/lib/school/rem";

export async function POST() {
  try {
    const result = await runSchoolRem("manual");
    return NextResponse.json(result, { status: 200 });
  } catch (caught) {
    const err = caught as { message?: string; name?: string };
    const status = err.message?.includes("부족해요") ? 422 : 500;
    return NextResponse.json({ error: err.message || "Failed to run school REM" }, { status });
  }
}
