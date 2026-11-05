import { test, expect, type Page } from "@playwright/test";

// 대화 화면의 사진 첨부: 클립 버튼 / Ctrl+V / 끌어 놓기, 입력줄 늘어남, 보낸 사진 보기·크게 보기

import { deflateSync } from "node:zlib";

// 브라우저가 실제로 읽을 수 있는 1x1 PNG를 만든다 (잘못된 바이트면 사진 줄이기에서 거절된다)
function makePng(): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.from(type, "ascii");
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); // 너비
  ihdr.writeUInt32BE(1, 4); // 높이
  ihdr[8] = 8; // 비트 수
  ihdr[9] = 6; // RGBA
  const idat = deflateSync(Buffer.from([0, 239, 223, 166, 255])); // 필터 0 + 연한 달빛 한 점
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const PNG = makePng();
const PNG_B64 = PNG.toString("base64");
const png = (name = "a.png") => ({ name, mimeType: "image/png", buffer: PNG });

async function openFreshChat(page: Page) {
  const session = `ui-img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await page.addInitScript((s) => localStorage.setItem("rem.sessionId", s), session);
  await page.goto("/chat");
  await expect(page.getByRole("textbox", { name: "메시지" })).toBeVisible();
  // 서버가 그린 화면에 브라우저 스크립트가 붙은 뒤(세션 번호가 뜬 뒤)에만 파일을 넣는다
  await expect(page.getByTitle("이 대화의 세션 번호")).toHaveText(session);
  return session;
}
const field = (page: Page) => page.getByRole("textbox", { name: "메시지" }).locator("xpath=..");
const fileInput = (page: Page) => page.locator('input[type="file"]');

test.describe("대화 사진 첨부", () => {
  test("클립으로 고른 사진이 입력창 안에 붙고, 테두리 상자가 사진까지 늘어난다", async ({ page }) => {
    await openFreshChat(page);
    const before = (await field(page).boundingBox())!.height;
    await fileInput(page).setInputFiles(png());
    await expect(page.getByRole("list", { name: "붙인 사진" }).getByRole("img")).toHaveCount(1);
    await expect.poll(async () => (await field(page).boundingBox())!.height, { timeout: 3000 }).toBeGreaterThan(before + 50);
    // 사진은 상자(.field) 안쪽에 있다
    const box = (await field(page).boundingBox())!;
    const thumb = (await page.getByRole("list", { name: "붙인 사진" }).getByRole("img").boundingBox())!;
    expect(thumb.y).toBeGreaterThanOrEqual(box.y);
    expect(thumb.y + thumb.height).toBeLessThanOrEqual(box.y + box.height);
  });

  test("사진을 빼면 상자가 다시 줄어든다", async ({ page }) => {
    await openFreshChat(page);
    const before = (await field(page).boundingBox())!.height;
    await fileInput(page).setInputFiles(png());
    await expect(page.getByRole("img", { name: "a.png" })).toBeVisible();
    await page.getByRole("button", { name: "a.png 빼기" }).click();
    await expect(page.getByRole("list", { name: "붙인 사진" }).getByRole("img")).toHaveCount(0);
    await expect.poll(async () => (await field(page).boundingBox())!.height, { timeout: 3000 }).toBeLessThan(before + 4);
  });

  test("글과 사진을 보내면 대화에 사진이 보이고, 눌러 크게 보고, Esc로 닫는다", async ({ page }) => {
    await openFreshChat(page);
    await fileInput(page).setInputFiles(png());
    await expect(page.getByRole("img", { name: "a.png" })).toBeVisible();
    await page.getByRole("textbox", { name: "메시지" }).fill("사진 보낼게요");
    await page.getByRole("button", { name: "보내기" }).click();

    const sent = page.getByRole("button", { name: "보낸 사진 크게 보기" });
    await expect(sent).toHaveCount(1, { timeout: 15000 });
    await expect(page.getByText("사진 보낼게요").first()).toBeVisible();
    // 보낸 뒤 입력줄의 사진은 비워진다
    await expect(page.getByRole("list", { name: "붙인 사진" }).getByRole("img")).toHaveCount(0);
    // 서버에서 실제로 읽힌다
    await expect.poll(() => sent.locator("img").evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBeGreaterThan(0);

    await sent.click();
    const dialog = page.getByRole("dialog", { name: "사진 크게 보기" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("글 없이 사진만 보내도 되고 '(사진)' 글은 보이지 않는다. 달창 목록에는 사진 아이콘", async ({ page }) => {
    await openFreshChat(page);
    await fileInput(page).setInputFiles(png());
    await expect(page.getByRole("img", { name: "a.png" })).toBeVisible();
    await page.getByRole("button", { name: "보내기" }).click();
    await expect(page.getByRole("button", { name: "보낸 사진 크게 보기" })).toHaveCount(1, { timeout: 15000 });
    await expect(page.locator("p", { hasText: /^\(사진\)$/ })).toHaveCount(0);
    await expect(page.getByRole("img", { name: "사진 있음" })).toHaveCount(1);
  });

  test("한 번에 4장까지: 5장을 고르면 4장만 붙고 안내가 나온다", async ({ page }) => {
    await openFreshChat(page);
    await fileInput(page).setInputFiles([png("1.png"), png("2.png"), png("3.png"), png("4.png"), png("5.png")]);
    await expect(page.getByRole("list", { name: "붙인 사진" }).getByRole("img")).toHaveCount(4);
    await expect(page.locator('p[role="alert"]')).toContainText("4장");
    await expect(page.getByRole("button", { name: "사진 붙이기" })).toBeDisabled();
  });

  test("사진이 아닌 파일은 거절한다", async ({ page }) => {
    await openFreshChat(page);
    await fileInput(page).setInputFiles({ name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await expect(page.locator('p[role="alert"]')).toContainText("사진 파일만");
    await expect(page.getByRole("list", { name: "붙인 사진" }).getByRole("img")).toHaveCount(0);
  });

  test("Ctrl+V로 붙여 넣은 그림이 사진으로 붙는다 (글자만 붙일 때는 평소처럼)", async ({ page }) => {
    await openFreshChat(page);
    const ta = page.getByRole("textbox", { name: "메시지" });
    await ta.focus();
    await ta.evaluate((el, b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], "paste.png", { type: "image/png" }));
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, PNG_B64);
    await expect(page.getByRole("list", { name: "붙인 사진" }).getByRole("img")).toHaveCount(1);
    await expect(ta).toHaveValue("");
    // 글자만 있는 붙여넣기는 막지 않는다
    const prevented = await ta.evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", "글자");
      const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    expect(prevented).toBe(false);
  });

  test("파일을 끌어 오면 + 모양 별이 나타나고, 놓으면 사진이 붙는다 (글자를 끌 때는 반응하지 않는다)", async ({ page }) => {
    await openFreshChat(page);
    const chat = page.locator("section", { has: page.getByRole("log") }).first();
    const drag = (type: string, withFile: boolean) =>
      chat.evaluate(
        (el, a) => {
          const dt = new DataTransfer();
          if (a.withFile) {
            const bytes = Uint8Array.from(atob(a.b64), (c) => c.charCodeAt(0));
            dt.items.add(new File([bytes], "drag.png", { type: "image/png" }));
          } else {
            dt.setData("text/plain", "글자");
          }
          el.dispatchEvent(new DragEvent(a.type, { dataTransfer: dt, bubbles: true, cancelable: true, clientX: 500, clientY: 300 }));
        },
        { type, withFile, b64: PNG_B64 },
      );

    await drag("dragenter", false);
    await expect(page.locator('[class*="dropStar"]')).toHaveCount(0); // 글자 끌기에는 반응 없음

    await drag("dragenter", true);
    await drag("dragover", true);
    const star = page.locator('[class*="dropStar"]');
    await expect(star).toHaveCount(1);
    // 별은 꼭짓점 8개(바깥 4 + 안쪽 4)인 다각형이다
    await expect(star.locator("polygon")).toHaveAttribute("points", /^(-?[\d.]+,-?[\d.]+ ){7}-?[\d.]+,-?[\d.]+$/);

    await drag("drop", true);
    await expect(page.getByRole("list", { name: "붙인 사진" }).getByRole("img")).toHaveCount(1);
    await expect(star).toHaveCount(0, { timeout: 3000 });
  });
});
