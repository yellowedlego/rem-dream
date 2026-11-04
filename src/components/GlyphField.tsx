"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * 오른쪽 평면 위에 마우스를 올리면, 커서 주변에만 아스키 글자가 흐리게 번지고
 * 2차원 평면(격자 + 십자축 + 좌표)이 살짝 비친다. 마우스를 떼면 서서히 사라진다.
 * 움직임은 마우스가 움직이거나 사라지는 동안에만 그린다(그 밖에는 멈춤).
 */

const CELL_W = 14;
const CELL_H = 20;
const GRID = 80; // 평면 격자 간격(정사각)
const RADIUS = 200; // 번지는 반경
const GLYPHS = ".:·+*/\\|-01x=";

function hash(c: number, r: number) {
  let h = (Math.imul(c, 374761393) + Math.imul(r, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export default function GlyphField({ host }: { host: RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const hostEl = host.current;
    const plane = canvas?.parentElement;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !hostEl || !plane || !ctx) return;

    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cs = getComputedStyle(plane);
    const glyph = rgb(cs.getPropertyValue("--point").trim() || "#b9a3f5");
    const line = rgb(cs.getPropertyValue("--accent").trim() || "#efdfa6");
    const css = ([r, g, b]: number[], a: number) => `rgba(${r},${g},${b},${a})`;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    const st = { tx: 0, ty: 0, x: 0, y: 0, target: 0, k: 0 };

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const k = st.k;
      if (k < 0.01) return;
      const { x, y } = st;

      // 평면: 격자선 (커서에서 멀어지며 옅어지는 방사형 그라데이션으로 긋는다)
      const fade = ctx.createRadialGradient(x, y, 0, x, y, RADIUS);
      fade.addColorStop(0, css(line, 0.3 * k));
      fade.addColorStop(1, css(line, 0));
      ctx.strokeStyle = fade;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let gx = Math.ceil((x - RADIUS) / GRID) * GRID; gx <= x + RADIUS; gx += GRID) {
        ctx.moveTo(gx + 0.5, y - RADIUS);
        ctx.lineTo(gx + 0.5, y + RADIUS);
      }
      for (let gy = Math.ceil((y - RADIUS) / GRID) * GRID; gy <= y + RADIUS; gy += GRID) {
        ctx.moveTo(x - RADIUS, gy + 0.5);
        ctx.lineTo(x + RADIUS, gy + 0.5);
      }
      ctx.stroke();

      // 평면: 커서를 지나는 십자축
      const axis = ctx.createRadialGradient(x, y, 0, x, y, RADIUS * 1.4);
      axis.addColorStop(0, css(line, 0.5 * k));
      axis.addColorStop(1, css(line, 0));
      ctx.strokeStyle = axis;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, h);
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(w, Math.round(y) + 0.5);
      ctx.stroke();

      // 아스키: 칸마다 글자를 흩뿌리고, 번지게(블러) 그린다
      ctx.font = `15px "JetBrains Mono", ui-monospace, monospace`;
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.shadowColor = css(glyph, 0.9);
      ctx.shadowBlur = 11;
      ctx.fillStyle = css(glyph, 1);
      const c0 = Math.floor((x - RADIUS) / CELL_W);
      const c1 = Math.ceil((x + RADIUS) / CELL_W);
      const r0 = Math.floor((y - RADIUS) / CELL_H);
      const r1 = Math.ceil((y + RADIUS) / CELL_H);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const px = c * CELL_W + CELL_W / 2;
          const py = r * CELL_H + CELL_H / 2;
          const d = Math.hypot(px - x, py - y) / RADIUS;
          if (d >= 1) continue;
          const n = hash(c, r);
          if (n < 0.38) continue; // 일부 칸만
          ctx.globalAlpha = Math.pow(1 - d, 1.6) * 0.8 * k;
          ctx.fillText(GLYPHS[Math.floor(n * 997) % GLYPHS.length], px, py);
        }
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      // 평면: 좌표 표시
      ctx.font = `11px "JetBrains Mono", ui-monospace, monospace`;
      ctx.textAlign = "left";
      ctx.fillStyle = css(line, 0.75 * k);
      const label = `x ${(x / w).toFixed(2)}  y ${(y / h).toFixed(2)}`;
      ctx.fillText(label, Math.min(x + 12, w - 110), Math.max(y - 12, 12));
    };

    const tick = () => {
      raf = 0;
      const e = reduce ? 1 : 0.14;
      const p = reduce ? 1 : 0.22;
      st.k += (st.target - st.k) * e;
      st.x += (st.tx - st.x) * p;
      st.y += (st.ty - st.y) * p;
      const moving =
        Math.abs(st.target - st.k) > 0.01 || Math.abs(st.tx - st.x) > 0.5 || Math.abs(st.ty - st.y) > 0.5;
      if (!moving && st.target === 0) st.k = 0;
      draw();
      if (moving) raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };

    const resize = () => {
      const r = plane.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      draw();
    };

    const onMove = (e: PointerEvent) => {
      const r = plane.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const inside = x >= 0 && y >= 0 && x <= r.width && y <= r.height;
      st.target = inside ? 1 : 0;
      if (inside) {
        if (st.k < 0.02) {
          st.x = x;
          st.y = y;
        }
        st.tx = x;
        st.ty = y;
      }
      start();
    };
    const onLeave = () => {
      st.target = 0;
      start();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(plane);
    resize();
    // 노드 버튼 위에서도 이벤트가 오도록 바깥(main)에서 듣는다
    hostEl.addEventListener("pointermove", onMove);
    hostEl.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      hostEl.removeEventListener("pointermove", onMove);
      hostEl.removeEventListener("pointerleave", onLeave);
    };
  }, [host]);

  return <canvas ref={ref} aria-hidden="true" data-glyph-field style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} />;
}
