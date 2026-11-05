// 대화에 첨부하는 이미지의 약속과 검사 (서버·브라우저 둘 다 쓰는 순수 계산. Node 전용 모듈은 쓰지 않는다)
// 저장·읽기는 서버 전용 src/lib/uploads.ts, 브라우저에서 줄이는 일은 src/components/imageFiles.ts.

/** 한 번에 올릴 수 있는 장 수 */
export const MAX_IMAGES = 4;
/** 한 장의 최대 크기 (줄인 뒤의 바이트) */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** 받는 형식 */
export const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type ImageMime = (typeof IMAGE_MIMES)[number];
/** 글 없이 사진만 보냈을 때 노드의 유저 입력으로 남기는 표시 */
export const PHOTO_ONLY_TEXT = "(사진)";

/** 보내는 쪽(브라우저)이 서버에 주는 이미지 한 장 */
export interface IncomingImage {
  mimeType: string;
  /** base64 (data: 머리말 없이) */
  data: string;
}

export interface CheckedImage {
  mimeType: ImageMime;
  data: string;
  bytes: Uint8Array;
}

/** 파일 맨 앞 몇 바이트로 진짜 형식을 알아낸다 (이름·MIME 표시는 속일 수 있어서) */
export function sniffMime(b: Uint8Array): ImageMime | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return "image/gif";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

export const extOf = (mime: ImageMime) => (mime === "image/jpeg" ? "jpg" : mime.slice(6));

/** base64 글자 수로 미리 계산한 최대 길이 (큰 것을 풀어 보기 전에 거른다) */
const MAX_BASE64_CHARS = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8;

function decodeBase64(data: string): Uint8Array | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 !== 0) return null;
  try {
    const bin = atob(data);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export type ImagesCheck = { ok: true; images: CheckedImage[] } | { ok: false; error: string };

/**
 * 요청에 실려 온 이미지들을 검사한다. 하나라도 어기면 전체를 거절한다.
 * - 장 수 ≤ MAX_IMAGES, 장당 ≤ MAX_IMAGE_BYTES
 * - 올바른 base64이고 실제 파일 모양(JPEG·PNG·WebP·GIF)이 표시한 형식과 같음
 */
export function checkImages(input: unknown): ImagesCheck {
  if (input === undefined || input === null) return { ok: true, images: [] };
  if (!Array.isArray(input)) return { ok: false, error: "images must be an array" };
  if (input.length > MAX_IMAGES) return { ok: false, error: `사진은 한 번에 ${MAX_IMAGES}장까지 보낼 수 있어요.` };
  const images: CheckedImage[] = [];
  for (const raw of input) {
    const it = raw as Partial<IncomingImage> | null;
    if (!it || typeof it.mimeType !== "string" || typeof it.data !== "string") {
      return { ok: false, error: "각 사진은 mimeType과 data(base64)가 있어야 해요." };
    }
    if (!(IMAGE_MIMES as readonly string[]).includes(it.mimeType)) {
      return { ok: false, error: "JPEG, PNG, WebP, GIF 사진만 보낼 수 있어요." };
    }
    if (it.data.length > MAX_BASE64_CHARS) {
      return { ok: false, error: `사진 한 장은 ${MAX_IMAGE_BYTES / 1024 / 1024}MB까지 보낼 수 있어요.` };
    }
    const bytes = decodeBase64(it.data);
    if (!bytes || bytes.length === 0) return { ok: false, error: "사진 데이터를 읽을 수 없어요." };
    if (bytes.length > MAX_IMAGE_BYTES) {
      return { ok: false, error: `사진 한 장은 ${MAX_IMAGE_BYTES / 1024 / 1024}MB까지 보낼 수 있어요.` };
    }
    const real = sniffMime(bytes);
    if (real !== it.mimeType) return { ok: false, error: "사진 파일이 표시한 형식과 달라요." };
    images.push({ mimeType: real, data: it.data, bytes });
  }
  return { ok: true, images };
}
