import { test, expect } from "@playwright/test";
import type { MemoryNode } from "../src/lib/types";

// 대화에 이미지를 첨부하는 API (/api/chat의 images, /api/images/[id])

const sid = (p = "img") => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
// 1x1 PNG
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
const png = { mimeType: "image/png", data: PNG_B64 };

test.describe("Chat images", () => {
  test("글과 사진을 같이 보내면 노드에 사진이 붙고 /api/images/[id]로 읽힌다", async ({ request }) => {
    const res = await request.post("/api/chat", { data: { sessionId: sid(), message: "이 사진 봐 줘", images: [png] } });
    expect(res.status()).toBe(200);
    const node: MemoryNode = (await res.json()).node;
    expect(node.user).toBe("이 사진 봐 줘");
    expect(node.images).toHaveLength(1);
    expect(node.images![0].mime).toBe("image/png");
    expect(node.images![0].id).toMatch(/^[0-9a-f-]{36}\.png$/);

    const img = await request.get(`/api/images/${node.images![0].id}`);
    expect(img.status()).toBe(200);
    expect(img.headers()["content-type"]).toBe("image/png");
    expect(img.headers()["x-content-type-options"]).toBe("nosniff");
    expect((await img.body()).toString("base64")).toBe(PNG_B64);
  });

  test("글 없이 사진만 보내도 된다 (user는 표시 문구)", async ({ request }) => {
    const res = await request.post("/api/chat", { data: { sessionId: sid(), images: [png] } });
    expect(res.status()).toBe(200);
    const node: MemoryNode = (await res.json()).node;
    expect(node.user).toBe("(사진)");
    expect(node.images).toHaveLength(1);
  });

  test("여러 장을 보내면 장마다 다른 파일이 된다", async ({ request }) => {
    const res = await request.post("/api/chat", { data: { sessionId: sid(), message: "두 장", images: [png, png] } });
    const node: MemoryNode = (await res.json()).node;
    expect(node.images).toHaveLength(2);
    expect(new Set(node.images!.map((i) => i.id)).size).toBe(2);
  });

  test("잘못된 첨부는 400이고 노드도 파일도 남지 않는다", async ({ request }) => {
    const session = sid("bad");
    const bad = async (images: unknown) =>
      (await request.post("/api/chat", { data: { sessionId: session, message: "x", images } })).status();
    expect(await bad([png, png, png, png, png])).toBe(400); // 5장
    expect(await bad([{ mimeType: "image/svg+xml", data: PNG_B64 }])).toBe(400);
    expect(await bad([{ mimeType: "image/jpeg", data: PNG_B64 }])).toBe(400); // 표시와 실제가 다름
    expect(await bad([{ mimeType: "image/png", data: "not base64!" }])).toBe(400);
    expect(await bad("png")).toBe(400);
    const nodes = await (await request.get(`/api/nodes?sessionId=${session}`)).json();
    expect(nodes.nodes).toHaveLength(0);
  });

  test("글도 사진도 없으면 400", async ({ request }) => {
    const res = await request.post("/api/chat", { data: { sessionId: sid(), message: "  ", images: [] } });
    expect(res.status()).toBe(400);
  });

  test("이미지 id가 uuid 모양이 아니면 404 (경로 조작 방지)", async ({ request }) => {
    for (const id of ["x.png", "..%2F..%2Fpackage.json", "00000000-0000-0000-0000-000000000000.svg", "00000000-0000-0000-0000-000000000000.png"]) {
      expect((await request.get(`/api/images/${id}`)).status()).toBe(404);
    }
  });

  test("노드를 지우면 이미지 파일도 지워진다", async ({ request }) => {
    const node: MemoryNode = (await (await request.post("/api/chat", { data: { sessionId: sid(), message: "지울 사진", images: [png] } })).json()).node;
    const url = `/api/images/${node.images![0].id}`;
    expect((await request.get(url)).status()).toBe(200);
    expect((await request.delete(`/api/nodes/${node.id}`)).status()).toBe(200);
    expect((await request.get(url)).status()).toBe(404);
  });

  test("세션을 지우면 그 세션의 이미지 파일이 모두 지워지고, 다른 세션 것은 남는다", async ({ request }) => {
    const a = sid("a");
    const b = sid("b");
    const na: MemoryNode = (await (await request.post("/api/chat", { data: { sessionId: a, message: "a", images: [png, png] } })).json()).node;
    const nb: MemoryNode = (await (await request.post("/api/chat", { data: { sessionId: b, message: "b", images: [png] } })).json()).node;
    expect((await request.delete(`/api/sessions/${a}`)).status()).toBe(200);
    for (const i of na.images!) expect((await request.get(`/api/images/${i.id}`)).status()).toBe(404);
    expect((await request.get(`/api/images/${nb.images![0].id}`)).status()).toBe(200);
  });

  test("전체 초기화하면 모든 이미지 파일이 지워진다", async ({ request }) => {
    const node: MemoryNode = (await (await request.post("/api/chat", { data: { sessionId: sid(), message: "초기화 전", images: [png] } })).json()).node;
    expect((await request.post("/api/debug/reset-all")).status()).toBe(200);
    expect((await request.get(`/api/images/${node.images![0].id}`)).status()).toBe(404);
  });

  test("다음 대화로 넘어가도 앞 대화의 사진 사실이 이어지고 노드 순서가 유지된다", async ({ request }) => {
    const session = sid("seq");
    await request.post("/api/chat", { data: { sessionId: session, message: "첫 대화", images: [png] } });
    const second = await request.post("/api/chat", { data: { sessionId: session, message: "두 번째" } });
    expect(second.status()).toBe(200);
    const nodes: MemoryNode[] = (await (await request.get(`/api/nodes?sessionId=${session}`)).json()).nodes;
    expect(nodes.map((n) => n.order)).toEqual([1, 2]);
    expect(nodes[0].images).toHaveLength(1);
    expect(nodes[1].images).toBeUndefined();
  });
});
