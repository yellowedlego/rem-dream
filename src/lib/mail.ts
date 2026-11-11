import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getStorePaths } from "@/lib/store";
import { RELATIONS } from "@/lib/profile/build";
import type { Profile } from "@/lib/types";

// 메일 보내기. 설정은 .env.local에만 둔다 (키·비밀번호를 코드나 채팅에 넣지 않는다):
//   SMTP_HOST, SMTP_PORT(기본 465), SMTP_USER, SMTP_PASS, MAIL_FROM(없으면 SMTP_USER)
// MAIL_MOCK=1이면 실제로 보내지 않고 <실행 폴더>/outbox/에 파일로 남긴다 (테스트·연습용).
// 받는 주소는 저장하지 않는다. 보낸 기록(MailLog)에는 가린 주소만 남는다.

export function mailStatus(): { ready: boolean; mock: boolean } {
  const mock = process.env.MAIL_MOCK === "1" || process.env.MAIL_MOCK === "true";
  const ready = mock || !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  return { ready, mock };
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function mailContent(profile: Profile): { subject: string; text: string; html: string } {
  const rel = RELATIONS[profile.relation].label;
  const subject = `꿈 시스템 · 나와 말이 잘 통하는 ${rel} AI 프롬프트`;
  const text = `새 채팅을 열 때마다 아래 글을 맨 앞에 붙여 넣으세요.\n\n${profile.prompt}\n\n— 꿈(REM) 시스템 전시에서 보냄`;
  const serif = `'Noto Serif KR','Nanum Myeongjo','AppleMyungjo',Batang,Georgia,serif`;
  const wiki = profile.wiki
    .slice(0, 4)
    .map((w) => `<li style="margin:0 0 6px">${esc(w.title)}</li>`)
    .join("");
  const html = `<!doctype html><html lang="ko"><body style="margin:0;background:#f0eee6;padding:24px 12px;font-family:${serif};color:#2b2622">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#faf9f5;border:1px solid #e3ddd0;border-radius:14px">
<tr><td style="padding:32px 32px 8px">
<p style="margin:0 0 6px;font-size:13px;letter-spacing:.08em;color:#b0623f">꿈(REM) 시스템</p>
<h1 style="margin:0 0 14px;font-size:24px;line-height:1.35;font-weight:600">나와 말이 잘 통하는<br>${esc(rel)} AI에게</h1>
<p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#57504a">${esc(profile.about)}</p>
${wiki ? `<p style="margin:0 0 6px;font-size:13px;color:#8a8076">기억하고 있는 이야기</p><ul style="margin:0 0 20px;padding-left:18px;font-size:15px;line-height:1.6">${wiki}</ul>` : ""}
<p style="margin:0 0 8px;font-size:13px;color:#8a8076">제미나이 같은 새 채팅을 열 때마다 아래 글을 맨 앞에 붙여 넣으세요.</p>
</td></tr>
<tr><td style="padding:0 32px 28px">
<div style="background:#f3efe4;border-left:3px solid #d97757;border-radius:6px;padding:16px 18px;font-size:14px;line-height:1.75;white-space:pre-wrap;color:#2b2622">${esc(profile.prompt)}</div>
</td></tr>
<tr><td style="padding:0 32px 28px;font-size:12px;color:#a39a90">전시장에서 요청해서 보낸 메일이에요. 받는 주소는 저장하지 않았어요.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}

export async function sendMail(to: string, profile: Profile): Promise<void> {
  const { subject, text, html } = mailContent(profile);
  const { mock } = mailStatus();
  if (mock) {
    const dir = path.join(getStorePaths().runtimeDir, "outbox");
    await fs.mkdir(dir, { recursive: true });
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
    await fs.writeFile(path.join(dir, name), JSON.stringify({ to, subject, text, html }, null, 2), "utf8");
    return;
  }
  const { createTransport } = await import("nodemailer");
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 15000,
  });
  await transport.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}
