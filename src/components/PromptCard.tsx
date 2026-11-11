"use client";

// 가져가는 작은 종이 카드 (A6, 105×148mm). 화면 미리보기와 인쇄에 같은 카드를 쓴다.
// 프롬프트 전문은 QR 안에 글자 그대로 들어 있어서, 휴대폰 카메라로 찍으면 인터넷 없이 바로 복사할 수 있다.
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { Profile } from "@/lib/types";
import { RELATIONS } from "@/lib/profile/build";
import styles from "./PromptCard.module.css";

const INK = "#2b2622";
const PAPER = "#faf9f5";

export default function PromptCard({ profile, id }: { profile: Profile; id?: string }) {
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    QRCode.toString(profile.prompt, { type: "svg", errorCorrectionLevel: "L", margin: 0, color: { dark: INK, light: PAPER } })
      .then((svg) => alive && setQr(svg))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [profile.prompt]);

  const rel = RELATIONS[profile.relation].label;
  const date = new Date(profile.createdAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });

  return (
    <article id={id} className={styles.card} aria-label="가져가는 프롬프트 카드">
      <header className={styles.top}>
        <svg className={styles.mark} viewBox="0 0 20 20" aria-hidden="true">
          <path d="M13.5 2.5a8 8 0 1 0 4 12.2A6.6 6.6 0 0 1 13.5 2.5Z" />
        </svg>
        <span>꿈(REM) 시스템</span>
        <span className={styles.date}>{date}</span>
      </header>

      <h2 className={styles.title}>
        나와 말이 잘 통하는
        <br />
        <em>{rel}</em> AI에게
      </h2>

      {profile.about && <p className={styles.about}>{profile.about}</p>}

      {profile.wiki.length > 0 && (
        <section className={styles.memo}>
          <h3>기억하고 있는 이야기</h3>
          <ul>
            {profile.wiki.slice(0, 4).map((w) => (
              <li key={w.id}>{w.title}</li>
            ))}
          </ul>
        </section>
      )}

      <footer className={styles.foot}>
        <div className={styles.qr} aria-label="프롬프트 전문이 담긴 QR 코드" role="img">
          {/* qrcode 라이브러리가 만든 SVG (사용자 글은 QR 무늬로만 들어간다) */}
          {qr ? <span dangerouslySetInnerHTML={{ __html: qr }} /> : <span className={styles.qrWait} />}
        </div>
        <p className={styles.how}>
          휴대폰 카메라로 찍으면 프롬프트 전문이 나와요.
          <br />
          제미나이 같은 <b>새 채팅 맨 앞</b>에 붙여 넣으면, 처음 만나도 나를 아는 {rel}처럼 말해요.
        </p>
      </footer>
    </article>
  );
}
