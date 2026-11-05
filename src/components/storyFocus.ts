// 이야기 결과 화면에서 "지금 어느 별/노드를 보고 있나"(포커스)와 별↔노드 연결 계산 (순수 계산 → tests/unit에서 바로 시험)

/** 포커스된 몸: 달(기억 노드) 또는 별(의미 파일). index는 이 화면의 순서(0부터) */
export interface StoryFocus {
  kind: "moon" | "star";
  index: number;
}

/** 별 s와 달 i를 잇는 선 하나 (의미 파일 s의 근거 노드가 i) */
export interface Link {
  s: number;
  i: number;
}

/** 의미 파일이 이 개수 이상이면 별 목록에 스크롤을 넣는다 (그 아래는 한눈에 다 보이게 그냥 펼친다) */
export const STAR_LIST_SCROLL_FROM = 4;

/** 노드 번호를 이 화면의 달 순서로 바꿔 연결을 만든다 (모르는 번호는 버린다) */
export function buildLinks(nodes: { id: number }[], meanings: { nodeIds: number[] }[]): Link[] {
  const at = new Map(nodes.map((nd, i) => [nd.id, i]));
  return meanings.flatMap((m, s) =>
    m.nodeIds.flatMap((id) => {
      const i = at.get(id);
      return i === undefined ? [] : [{ s, i }];
    }),
  );
}

export interface Related {
  /** 포커스와 이어진 달 / 별 (포커스한 것 자신은 넣지 않는다) */
  moons: Set<number>;
  stars: Set<number>;
}

/** 포커스한 별이면 그 근거 달들, 포커스한 달이면 그 달을 근거로 둔 별들 */
export function relatedOf(focus: StoryFocus | null, links: Link[]): Related {
  const moons = new Set<number>();
  const stars = new Set<number>();
  if (focus) {
    for (const { s, i } of links) {
      if (focus.kind === "star" && s === focus.index) moons.add(i);
      if (focus.kind === "moon" && i === focus.index) stars.add(s);
    }
  }
  return { moons, stars };
}

export const sameFocus = (a: StoryFocus | null, b: StoryFocus | null) =>
  !!a && !!b && a.kind === b.kind && a.index === b.index;

/** 같은 걸 다시 누르면 포커스를 푼다 */
export const toggleFocus = (cur: StoryFocus | null, next: StoryFocus): StoryFocus | null => (sameFocus(cur, next) ? null : next);

/** 포커스에 해당하는 원문 구간들의 노드 순서: 달이면 자기 자신, 별이면 근거 달들 */
export function focusedMoons(focus: StoryFocus | null, links: Link[]): Set<number> {
  if (!focus) return new Set();
  if (focus.kind === "moon") return new Set([focus.index]);
  return relatedOf(focus, links).moons;
}
