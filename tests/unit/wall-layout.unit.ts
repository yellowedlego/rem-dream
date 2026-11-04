// 대화 열 배치 계산식(src/components/wallLayout.ts) 검사.
// 실행: node --test tests/unit/wall-layout.unit.ts   (Playwright가 집어 가지 않도록 이름이 .spec/.test가 아니다)
import { test } from "node:test";
import assert from "node:assert/strict";
import { COL_MAX, COL_MIN, WALL_GAP, WALL_W, columnAt, wallLayout } from "../../src/components/wallLayout.ts";

const EPS = 1e-6;
const AREAS = Array.from({ length: 300 }, (_, i) => 200 + i * 7); // 200px ~ 2293px
const WALLS = Array.from({ length: 77 }, (_, i) => i * 5); // 0 ~ 380px

test("벽 없을 때는 대화 영역 가운데, 다 들어오면 남은 칸 가운데", () => {
  for (const a of AREAS) {
    const lay = wallLayout(a);
    const start = columnAt(lay, 0);
    assert.ok(Math.abs(start.left - (a - start.width) / 2) < EPS, `area ${a}: 처음 가운데가 아님`);
    assert.equal(start.width, Math.min(COL_MAX, a));
    const room = a - WALL_W - WALL_GAP;
    if (room >= COL_MIN) {
      const end = columnAt(lay, WALL_W);
      assert.ok(Math.abs(end.left - (room - end.width) / 2) < EPS, `area ${a}: 끝에서 남은 칸 가운데가 아님`);
    }
  }
});

test("좌우 끝과 폭이 벽 길이에 정비례 (직선이라 두 번 차분이 0)", () => {
  for (const a of AREAS) {
    const lay = wallLayout(a);
    const pts = WALLS.map((w) => columnAt(lay, w));
    for (let i = 2; i < pts.length; i++) {
      const dl = pts[i].left - 2 * pts[i - 1].left + pts[i - 2].left;
      const dr =
        pts[i].left + pts[i].width - 2 * (pts[i - 1].left + pts[i - 1].width) + (pts[i - 2].left + pts[i - 2].width);
      assert.ok(Math.abs(dl) < EPS && Math.abs(dr) < EPS, `area ${a}: 직선이 아님`);
    }
  }
});

test("벽과 겹치지 않고, 왼쪽 밖으로 나가지 않는다 (남은 칸이 최소 폭 이상일 때)", () => {
  for (const a of AREAS) {
    if (a - WALL_W - WALL_GAP < COL_MIN) continue; // 너무 좁은 화면: 최소 폭을 지키느라 겹침을 허용
    const lay = wallLayout(a);
    for (const w of WALLS) {
      const { left, width } = columnAt(lay, w);
      const right = left + width;
      const wallEdge = a - w;
      assert.ok(left >= -EPS, `area ${a}, wall ${w}: 왼쪽 밖 (${left})`);
      assert.ok(right <= wallEdge + EPS, `area ${a}, wall ${w}: 벽과 겹침 (열 끝 ${right} > 벽 ${wallEdge})`);
      assert.ok(width >= Math.min(COL_MIN, a) - EPS, `area ${a}, wall ${w}: 너무 좁음 (${width})`);
    }
    const end = columnAt(lay, WALL_W);
    assert.ok(end.left + end.width <= a - WALL_W - WALL_GAP + EPS, `area ${a}: 끝에서 벽과 공백이 모자람`);
  }
});

test("입력은 대화 영역 폭뿐: 같은 폭이면 언제나 같은 결과 (글 길이와 무관)", () => {
  for (const a of AREAS) assert.deepEqual(wallLayout(a), wallLayout(a));
  assert.equal(wallLayout.length, 1);
});
