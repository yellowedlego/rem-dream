import { test, expect, type Page } from "@playwright/test";

// 내 AI 화면: 만들기 → 기억 위키 → 같은 말 두 AI 비교 → 카드(QR)·메일·복사 → 내 기록 지우기 (가짜 모델·가짜 메일)

async function open(page: Page, messages: string[]) {
  const session = `me-ui-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  for (const message of messages) {
    expect((await page.request.post("/api/chat", { data: { sessionId: session, message } })).status()).toBe(200);
  }
  await page.addInitScript((s) => localStorage.setItem("rem.sessionId", s), session);
  await page.goto("/me");
  await expect(page.getByTitle("이 대화의 세션 번호")).toHaveText(session);
  return session;
}

test.describe("내 AI 화면", () => {
  test("기록이 없으면 만들기 버튼이 잠기고 대화하러 가는 길을 알려 준다", async ({ page }) => {
    await open(page, []);
    await expect(page.getByText("아직 기록이 없어요.")).toBeVisible();
    await expect(page.getByRole("button", { name: "의미성 추출해서 만들기" })).toBeDisabled();
    await expect(page.getByRole("link", { name: "대화하러 가기" })).toBeVisible();
  });

  test("관계를 골라 만들면 알아본 나·말투·기억 위키가 나온다", async ({ page }) => {
    await open(page, ["오늘 수학 시험 망함 ㅋㅋ", "떡볶이 먹으면 기분 풀려 ㅋㅋ"]);
    await expect(page.getByText("이 세션의 기억 노드 2개")).toBeVisible();
    await page.getByRole("radio", { name: /선생님/ }).check();
    await page.getByRole("button", { name: "의미성 추출해서 만들기" }).click();
    await expect(page.getByRole("heading", { name: /기억 위키/ })).toBeVisible();
    const chips = page.getByRole("list", { name: "말투" });
    await expect(chips).toContainText("반말");
    await expect(chips).toContainText("선생님처럼");
    await expect(page.getByRole("button", { name: "다시 만들기" })).toBeVisible();
  });

  test("같은 말을 두 AI에게: 관련 위키 칸이 '방금 찾아봄'으로 빛나고 내 AI 답 아래에 표시된다", async ({ page }) => {
    await open(page, ["떡볶이 먹으면 기분 풀려", "오늘 피곤해"]);
    await page.getByRole("button", { name: "의미성 추출해서 만들기" }).click();
    await expect(page.getByRole("heading", { name: /기억 위키/ })).toBeVisible();

    await page.getByRole("textbox", { name: "두 AI에게 할 말" }).fill("떡볶이 먹으러 갈까");
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    const log = page.getByRole("log", { name: "비교 대화" });
    await expect(log.locator('[data-side="basic"]')).toHaveCount(1);
    await expect(log.locator('[data-side="personal"]')).toContainText("기억 위키에서 찾아봄");
    await expect(page.locator("li[data-looked]")).toHaveCount(1);
    await expect(page.locator("li[data-looked]")).toContainText("방금 찾아봄");

    // 관련 없는 말을 하면 빛이 꺼진다
    await page.getByRole("textbox", { name: "두 AI에게 할 말" }).fill("날씨 좋다");
    await page.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(log.locator('[data-side="basic"]')).toHaveCount(2);
    await expect(page.locator("li[data-looked]")).toHaveCount(0);
  });

  test("가져가기: 종이 카드에 QR이 그려지고, 인쇄할 때는 카드만 보인다", async ({ page }) => {
    await open(page, ["동아리 전시 준비 중이야"]);
    await page.getByRole("button", { name: "의미성 추출해서 만들기" }).click();
    const card = page.getByRole("article", { name: "가져가는 프롬프트 카드" });
    await expect(card).toBeVisible();
    await expect(card.getByRole("img", { name: /QR/ }).locator("svg")).toHaveCount(1);
    await expect(card).toContainText("나와 말이 잘 통하는");

    // 카드 크기 = A6 (105×148mm ≈ 397×559px)
    const box = (await card.boundingBox())!;
    expect(Math.round(box.width)).toBeGreaterThanOrEqual(395);
    expect(Math.round(box.width)).toBeLessThanOrEqual(399);
    expect(Math.round(box.height)).toBeGreaterThanOrEqual(557);

    await page.emulateMedia({ media: "print" });
    const vis = await page.evaluate(() => ({
      card: getComputedStyle(document.querySelector('[aria-label="가져가는 프롬프트 카드"]')!).visibility,
      wiki: getComputedStyle(document.querySelector("#wiki-h")!).visibility,
    }));
    expect(vis).toEqual({ card: "visible", wiki: "hidden" });
  });

  test("메일(연습 모드): 동의해야 보낼 수 있고, 보낸 뒤 가린 주소를 보여 준다", async ({ page }) => {
    await open(page, ["안녕 반가워"]);
    await page.getByRole("button", { name: "의미성 추출해서 만들기" }).click();
    const sendBtn = page.getByRole("button", { name: "메일 보내기" });
    await page.getByPlaceholder("me@example.com").fill("visitor@example.com");
    await expect(sendBtn).toBeDisabled();
    await page.getByRole("checkbox").check();
    await sendBtn.click();
    await expect(page.getByRole("status")).toContainText("v***@example.com로 보냈어요");
    await expect(page.getByPlaceholder("me@example.com")).toHaveValue("");
  });

  test("이 자리의 내 기록 지우기: 확인하면 세션이 지워지고 새 세션으로 바뀐다", async ({ page }) => {
    const session = await open(page, ["지울 이야기"]);
    await page.getByRole("button", { name: "의미성 추출해서 만들기" }).click();
    await expect(page.getByRole("heading", { name: /기억 위키/ })).toBeVisible();
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "이 자리의 내 기록 지우기" }).click();
    await expect(page.getByTitle("이 대화의 세션 번호")).not.toHaveText(session);
    await expect(page.getByText("아직 기록이 없어요.")).toBeVisible();
    const nodes = await (await page.request.get(`/api/nodes?sessionId=${session}`)).json();
    expect(nodes.nodes).toHaveLength(0);
  });

  test("대화 화면에서 '의미성 추출 → 내 AI'로 넘어온다", async ({ page }) => {
    const session = `me-link-${Date.now()}`;
    await page.request.post("/api/chat", { data: { sessionId: session, message: "안녕" } });
    await page.addInitScript((s) => localStorage.setItem("rem.sessionId", s), session);
    await page.goto("/chat");
    await expect(page.getByTitle("이 대화의 세션 번호")).toHaveText(session);
    await page.getByRole("link", { name: "의미성 추출 → 내 AI" }).click();
    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByText("이 세션의 기억 노드 1개")).toBeVisible();
  });
});

test.describe("기록 관리 화면", () => {
  test("세션 목록을 보고 한 세션을 지운다", async ({ page }) => {
    const session = `admin-ui-${Date.now()}`;
    await page.request.post("/api/chat", { data: { sessionId: session, message: "관리 화면 확인" } });
    await page.goto("/admin");
    const row = page.getByRole("row", { name: new RegExp(session) });
    await expect(row).toBeVisible();
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: `${session} 지우기` }).click();
    await expect(page.getByRole("status")).toContainText(`${session}를 지웠어요`);
    await expect(row).toHaveCount(0);
  });
});
