import { expect, test } from "@playwright/test";
import store from "../data/store.json" with { type: "json" };

// 1단계 끝 기준: 노드를 누르면 대화가 펼쳐지고(→ 그 대화로 스크롤), 디버그 화면에 노드 목록이 보임

test("전시 화면: 노드 20개, 보이는 대화를 노드가 비추고, 노드를 누르면 그 대화로 감", async ({ page }) => {
  await page.goto("/");
  const nodes = page.getByRole("button", { name: /^기억 \d+번/ });
  await expect(nodes).toHaveCount(20);
  // 처음에는 첫 기억이 보이고 빛줄기가 있다
  await expect(page.locator("[data-beam='1']")).toBeAttached();
  await page.screenshot({ path: "screenshots/exhibit-top.png" });

  // 노드를 누르면 그 대화가 화면에 들어오고, 그 노드로 빛줄기가 간다
  const target = store.nodes[10];
  await page.getByRole("button", { name: `기억 ${target.order}번: ${target.user}` }).click();
  const pair = page.locator(`article[data-node-id='${target.id}']`);
  await expect(pair).toBeInViewport();
  await expect(pair).toContainText(target.ai);
  await expect(page.locator(`[data-beam='${target.id}']`)).toBeAttached();
  await expect(page.locator("[data-beam='1']")).not.toBeAttached();
  await page.screenshot({ path: "screenshots/exhibit-scrolled.png" });

  // 직접 스크롤해도 빛줄기가 따라온다
  await page.getByRole("region", { name: "대화" }).evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(page.locator("[data-beam='20']")).toBeAttached();
});

test("디버그 화면: 노드 목록 20줄", async ({ page }) => {
  await page.goto("/debug");
  await expect(page.locator("tbody tr")).toHaveCount(20);
  await expect(page.getByText(store.nodes[0].user)).toBeVisible();
  await page.screenshot({ path: "screenshots/debug.png", fullPage: true });
});
