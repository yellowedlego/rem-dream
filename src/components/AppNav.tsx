"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./AppNav.module.css";

const LINKS = [
  { href: "/", label: "전시" },
  { href: "/chat", label: "대화" },
  { href: "/story", label: "이야기" },
  { href: "/me", label: "내 AI" },
  { href: "/debug", label: "디버그" },
  { href: "/admin", label: "기록 관리" },
];

export default function AppNav() {
  const path = usePathname();
  return (
    <nav className={styles.nav} aria-label="화면 이동">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
