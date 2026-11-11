"use client";

// 말로 입력하기 (브라우저 음성 인식). 크롬·엣지에서만 되고, 인식은 브라우저 회사 서버를 거쳐서 인터넷이 필요하다.
// 마이크 권한은 localhost나 https 주소에서만 받을 수 있다 (http://192.168.x.x 같은 주소로 접속하면 막힌다).
import { useEffect, useRef, useState } from "react";

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  "not-allowed": "마이크 권한이 막혀 있어요. 주소창 왼쪽에서 마이크를 허용해 주세요.",
  "service-not-allowed": "이 주소에서는 마이크를 쓸 수 없어요 (localhost나 https에서만 돼요).",
  network: "음성 인식 서버에 닿지 못했어요. 인터넷 연결을 확인해 주세요.",
  "no-speech": "말소리가 들리지 않았어요.",
  "audio-capture": "마이크를 찾지 못했어요.",
};

export default function MicButton({
  className,
  disabled,
  onStart,
  onText,
  onError,
}: {
  className?: string;
  disabled?: boolean;
  /** 듣기 시작할 때 (지금 입력칸 글을 기억해 두고 그 뒤에 이어 붙이려고) */
  onStart?: () => void;
  /** 듣는 동안 계속 불린다: 확정된 글과 아직 듣는 중인 글 */
  onText: (finalText: string, interim: string) => void;
  onError?: (message: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<Recognition | null>(null);

  useEffect(() => {
    queueMicrotask(() => setSupported(!!recognitionCtor())); // 브라우저 기능은 마운트 뒤에만 안다
    return () => recRef.current?.stop();
  }, []);

  if (!supported) return null;

  const toggle = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "ko-KR";
    rec.interimResults = true;
    rec.continuous = false;
    let done = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) done += r[0].transcript;
        else interim += r[0].transcript;
      }
      onText(done, interim);
    };
    rec.onerror = (e) => {
      if (e.error !== "aborted") onError?.(ERRORS[e.error] ?? `음성 인식이 멈췄어요 (${e.error}).`);
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
    };
    recRef.current = rec;
    try {
      onStart?.();
      rec.start();
      setListening(true);
    } catch {
      onError?.("음성 인식을 시작하지 못했어요.");
    }
  };

  return (
    <button
      type="button"
      className={className}
      aria-label={listening ? "말하기 멈추기" : "말로 입력하기"}
      aria-pressed={listening}
      data-listening={listening ? "" : undefined}
      title={listening ? "듣는 중… 누르면 멈춰요" : "말로 입력하기 (크롬·엣지)"}
      disabled={disabled}
      onClick={toggle}
    >
      <svg width="14" height="18" viewBox="0 0 14 18" aria-hidden="true">
        <rect x="4" y="1" width="6" height="10" rx="3" fill="currentColor" />
        <path d="M1.5 8.5a5.5 5.5 0 0 0 11 0M7 14v3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}
