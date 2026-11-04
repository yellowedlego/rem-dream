import DebugConsole from "@/components/DebugConsole";

export const metadata = { title: "꿈 시스템 · 디버그" };

// 디버그 화면. 데이터는 API(NEXT_PUBLIC_API_BASE, 기본 /api)로만 읽고 지운다.
export default function DebugPage() {
  return <DebugConsole />;
}
