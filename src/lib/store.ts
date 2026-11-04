import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Store } from "./types";

// 1단계: 저장소는 data/store.json 하나. 화면은 읽기만 한다.
const STORE_PATH = path.join(process.cwd(), "data", "store.json");

export async function readStore(): Promise<Store> {
  const raw = await readFile(STORE_PATH, "utf8");
  return JSON.parse(raw) as Store;
}
