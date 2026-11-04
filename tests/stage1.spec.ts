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

const lit = async (page: import("@playwright/test").Page, order: number) =>
  Number(await page.locator(`button[aria-label^="기억 ${order}번:"]`).getAttribute("data-lit"));

test("달 상: 보이는 기억은 보름달, 멀어질수록 어두워지고, 지난 기억과 앞선 기억은 밝은 쪽이 반대", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^기억 \d+번/ })).toHaveCount(20);
  await expect.poll(() => lit(page, 1)).toBeGreaterThan(0.95); // 맨 위: 첫 기억은 보름
  const far = await lit(page, 20);
  expect(far).toBe(0); // 가장 먼 기억은 삭
  // 위에서 아래로 갈수록 단조롭게 어두워진다 (부드러운 변화)
  const shown = await Promise.all([4, 5, 6, 7, 8, 9].map((o) => lit(page, o)));
  for (let i = 1; i < shown.length; i++) expect(shown[i]).toBeLessThanOrEqual(shown[i - 1]);
  expect(shown[shown.length - 1]).toBeLessThan(shown[0]);

  // 가운데로 스크롤하면 초점이 옮겨 가고, 앞뒤 기억의 밝은 쪽이 갈린다
  await page.getByRole("region", { name: "대화" }).evaluate((el) => el.scrollTo(0, el.scrollHeight / 2));
  await expect.poll(() => lit(page, 20)).toBeLessThan(0.6);
  await expect.poll(() => lit(page, 1)).toBeLessThan(0.3);
  await expect(page.locator('button[aria-label^="기억 1번:"]')).toHaveAttribute("data-side", "left");
  await expect(page.locator('button[aria-label^="기억 20번:"]')).toHaveAttribute("data-side", "right");
  await page.screenshot({ path: "screenshots/exhibit-moons.png" });
});

test("노드 동그라미: 외곽선과 달이 축 한가운데에 정확히 겹친다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^기억 \d+번/ })).toHaveCount(20);
  const off = await page.evaluate(() => {
    const axis = [...document.querySelectorAll("svg rect")].find((r) => r.getAttribute("width") === "1") as SVGRectElement;
    const ax = axis.getBoundingClientRect().left + 0.5;
    return [...document.querySelectorAll("button[data-lit]")].map((b) => {
      const svg = b.querySelector("svg")!.getBoundingClientRect();
      const circ = b.querySelector("svg circle")!.getBoundingClientRect();
      return {
        axis: Math.abs(svg.left + svg.width / 2 - ax),
        ring: Math.abs(circ.left + circ.width / 2 - (svg.left + svg.width / 2)) + Math.abs(circ.top + circ.height / 2 - (svg.top + svg.height / 2)),
      };
    });
  });
  for (const o of off) {
    expect(o.axis).toBeLessThan(0.51);
    expect(o.ring).toBeLessThan(0.1);
  }
});

test("마우스를 평면에 올리면 아스키·격자가 번지고, 떼면 사라진다", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^기억 \d+번/ })).toHaveCount(20); // 화면이 다 뜬 뒤에
  const canvas = page.locator("canvas[data-glyph-field]");
  await expect(canvas).toBeVisible();
  const ink = () =>
    canvas.evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
      return n;
    });
  await expect.poll(ink).toBe(0); // 처음엔 아무것도 없음
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.6, { steps: 8 });
  await expect.poll(ink, { timeout: 3000 }).toBeGreaterThan(500);
  await page.waitForTimeout(900); // 번짐이 커서를 따라잡을 때까지
  await page.screenshot({ path: "screenshots/exhibit-hover.png" });
  await page.mouse.move(box.x - 200, box.y + 100, { steps: 4 }); // 대화 칸 위로
  await expect.poll(ink, { timeout: 3000 }).toBe(0);
});

test("디버그 화면: 노드 목록 20줄", async ({ page }) => {
  await page.goto("/debug");
  await expect(page.locator("tbody tr")).toHaveCount(20);
  await expect(page.getByText(store.nodes[0].user)).toBeVisible();
  await page.screenshot({ path: "screenshots/debug.png", fullPage: true });
});
