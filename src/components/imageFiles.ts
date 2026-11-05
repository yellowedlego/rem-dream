// 브라우저에서 사진 파일을 서버에 보낼 크기로 줄이는 일 (서버 쪽 검사는 src/lib/images.ts의 checkImages)
import { MAX_IMAGE_BYTES } from "@/lib/images";

/** 보내기 전 사진 한 장 (입력창 아래 작은 그림으로 보인다) */
export interface Attachment {
  id: string;
  name: string;
  /** 화면에 보여 줄 줄인 사진의 임시 주소 (URL.createObjectURL). 쓰고 나면 revokeAttachment로 반납한다 */
  previewUrl: string;
  mimeType: "image/jpeg";
  /** base64 (머리말 없이) */
  data: string;
}

/** 긴 변이 이보다 크면 줄인다 (모델·전송 비용과 속도를 지키려고) */
const MAX_SIDE = 1600;
/** 이 품질부터 시작해서 5MB를 넘으면 한 단계씩 낮춘다 */
const QUALITIES = [0.85, 0.7, 0.5];

let seq = 0;

const canvasToBlob = (c: HTMLCanvasElement, q: number) =>
  new Promise<Blob | null>((resolve) => c.toBlob(resolve, "image/jpeg", q));

const blobToBase64 = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

/** 사진 파일 → 긴 변 1600px 이하 JPEG. 읽을 수 없는 파일이면 사람이 읽을 수 있는 오류를 던진다 */
export async function prepareImage(file: File): Promise<Attachment> {
  if (!file.type.startsWith("image/")) throw new Error("사진 파일만 올릴 수 있어요.");
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error(`‘${file.name || "사진"}’은 읽을 수 없는 형식이에요. JPEG, PNG, WebP, GIF를 써 주세요.`);
  }
  try {
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k));
    const h = Math.max(1, Math.round(bmp.height * k));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("사진을 줄이지 못했어요.");
    ctx.fillStyle = "#fff"; // 투명한 PNG가 검게 나오지 않게
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    let blob: Blob | null = null;
    for (const q of QUALITIES) {
      blob = await canvasToBlob(canvas, q);
      if (blob && blob.size <= MAX_IMAGE_BYTES) break;
    }
    if (!blob || blob.size > MAX_IMAGE_BYTES) throw new Error("사진이 너무 커서 줄이지 못했어요.");
    return {
      id: `att-${Date.now().toString(36)}-${++seq}`,
      name: file.name || "사진",
      previewUrl: URL.createObjectURL(blob),
      mimeType: "image/jpeg",
      data: await blobToBase64(blob),
    };
  } finally {
    bmp.close();
  }
}

export const revokeAttachment = (a: Attachment) => URL.revokeObjectURL(a.previewUrl);

/** 끌어 온 것·붙여 넣은 것 중에 사진 파일만 */
export const imageFilesOf = (list: FileList | File[] | null | undefined): File[] =>
  Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));

/** 끌어 오는 중인 것에 파일이 들어 있는지 (글자를 끌 때는 반응하지 않게) */
export const hasFiles = (dt: DataTransfer | null) => !!dt && Array.from(dt.types).includes("Files");
