import { Suspense } from "react";
import AdminLogin from "@/components/AdminLogin";

export const metadata = { title: "꿈 시스템 · 운영자 로그인" };

export default function LoginPage() {
  return (
    <Suspense>
      <AdminLogin />
    </Suspense>
  );
}
