import { test, expect, type Page } from "@playwright/test";

// 이야기 화면: 그래프 아래의 별·노드 목록 (스크롤 분리, 4개부터 별 스크롤, 눌러서 서로 포커스)

const RAW = "가나다라마바사아자차카타하파"; // 14자 = 노드 7개 x 2자
const SESSION = "story-focus-test";

/** /api/story 응답을 만들어 준다: 노드 7개, 의미 파일 k개 (의미 s는 노드 s와 s+1을 근거로) */
function fixture(k: number) {
  const nodes = Array.from({ length: 7 }, (_, i) => ({
    id: 1000 + i,
    sessionId: SESSION,
    order: i + 1,
    createdAt: "2026-11-05T01:00:00.000Z",
    user: RAW.slice(i * 2, i * 2 + 2),
    ai: `${i + 1}번 조각에 대한 반응이에요.`,
    storyId: 1,
    storySpans: [[i * 2, i * 2 + 2]],
    topic: `조각 ${i + 1}`,
  }));
  const meanings = Array.from({ length: k }, (_, s) => ({
    id: 500 + s,
    storyId: 1,
    sessionId: SESSION,
    nodeIds: [1000 + s, 1000 + s + 1],
    title: `의미 ${s + 1}`,
    essence: `이 별은 조각 ${s + 1}과 ${s + 2}에서 나온 이야기예요. `.repeat(3),
    keywords: [],
    createdAt: "2026-11-05T01:00:00.000Z",
  }));
  return {
    story: { id: 1, sessionId: SESSION, rawText: RAW, nodeIds: nodes.map((n) => n.id), createdAt: "2026-11-05T01:00:00.000Z" },
    nodes,
    meanings,
    method: "ai",
  };
}

async function analyze(page: Page, meaningCount: number) {
  await page.addInitScript((s) => localStorage.setItem("rem.sessionId", s), SESSION);
  await page.route("**/api/story", (route) => route.fulfill({ json: fixture(meaningCount) }));
  await page.goto("/story");
  await expect(page.getByTestId("session-id").or(page.locator('[class*="session"]')).first()).toHaveText(SESSION);
  await page.getByRole("button", { name: /예시: 수다/ }).click();
  await page.getByRole("button", { name: "분석하기" }).click();
  await expect(page.getByRole("heading", { name: /기억 노드/ })).toBeVisible();
}

/**
 * 그래프 안의 달·별(몸 번호)을 실제 마우스로 누른다. 달과 별이 서로 겹쳐 있으면 위에 있는 쪽이 눌리므로,
 * 그 몸이 맨 위에 보이는 점을 찾아서 누른다 (물리로 자리가 잡히는 중이라 늘 같은 점이 아니다).
 */
async function clickBody(page: Page, body: number) {
  const pt = await page.evaluate((b) => {
    const g = document.querySelector(`figure svg g[data-body="${b}"]`)!;
    const r = g.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const reach = Math.min(r.width, r.height) * 0.3;
    const tries: [number, number][] = [[0, 0]];
    for (let k = 0; k < 8; k++) tries.push([Math.cos((k * Math.PI) / 4) * reach, Math.sin((k * Math.PI) / 4) * reach]);
    for (const [dx, dy] of tries) {
      const hit = document.elementFromPoint(cx + dx, cy + dy)?.closest("g[data-body]") as HTMLElement | null;
      if (hit?.dataset.body === String(b)) return { x: cx + dx, y: cy + dy };
    }
    return null;
  }, body);
  expect(pt, `몸 ${body}이 가려져서 누를 수 없어요`).not.toBeNull();
  await page.mouse.click(pt!.x, pt!.y);
}

const starItems = (page: Page) => page.locator('section[aria-labelledby="deck-stars"] button[data-i]');
const nodeItems = (page: Page) => page.locator('section[aria-labelledby="deck-nodes"] button[data-i]');
const starList = (page: Page) => page.locator('section[aria-labelledby="deck-stars"] ol');
const nodeList = (page: Page) => page.locator('section[aria-labelledby="deck-nodes"] ol');
/** 그래프 안의 달(i) / 별(s)의 포커스 고리가 켜져 있나 */
const ringOn = (page: Page, body: number) =>
  page.locator(`figure svg g[data-body="${body}"] [data-focus-ring]`).evaluate((c) => getComputedStyle(c).opacity === "1");

test.describe("이야기 화면: 별·노드 목록", () => {
  test("별이 3개면 스크롤 없이 한눈에 다 펼쳐진다", async ({ page }) => {
    await analyze(page, 3);
    await expect(starItems(page)).toHaveCount(3);
    await expect(starList(page)).not.toHaveAttribute("data-scroll", "true");
    const overflow = await starList(page).evaluate((e) => e.scrollHeight - e.clientHeight);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("별이 4개 이상이면 별 목록만 자기 칸 안에서 스크롤되고, 노드 목록·페이지는 따로다", async ({ page }) => {
    await analyze(page, 5);
    await expect(starItems(page)).toHaveCount(5);
    await expect(starList(page)).toHaveAttribute("data-scroll", "true");
    const dims = await starList(page).evaluate((e) => ({ over: e.scrollHeight - e.clientHeight, ov: getComputedStyle(e).overflowY }));
    expect(dims.over).toBeGreaterThan(20);
    expect(dims.ov).toBe("auto");

    const before = { node: await nodeList(page).evaluate((e) => e.scrollTop), page: await page.evaluate(() => scrollY) };
    await starList(page).evaluate((e) => (e.scrollTop = e.scrollHeight));
    await page.waitForTimeout(100);
    expect(await starList(page).evaluate((e) => e.scrollTop)).toBeGreaterThan(20);
    expect(await nodeList(page).evaluate((e) => e.scrollTop)).toBe(before.node);
    expect(await page.evaluate(() => scrollY)).toBe(before.page);
  });

  test("노드를 누르면 그래프에서 그 달이 포커스되고, 이어진 별은 표시되고, 다시 누르면 풀린다", async ({ page }) => {
    await analyze(page, 3);
    // 노드 2번(index 1)은 의미 1(★1)과 의미 2(★2)의 근거
    await nodeItems(page).nth(1).click();
    await expect(nodeItems(page).nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => ringOn(page, 1)).toBe(true);
    await expect(starItems(page).nth(0)).toHaveAttribute("data-linked", "");
    await expect(starItems(page).nth(1)).toHaveAttribute("data-linked", "");
    await expect(starItems(page).nth(2)).not.toHaveAttribute("data-linked", "");
    // 눌러서 보는 동안 AI 반응까지 펼쳐진다
    await expect(nodeItems(page).nth(1)).toContainText("2번 조각에 대한 반응이에요.");
    // 원문에서 그 달의 구간만 또렷하다
    await expect(page.locator('span[data-hot="on"]')).toHaveCount(1);
    await expect(page.locator('span[data-hot="off"]')).toHaveCount(6);

    await nodeItems(page).nth(1).click();
    await expect(nodeItems(page).nth(1)).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => ringOn(page, 1)).toBe(false);
    await expect(page.locator("span[data-hot]")).toHaveCount(0);
  });

  test("별을 누르면 그 별과 근거 노드들이 포커스된다", async ({ page }) => {
    await analyze(page, 3);
    await starItems(page).nth(1).click(); // ★2: 노드 2, 3
    await expect(starItems(page).nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => ringOn(page, 7 + 1)).toBe(true); // 별 몸 번호는 노드 수(7) + 별 순서
    await expect(nodeItems(page).nth(1)).toHaveAttribute("data-linked", "");
    await expect(nodeItems(page).nth(2)).toHaveAttribute("data-linked", "");
    await expect(nodeItems(page).nth(0)).not.toHaveAttribute("data-linked", "");
    await expect(page.locator('span[data-hot="on"]')).toHaveCount(2);
  });

  test("그래프의 별·달을 눌러도 아래 목록이 같이 포커스된다 (끌기와 구분)", async ({ page }) => {
    await analyze(page, 3);
    await page.waitForTimeout(1800); // 연출이 가라앉은 뒤
    await clickBody(page, 7); // 별 ★1
    await expect(starItems(page).nth(0)).toHaveAttribute("aria-pressed", "true");
    await clickBody(page, 3); // 달 4번
    await expect(nodeItems(page).nth(3)).toHaveAttribute("aria-pressed", "true");
    await expect(starItems(page).nth(0)).toHaveAttribute("aria-pressed", "false");
  });

  test("별 목록에서 눌러도, 포커스한 항목이 칸 안에서 보이게 그 칸만 스크롤된다", async ({ page }) => {
    await analyze(page, 6);
    await starList(page).evaluate((e) => (e.scrollTop = 0));
    const pageY = await page.evaluate(() => scrollY);
    await clickBody(page, 12); // ★6 (마지막 별)을 그래프에서 누름
    await expect(starItems(page).nth(5)).toHaveAttribute("aria-pressed", "true");
    // 목록이 자기 칸 안에서 그 항목까지 내려와 있고, 페이지는 그대로
    await expect.poll(() => starList(page).evaluate((e) => e.scrollTop)).toBeGreaterThan(20);
    const visible = await starItems(page).nth(5).evaluate((el) => {
      const l = el.closest("ol")!.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return r.top >= l.top - 1 && r.bottom <= l.bottom + 1;
    });
    expect(visible).toBe(true);
    expect(await page.evaluate(() => scrollY)).toBe(pageY);
  });

  test("의미 파일이 0개면 안내 문구가 나오고 노드는 그대로 보인다", async ({ page }) => {
    await analyze(page, 0);
    await expect(page.getByText("의미 파일(별)을 뽑지 못했어요")).toBeVisible();
    await expect(nodeItems(page)).toHaveCount(7);
  });
});
