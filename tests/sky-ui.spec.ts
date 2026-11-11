import { test, expect, type Page } from "@playwright/test";

// 하늘 연출: 비교 화면 위 천구(유성우 → 벽 선 → 점 A 빛), 의미성 별자리(북극성 공전·모이는 연출), 전시 화면 전환

async function seedStory(page: Page, session: string) {
  const res = await page.request.post("/api/story", {
    data: { sessionId: session, text: "오늘 시험을 봤다. 떡볶이를 먹었다.\n\n동아리 전시를 준비했다. 밤늦게까지 화면을 만들었다." },
  });
  expect(res.status()).toBe(200);
}

test.describe("비교 화면 천구", () => {
  test("보내면 유성이 날고, 두 답변 칸 벽에서 천구까지 선이 올라가 점 A에서 빛이 번지고, 찾은 위키 별이 번쩍인다", async ({ page }) => {
    const session = `sky-cmp-${Date.now()}`;
    for (const message of ["떡볶이 먹으면 기분 풀려", "오늘 피곤해"]) {
      await page.request.post("/api/chat", { data: { sessionId: session, message } });
    }
    await page.addInitScript((s) => localStorage.setItem("rem.sessionId", s), session);
    await page.goto("/me");
    await expect(page.getByTitle("이 대화의 세션 번호")).toHaveText(session);
    await page.getByRole("button", { name: "의미성 추출해서 만들기" }).click();

    const panel = page.locator('section[aria-labelledby="cmp-h"]');
    await expect(panel.locator("[data-wiki]")).not.toHaveCount(0); // 천구의 이름 있는 별 = 위키 칸
    await page.getByRole("textbox", { name: "두 AI에게 할 말" }).fill("떡볶이 먹으러 갈까");
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(panel.locator('[class*="meteor"]').first()).toBeAttached();

    // 선 두 개(기본·내 AI), 각각 답변 칸 왼쪽 벽 x에서 천구 쪽(위)으로
    const lines = panel.locator("svg line");
    await expect(lines).toHaveCount(2);
    const geo = await lines.evaluateAll((ls) =>
      ls.map((l) => ({ x1: +l.getAttribute("x1")!, x2: +l.getAttribute("x2")!, y1: +l.getAttribute("y1")!, y2: +l.getAttribute("y2")! })),
    );
    for (const g of geo) {
      expect(g.x1).toBe(g.x2); // 곧은 세로선
      expect(g.y2).toBeLessThan(g.y1); // 위로
    }
    const walls = await panel.locator("[data-side]").evaluateAll((els, pl) => {
      const p = (pl as HTMLElement).getBoundingClientRect().left;
      return els.slice(-2).map((e) => e.getBoundingClientRect().left - p);
    }, await panel.elementHandle());
    expect(Math.abs(geo[0].x1 - walls[0])).toBeLessThan(2);
    expect(Math.abs(geo[1].x1 - walls[1])).toBeLessThan(2);

    // 점 A 두 개, 내 AI 쪽에서 찾은 위키 별이 번쩍
    await expect(panel.locator('[data-a="personal"]')).toHaveCount(1);
    await expect(panel.locator('[data-a="basic"]')).toHaveCount(1);
    await expect(panel.locator("[data-wiki][data-flare]")).toHaveCount(1);
  });
});

test.describe("의미성 별자리", () => {
  test("/sky: 의미 수만큼 별이 돌고, 숫자판이 노드·의미·관람객을 센다", async ({ page }) => {
    await seedStory(page, `sky-a-${Date.now()}`);
    const state = await (await page.request.get("/api/state")).json();
    await page.goto("/sky");
    await expect(page.locator("[data-meaning]")).toHaveCount(state.meanings.length);
    const hud = page.locator("dl");
    await expect(hud).toContainText(String(state.nodes.length));
    await expect(hud).toContainText(String(state.meanings.length));

    // 별이 실제로 움직인다 (공전)
    const star = page.locator("[data-meaning]").first();
    const a = await star.getAttribute("transform");
    await page.waitForTimeout(700);
    expect(await star.getAttribute("transform")).not.toBe(a);
  });

  test("새 의미가 생기면 다시 세서 별이 하나 더 뜬다", async ({ page }) => {
    await seedStory(page, `sky-b-${Date.now()}`);
    const state = await (await page.request.get("/api/state")).json();
    await page.goto("/sky");
    await expect(page.locator("[data-meaning]")).toHaveCount(state.meanings.length);
    const before = state.meanings.length;
    await seedStory(page, `sky-c-${Date.now()}`);
    await expect(page.locator("[data-meaning]")).toHaveCount(before + 1, { timeout: 8000 });
    await expect(page.locator("[data-meaning][data-born]")).toHaveCount(1);
  });

  test("북극성을 누르면: 기운 원에 모여 → 한 줄 → 빨려 들고 → 최근 대화가 말풍선으로", async ({ page }) => {
    const session = `sky-d-${Date.now()}`;
    await page.request.post("/api/chat", { data: { sessionId: session, message: "북극성에게 들려줄 최근 대화" } });
    await seedStory(page, session);
    await page.goto("/sky");
    await expect(page.locator("[data-meaning]").first()).toBeAttached();
    await page.getByRole("button", { name: /북극성/ }).click();

    const ring = page.locator("ellipse");
    await expect.poll(async () => Number(await ring.evaluate((e) => e.style.opacity)), { timeout: 3000 }).toBeGreaterThan(0.3);
    // 빨려 든 뒤 북극성이 관성으로 흔들린다
    await expect
      .poll(async () => (await page.getByRole("button", { name: /북극성/ }).getAttribute("transform")) ?? "", { timeout: 3000 })
      .not.toMatch(/translate\(0\.00 -?0\.00\)/);
    await expect(page.getByText("북극성에게 들려줄 최근 대화").or(page.locator('[class*="talkUser"]'))).toBeVisible({ timeout: 4000 });
  });
});

test.describe("전시 화면 전환", () => {
  test("대화창 ↔ 별자리를 바꾸고, 새로 열어도 고른 화면이 남는다", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "별자리" }).click();
    await expect(page.getByRole("button", { name: /북극성/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: "별자리" })).toHaveAttribute("aria-selected", "true");
    await page.reload();
    await expect(page.getByRole("button", { name: /북극성/ })).toBeVisible();
    await page.getByRole("tab", { name: "대화창" }).click();
    await expect(page.getByRole("region", { name: "기억 노드 시간축" })).toBeVisible();
  });
});

test.describe("예시 기억", () => {
  test("의미가 하나도 없으면 북극성을 눌러도 말풍선이 뜨지 않고, '예시 별 채우기'로 별이 뜬다", async ({ page }) => {
    await page.request.post("/api/debug/reset-all");
    await page.request.post("/api/admin/prune", { data: { olderThanHours: 0 } });
    await page.goto("/sky");
    await expect(page.getByText("아직 의미가 없어요")).toBeVisible();
    await page.getByRole("button", { name: /북극성/ }).click();
    await page.waitForTimeout(1500);
    await expect(page.locator('[class*="talk"]')).toHaveCount(0);

    await page.getByRole("button", { name: "예시 별 채우기" }).click();
    await expect.poll(() => page.locator("[data-meaning]").count(), { timeout: 5000 }).toBeGreaterThanOrEqual(6);
    await expect(page.getByText("아직 의미가 없어요")).toHaveCount(0);
  });

  test("/me에서 기록이 없을 때 '예시 기억 넣기'로 내 AI를 바로 만들 수 있다", async ({ page }) => {
    const session = `demo-me-${Date.now()}`;
    await page.addInitScript((s) => localStorage.setItem("rem.sessionId", s), session);
    await page.goto("/me");
    await expect(page.getByTitle("이 대화의 세션 번호")).toHaveText(session);
    await page.getByRole("button", { name: "예시 기억 넣기" }).click();
    await expect(page.getByText(/이 세션의 기억 노드 \d+개/)).toBeVisible();
    await page.getByRole("button", { name: "의미성 추출해서 만들기" }).click();
    await expect(page.getByRole("heading", { name: /기억 위키/ })).toBeVisible();
  });
});
