import type { Metadata } from "next";
import { IBM_Plex_Sans_KR, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// 한글 글꼴은 글자가 많아 미리 불러오기(preload)를 끈다
const sans = IBM_Plex_Sans_KR({
  variable: "--font-sans",
  weight: ["400", "500", "600"],
  preload: false,
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "꿈 시스템",
  description: "기억을 쌓고, 잠들고, 깨어나서 달라지는 AI",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
