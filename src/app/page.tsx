import { Suspense } from "react";
import { connection } from "next/server";
import Exhibit from "@/components/Exhibit";
import { readStore } from "@/lib/store";

// 전시 화면. 저장소(data/store.json)를 요청마다 읽기만 한다.
async function ExhibitData() {
  await connection();
  const store = await readStore();
  return <Exhibit nodes={store.nodes} personaVersion={store.activePersona} />;
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <ExhibitData />
    </Suspense>
  );
}
