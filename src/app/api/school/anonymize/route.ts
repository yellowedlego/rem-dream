import { NextResponse } from "next/server";
import { anonymizeText } from "@/lib/school/anonymize";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = typeof body?.text === "string" ? body.text : "";
    const anonymized = anonymizeText(text);
    return NextResponse.json({ anonymized }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}
