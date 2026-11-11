import { test, expect, type APIRequestContext } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Profile } from "../src/lib/types";

// 내 AI: 프로필 만들기 / 비교 대화 / 메일(가짜) / 기록 관리 (가짜 모델 모드)

const sid = (p = "me") => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function seed(request: APIRequestContext, session: string, messages: string[]) {
  for (const message of messages) {
    expect((await request.post("/api/chat", { data: { sessionId: session, message } })).status()).toBe(200);
  }
}
async function make(request: APIRequestContext, session: string, relation = "friend"): Promise<Profile> {
  const res = await request.post("/api/profiles", { data: { sessionId: session, relation } });
  expect(res.status()).toBe(200);
  return (await res.json()).profile;
}

test.describe("내 AI 프로필", () => {
  test("대화로 프로필을 만들면 말투·위키·사전 프롬프트가 생기고, 목록에서 다시 읽힌다", async ({ request }) => {
    const session = sid();
    await seed(request, session, ["오늘 수학 시험 망함 ㅋㅋ", "떡볶이 먹고 싶어", "동아리 전시 준비 중이야 ㅋㅋ"]);
    const p = await make(request, session, "mentor");
    expect(p.sessionId).toBe(session);
    expect(p.relation).toBe("mentor");
    expect(p.style.polite).toBe(false);
    expect(p.style.laughs).toBe(true);
    expect(p.wiki.length).toBeGreaterThan(0);
    expect(p.prompt).toContain("나의 멘토야");
    expect(p.prompt).toContain("반말로 편하게");
    expect(p.prompt.length).toBeLessThanOrEqual(600);

    const list = await (await request.get(`/api/profiles?sessionId=${session}`)).json();
    expect(list.profiles.map((x: Profile) => x.id)).toEqual([p.id]);
  });

  test("기록이 없는 세션은 404, 잘못된 관계는 400", async ({ request }) => {
    expect((await request.post("/api/profiles", { data: { sessionId: sid("empty") } })).status()).toBe(404);
    expect((await request.post("/api/profiles", { data: { sessionId: sid(), relation: "boss" } })).status()).toBe(400);
    expect((await request.post("/api/profiles", { data: {} })).status()).toBe(400);
  });

  test("비교: 두 AI가 각각 답하고, 관련 있는 말이면 위키 칸을 찾아 내 AI에게만 건넨다", async ({ request }) => {
    const session = sid();
    await seed(request, session, ["떡볶이 먹으면 기분이 풀려", "오늘 피곤해"]);
    const p = await make(request, session);
    const ddeok = p.wiki.find((w) => w.body.includes("떡볶이"))!;
    expect(ddeok).toBeTruthy();

    const res = await request.post(`/api/profiles/${p.id}/compare`, { data: { message: "떡볶이 먹으러 갈까" } });
    expect(res.status()).toBe(200);
    const r = await res.json();
    expect(r.looked).toContain(ddeok.id);
    expect(r.basic).toBeTruthy();
    expect(r.personal).toContain(ddeok.title.slice(0, 4)); // 가짜 모델은 찾은 칸 제목을 꺼내 말한다
    expect(r.basic).not.toBe(r.personal);

    // 관련 없는 말이면 아무 칸도 찾지 않는다
    const none = await (await request.post(`/api/profiles/${p.id}/compare`, { data: { message: "날씨 좋다" } })).json();
    expect(none.looked).toEqual([]);
  });

  test("비교: 빈 말 400, 너무 긴 말 413, 없는 프로필 404", async ({ request }) => {
    const session = sid();
    await seed(request, session, ["안녕"]);
    const p = await make(request, session);
    expect((await request.post(`/api/profiles/${p.id}/compare`, { data: { message: " " } })).status()).toBe(400);
    expect((await request.post(`/api/profiles/${p.id}/compare`, { data: { message: "가".repeat(1001) } })).status()).toBe(413);
    expect((await request.post(`/api/profiles/999999/compare`, { data: { message: "안녕" } })).status()).toBe(404);
  });

  test("메일(가짜 모드): 동의와 주소를 검사하고, 주소는 가려서만 기록하고, 3번까지만 보낸다", async ({ request }) => {
    const session = sid();
    await seed(request, session, ["안녕 반가워"]);
    const p = await make(request, session);
    const send = (data: unknown) => request.post(`/api/profiles/${p.id}/mail`, { data });

    expect((await request.get("/api/mail")).ok()).toBe(true);
    expect((await (await request.get("/api/mail")).json()).ready).toBe(true);
    expect((await send({ to: "visitor@example.com" })).status()).toBe(400); // 동의 없음
    expect((await send({ to: "not-mail", consent: true })).status()).toBe(400);
    expect((await send({ to: "a@b.com\nBcc: x@y.com", consent: true })).status()).toBe(400);

    const ok = await send({ to: "visitor@example.com", consent: true });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).to).toBe("v***@example.com");

    // 가짜 모드는 outbox에 파일로 남기고, 내용에 프롬프트 전문이 있다
    const outbox = path.join(process.cwd(), "data", "runtime-test", "outbox");
    const files = (await fs.readdir(outbox)).sort();
    const last = JSON.parse(await fs.readFile(path.join(outbox, files[files.length - 1]), "utf8"));
    expect(last.to).toBe("visitor@example.com");
    expect(last.text).toContain(p.prompt);
    expect(last.html).toContain("나와 말이 잘 통하는");

    // 저장소에는 원래 주소가 없다
    const rec = await (await request.get("/api/admin/records")).json();
    expect(JSON.stringify(rec)).not.toContain("visitor@example.com");
    expect(rec.mails.some((m: { to: string }) => m.to === "v***@example.com")).toBe(true);

    expect((await send({ to: "visitor@example.com", consent: true })).status()).toBe(200);
    expect((await send({ to: "visitor@example.com", consent: true })).status()).toBe(200);
    expect((await send({ to: "visitor@example.com", consent: true })).status()).toBe(429);
  });
});

test.describe("붙여 넣은 AI 대화 기록", () => {
  test("이름표가 있는 대화를 넣어도 원문은 그대로 덮이고, 프로필의 내 말투는 내 말에서만 센다", async ({ request }) => {
    const session = sid("paste");
    const text =
      "나: 오늘 시험 망함 ㅋㅋ\nGemini: 시험이 어려우셨군요. 다음 시험을 위해 오답 노트를 작성해 보시는 것을 추천드립니다.\n나: 배고파 ㅋㅋ\nGemini: 맛있는 식사를 하시면 기분이 나아지실 거예요.";
    const res = await request.post("/api/story", { data: { sessionId: session, text } });
    expect(res.status()).toBe(200);
    const p = await make(request, session);
    // Gemini의 존댓말이 섞였지만 내 말(반말·ㅋㅋ)만으로 센다
    expect(p.style.polite).toBe(false);
    expect(p.style.laughs).toBe(true);
  });
});

test.describe("기록 관리", () => {
  test("세션을 지우면 프로필·메일 기록까지 함께 지워진다", async ({ request }) => {
    const session = sid("del");
    await seed(request, session, ["지울 기록"]);
    const p = await make(request, session);
    await request.post(`/api/profiles/${p.id}/mail`, { data: { to: "del@example.com", consent: true } });
    expect((await request.delete(`/api/sessions/${session}`)).status()).toBe(200);
    expect((await (await request.get(`/api/profiles?sessionId=${session}`)).json()).profiles).toEqual([]);
    const rec = await (await request.get("/api/admin/records")).json();
    expect(rec.sessions.some((s: { sessionId: string }) => s.sessionId === session)).toBe(false);
    expect(rec.mails.some((m: { sessionId: string }) => m.sessionId === session)).toBe(false);
  });

  test("오래된 기록 지우기: 기준보다 최근 것은 남고, 0시간이면 전부 지운다", async ({ request }) => {
    const session = sid("prune");
    await seed(request, session, ["방금 남긴 기록"]);
    const keep = await (await request.post("/api/admin/prune", { data: { olderThanHours: 1 } })).json();
    expect(keep.removed).not.toContain(session);
    expect((await request.post("/api/admin/prune", { data: { olderThanHours: -1 } })).status()).toBe(400);
    const all = await (await request.post("/api/admin/prune", { data: { olderThanHours: 0 } })).json();
    expect(all.removed).toContain(session);
    expect((await (await request.get("/api/admin/records")).json()).sessions).toEqual([]);
  });

  test("메일 기록만 지우기", async ({ request }) => {
    const session = sid("mails");
    await seed(request, session, ["메일 기록"]);
    const p = await make(request, session);
    await request.post(`/api/profiles/${p.id}/mail`, { data: { to: "m@example.com", consent: true } });
    expect((await request.delete("/api/admin/mails")).status()).toBe(200);
    const rec = await (await request.get("/api/admin/records")).json();
    expect(rec.mails).toEqual([]);
    expect(rec.sessions.find((s: { sessionId: string }) => s.sessionId === session)?.profiles).toBe(1);
  });
});
