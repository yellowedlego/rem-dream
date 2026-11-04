// 대화 화면에서 오른쪽 벽(달창)이 들어올 때 대화 열을 어디에, 얼마나 넓게 둘지 계산한다.
//
// 계산식 (w = 벽이 들어온 길이, 0 ~ WALL_W)
//   벽 없음(w=0):      폭 W0 = min(COL_MAX, A),          왼쪽 L0 = (A - W0) / 2           ← 대화 영역 가운데
//   벽 다 들어옴(w=W): 남은 칸 R = A - WALL_W - WALL_GAP
//                      폭 W1 = max(min(COL_MAX, R), min(COL_MIN, A)), 왼쪽 L1 = max(0, (R - W1) / 2) ← 남은 칸 가운데
//   그 사이:           왼쪽(w) = L0 + (L1 - L0) * w / WALL_W,  폭(w) = W0 + (W1 - W0) * w / WALL_W
//
// 왼쪽 끝·오른쪽 끝·폭이 모두 w에 정비례(직선)로 움직인다. 벽의 왼쪽 끝(A - w)도 직선이라,
// 두 끝 상태에서 대화 열이 벽과 겹치지 않으면 그 사이 어디서도 겹치지 않는다.
// 입력은 대화 영역 폭 A뿐이고 폭을 명시해서 정하므로, 글 길이가 대화 열을 밀어낼 수 없다.

/** 벽(달창) 폭 */
export const WALL_W = 380;
/** 벽이 다 들어왔을 때 대화 열과 벽 사이에 남기는 공백 */
export const WALL_GAP = 16;
/** 대화 열의 가장 넓은 폭 */
export const COL_MAX = 760;
/** 대화 열의 가장 좁은 폭 (이보다 좁아야 하면 벽과 겹치는 것을 받아들인다) */
export const COL_MIN = 240;

export interface WallLayout {
  /** 벽 없을 때 왼쪽 끝 */
  l0: number;
  /** 벽 없을 때 폭 */
  w0: number;
  /** 벽이 1px 들어올 때 왼쪽 끝이 움직이는 양 */
  lk: number;
  /** 벽이 1px 들어올 때 폭이 바뀌는 양 */
  wk: number;
  /** 벽이 다 들어왔을 때 왼쪽 끝 */
  l1: number;
  /** 벽이 다 들어왔을 때 폭 */
  w1: number;
}

export function wallLayout(area: number): WallLayout {
  const a = Math.max(0, area);
  const w0 = Math.min(COL_MAX, a);
  const l0 = (a - w0) / 2;
  const room = a - WALL_W - WALL_GAP;
  const w1 = Math.max(Math.min(COL_MAX, room), Math.min(COL_MIN, a));
  const l1 = Math.max(0, (room - w1) / 2);
  return { l0, w0, l1, w1, lk: (l1 - l0) / WALL_W, wk: (w1 - w0) / WALL_W };
}

/** 벽이 wall(px)만큼 들어왔을 때 대화 열의 왼쪽 끝과 폭 (CSS와 같은 식) */
export function columnAt(lay: WallLayout, wall: number) {
  return { left: lay.l0 + lay.lk * wall, width: lay.w0 + lay.wk * wall };
}
