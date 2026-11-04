/**
 * 기억 노드 = 달. lit(0~1): 1이면 보름, 0이면 삭(새달).
 * side: 밝은 쪽. "right"는 차오르는 달(초승→상현), "left"는 기우는 달(하현→그믐).
 *
 * 외곽선·어두운 면·밝은 면을 한 SVG 안에서 그려서, 소수점 위치에서도 서로 어긋나지 않는다.
 * 크기는 홀수(21px)라서 중심이 픽셀 한가운데에 놓인다.
 */
export const MOON_R = 8;
const R = MOON_R;
const BOX = 10.5;

interface MoonProps {
  lit: number;
  side: "left" | "right";
  selected?: boolean;
}

/** 달 그림만 (원점 중심, 반지름 8). 다른 SVG 안에서 transform으로 크기를 바꿔 쓸 수 있다. */
export function MoonShape({ lit, side, selected = false }: MoonProps) {
  const f = Math.min(1, Math.max(0, lit));
  // 밝은 반원(오른쪽) + 명암 경계(타원 호). 반달 이전(f<0.5)은 경계가 밝은 쪽으로, 이후는 반대쪽으로 볼록.
  const rx = R * Math.abs(1 - 2 * f);
  const sweep = f < 0.5 ? 0 : 1;
  const d = `M0 ${-R} A${R} ${R} 0 0 1 0 ${R} A${rx} ${R} 0 0 ${sweep} 0 ${-R}Z`;

  return (
    <>
      <circle r={R} fill="var(--moon-dark)" stroke="var(--moon-ring)" strokeWidth={1} />
      {f > 0.01 && (
        <path d={d} fill="var(--accent)" transform={side === "left" ? "scale(-1 1)" : undefined} />
      )}
      {selected && <circle r={R + 2.5} fill="none" stroke="var(--point)" strokeWidth={1.5} />}
    </>
  );
}

export default function Moon(props: MoonProps) {
  return (
    <svg
      width={BOX * 2}
      height={BOX * 2}
      viewBox={`${-BOX} ${-BOX} ${BOX * 2} ${BOX * 2}`}
      aria-hidden="true"
      style={{ display: "block", flex: "none" }}
    >
      <MoonShape {...props} />
    </svg>
  );
}
