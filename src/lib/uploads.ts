import "server-only";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { extOf, type CheckedImage, type ImageMime } from "./images";
import { getStorePaths } from "./store";
import type { ImageRef } from "./types";

// 첨부 이미지는 실행용 저장소 폴더(data/runtime[-test]) 아래 uploads/에 파일로 둔다.
// 노드(MemoryNode.images)에는 번호(id)만 적고, 화면은 GET /api/images/[id]로 읽는다.

const uploadsDir = () => path.join(getStorePaths().runtimeDir, "uploads");

/** 파일 이름으로 쓰는 id: uuid + 확장자. 이 모양이 아니면 경로 조작으로 보고 거절한다 */
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/;
export const isImageId = (id: string) => ID_RE.test(id);

const MIME_BY_EXT: Record<string, ImageMime> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};
export const mimeOfId = (id: string): ImageMime => MIME_BY_EXT[id.slice(id.lastIndexOf(".") + 1)];

/** 검사를 통과한 이미지들을 파일로 저장하고 노드에 적을 참조를 돌려준다. 중간에 실패하면 이미 쓴 파일을 지운다 */
export async function saveImages(images: CheckedImage[]): Promise<ImageRef[]> {
  if (images.length === 0) return [];
  await fs.mkdir(uploadsDir(), { recursive: true });
  const refs: ImageRef[] = [];
  try {
    for (const img of images) {
      const id = `${randomUUID()}.${extOf(img.mimeType)}`;
      await fs.writeFile(path.join(uploadsDir(), id), img.bytes);
      refs.push({ id, mime: img.mimeType });
    }
  } catch (err) {
    await deleteImages(refs.map((r) => r.id));
    throw err;
  }
  return refs;
}

export async function readImage(id: string): Promise<Buffer | null> {
  if (!isImageId(id)) return null;
  try {
    return await fs.readFile(path.join(uploadsDir(), id));
  } catch {
    return null;
  }
}

/** 파일이 이미 없어도 오류로 치지 않는다 */
export async function deleteImages(ids: string[]): Promise<void> {
  await Promise.all(
    ids.filter(isImageId).map((id) => fs.rm(path.join(uploadsDir(), id), { force: true }).catch(() => {})),
  );
}

/** 전체 초기화: 업로드 폴더를 통째로 비운다 */
export async function clearUploads(): Promise<void> {
  await fs.rm(uploadsDir(), { recursive: true, force: true }).catch(() => {});
}
