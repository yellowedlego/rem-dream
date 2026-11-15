import { NextResponse } from "next/server";
import { readStore } from "@/lib/store";
import { getSchoolPool } from "@/lib/school/pool";

export async function GET() {
  const store = await readStore();
  const pool = await getSchoolPool();

  const activeVersionNum = store.activePersonas?.["school"] ?? 1;
  const schoolPersona =
    store.personas.find((p) => p.scope === "school" && p.version === activeVersionNum) ||
    store.personas.find((p) => p.scope === "school") ||
    store.personas[0];

  const recentRuns = (store.runs || [])
    .filter((r) => r.scope === "school")
    .slice(-10);

  return NextResponse.json(
    {
      activePersona: schoolPersona,
      version: activeVersionNum,
      style: schoolPersona?.style || { warmth: 0.5, empathy: 0.5, brevity: 0.5, curiosity: 0.5 },
      notes: schoolPersona?.notes || [],
      poolCount: pool.length,
      meanings: pool,
      recentRuns,
    },
    { status: 200 }
  );
}
