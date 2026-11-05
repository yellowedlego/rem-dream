// 첨부 이미지 검사(src/lib/images.ts) 검사.
// 실행: node --test tests/unit/images.unit.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_IMAGES, MAX_IMAGE_BYTES, checkImages, sniffMime } from "../../src/lib/images.ts";

const b64 = (bytes: number[], pad = 0) => Buffer.from([...bytes, ...new Array(pad).fill(0)]).toString("base64");
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPG = [0xff, 0xd8, 0xff, 0xe0];
const GIF = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

test("파일 맨 앞 바이트로 형식을 알아낸다", () => {
  assert.equal(sniffMime(Uint8Array.from(PNG)), "image/png");
  assert.equal(sniffMime(Uint8Array.from(JPG)), "image/jpeg");
  assert.equal(sniffMime(Uint8Array.from(GIF)), "image/gif");
  assert.equal(sniffMime(Uint8Array.from(WEBP)), "image/webp");
  assert.equal(sniffMime(Uint8Array.from([0x3c, 0x73, 0x76, 0x67])), null); // <svg
  assert.equal(sniffMime(new Uint8Array(0)), null);
});

test("이미지가 없으면(생략·null) 빈 목록으로 통과", () => {
  assert.deepEqual(checkImages(undefined), { ok: true, images: [] });
  assert.deepEqual(checkImages(null), { ok: true, images: [] });
  assert.deepEqual(checkImages([]), { ok: true, images: [] });
});

test("올바른 사진은 통과하고 실제 형식으로 돌려준다", () => {
  const r = checkImages([
    { mimeType: "image/png", data: b64(PNG, 16) },
    { mimeType: "image/jpeg", data: b64(JPG, 16) },
  ]);
  assert.ok(r.ok);
  assert.deepEqual(r.images.map((i) => i.mimeType), ["image/png", "image/jpeg"]);
});

test("장 수가 많거나, 배열이 아니거나, 모양이 틀리면 거절", () => {
  const one = { mimeType: "image/png", data: b64(PNG, 8) };
  assert.equal(checkImages(new Array(MAX_IMAGES + 1).fill(one)).ok, false);
  assert.equal(checkImages(new Array(MAX_IMAGES).fill(one)).ok, true);
  assert.equal(checkImages("x").ok, false);
  assert.equal(checkImages([{ mimeType: "image/png" }]).ok, false);
  assert.equal(checkImages([null]).ok, false);
});

test("허용하지 않는 형식(svg, pdf 등)은 거절", () => {
  assert.equal(checkImages([{ mimeType: "image/svg+xml", data: b64([0x3c, 0x73, 0x76, 0x67], 8) }]).ok, false);
  assert.equal(checkImages([{ mimeType: "application/pdf", data: b64(PNG, 8) }]).ok, false);
});

test("표시한 형식과 실제 파일이 다르면 거절 (이름·MIME 위장)", () => {
  assert.equal(checkImages([{ mimeType: "image/jpeg", data: b64(PNG, 8) }]).ok, false);
  assert.equal(checkImages([{ mimeType: "image/png", data: b64([0x4d, 0x5a, 0x90, 0x00], 8) }]).ok, false); // 실행 파일 머리
});

test("base64가 아니거나 비어 있으면 거절", () => {
  assert.equal(checkImages([{ mimeType: "image/png", data: "" }]).ok, false);
  assert.equal(checkImages([{ mimeType: "image/png", data: "!!!not base64!!!" }]).ok, false);
  assert.equal(checkImages([{ mimeType: "image/png", data: "data:image/png;base64," + b64(PNG, 8) }]).ok, false);
  assert.equal(checkImages([{ mimeType: "image/png", data: b64(PNG, 8).slice(0, -1) }]).ok, false); // 길이가 4의 배수가 아님
});

test("한 장이 최대 크기를 넘으면 거절, 딱 맞으면 통과", () => {
  const over = b64(PNG, MAX_IMAGE_BYTES - PNG.length + 1);
  const exact = b64(PNG, MAX_IMAGE_BYTES - PNG.length);
  assert.equal(checkImages([{ mimeType: "image/png", data: over }]).ok, false);
  assert.equal(checkImages([{ mimeType: "image/png", data: exact }]).ok, true);
});
