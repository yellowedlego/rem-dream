"use client";

// 관리자 로그인. 비밀번호는 서버로만 보내고, 이 화면은 어디에도 저장하지 않는다(localStorage·주소창 X).
// 성공하면 서버가 HttpOnly 쿠키를 심어 주므로 이 코드는 토큰을 볼 수 없다.
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "./api";
import styles from "./AdminLogin.module.css";

/** 돌아갈 곳은 이 사이트 안의 관리 화면만 (다른 사이트로 튕기는 주소 막기) */
function safeNext(raw: string | null): string {
  return raw && /^\/(admin|debug)(\/|$|\?)/.test(raw) ? raw : "/admin";
}

export default function AdminLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.adminLogin(username, password);
      setPassword("");
      router.replace(safeNext(params.get("next")));
    } catch (err) {
      setPassword("");
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={styles.shell}>
      <form className={styles.card} onSubmit={submit} autoComplete="off">
        <h1>운영자 로그인</h1>
        <p className={styles.help}>기록 관리·디버그 화면은 운영하는 사람만 볼 수 있어요.</p>
        <label>
          <span>아이디</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </label>
        <label>
          <span>비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            autoFocus
          />
        </label>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy || !password}>
          {busy ? "확인하는 중…" : "들어가기"}
        </button>
      </form>
    </main>
  );
}
