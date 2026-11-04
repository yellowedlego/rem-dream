import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { MemoryNode, ModelCall, PersonaVersion, RemRun, Store } from "./types";

const SEED_STORE_PATH = path.join(process.cwd(), "data", "store.json");
// 실행용 저장소 폴더. 테스트는 REM_RUNTIME_DIR로 따로 둔다 (playwright.config.ts)
const RUNTIME_DIR = path.resolve(process.cwd(), process.env.REM_RUNTIME_DIR || path.join("data", "runtime"));
const RUNTIME_STORE_PATH = path.join(RUNTIME_DIR, "store.json");


export function getStorePaths() {
  return {
    seedPath: SEED_STORE_PATH,
    runtimeDir: RUNTIME_DIR,
    runtimePath: RUNTIME_STORE_PATH,
  };
}

// In-process promise queue mutex for serializing store mutations
let writeQueue: Promise<unknown> = Promise.resolve();

// Process-lifetime initialization promise
let initPromise: Promise<void> | null = null;

function recoverDanglingRuns(store: Store): boolean {
  let modified = false;
  if (Array.isArray(store.runs)) {
    for (const run of store.runs) {
      if (run.status === "running") {
        run.status = "error";
        run.error = run.error || "Server restarted while REM was running";
        run.finishedAt = run.finishedAt || new Date().toISOString();
        run.currentNodeIds = [];
        modified = true;
      }
    }
  }
  return modified;
}

async function atomicWriteStore(store: Store): Promise<void> {
  const targetDir = path.dirname(RUNTIME_STORE_PATH);
  await fs.mkdir(targetDir, { recursive: true });

  const randomSuffix = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  const tmpPath = path.join(targetDir, `store.json.tmp.${randomSuffix}`);
  const jsonContent = JSON.stringify(store, null, 2) + "\n";

  await fs.writeFile(tmpPath, jsonContent, "utf8");

  const maxRetries = 5;
  const retryDelayMs = 20;
  let attempts = 0;

  while (true) {
    try {
      await fs.rename(tmpPath, RUNTIME_STORE_PATH);
      break;
    } catch (err: unknown) {
      attempts++;
      const isLockError =
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err.code === "EPERM" || err.code === "EBUSY" || err.code === "EACCES");
      if (attempts > maxRetries || !isLockError) {
        try {
          await fs.unlink(tmpPath);
        } catch {
          // ignore unlink error
        }
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempts));
    }
  }
}

async function doEnsureStore(): Promise<void> {
  const targetDir = path.dirname(RUNTIME_STORE_PATH);
  await fs.mkdir(targetDir, { recursive: true });

  let exists = false;
  try {
    await fs.access(RUNTIME_STORE_PATH);
    exists = true;
  } catch {
    exists = false;
  }

  if (!exists) {
    // Initialize runtime store from read-only seed
    const rawSeed = await fs.readFile(SEED_STORE_PATH, "utf8");
    const seedStore: Store = JSON.parse(rawSeed);
    recoverDanglingRuns(seedStore);
    if (!seedStore.calls) seedStore.calls = [];
    if (!seedStore.proposals) seedStore.proposals = [];
    if (!seedStore.runs) seedStore.runs = [];
    if (!seedStore.stories) seedStore.stories = [];
    if (!seedStore.meanings) seedStore.meanings = [];
    await atomicWriteStore(seedStore);
  } else {
    // Runtime store exists: check for orphan runs left by previous server crash
    try {
      const rawRuntime = await fs.readFile(RUNTIME_STORE_PATH, "utf8");
      const store: Store = JSON.parse(rawRuntime);
      let changed = false;
      if (!store.calls) { store.calls = []; changed = true; }
      if (!store.proposals) { store.proposals = []; changed = true; }
      if (!store.runs) { store.runs = []; changed = true; }
      if (!store.stories) { store.stories = []; changed = true; }
      if (!store.meanings) { store.meanings = []; changed = true; }
      const runChanged = recoverDanglingRuns(store);
      if (changed || runChanged) {
        await atomicWriteStore(store);
      }
    } catch (err) {
      // Automatic fallback if runtime file is corrupted
      console.error("[store] Runtime store corrupted, restoring from seed:", err);
      const rawSeed = await fs.readFile(SEED_STORE_PATH, "utf8");
      const seedStore: Store = JSON.parse(rawSeed);
      recoverDanglingRuns(seedStore);
      if (!seedStore.calls) seedStore.calls = [];
      if (!seedStore.proposals) seedStore.proposals = [];
      if (!seedStore.runs) seedStore.runs = [];
      if (!seedStore.stories) seedStore.stories = [];
    if (!seedStore.meanings) seedStore.meanings = [];
      await atomicWriteStore(seedStore);
    }
  }
}

export async function ensureStore(): Promise<void> {
  if (!initPromise) {
    initPromise = doEnsureStore().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

export async function readStore(): Promise<Store> {
  await ensureStore();
  const maxRetries = 5;
  let attempts = 0;

  while (true) {
    try {
      const raw = await fs.readFile(RUNTIME_STORE_PATH, "utf8");
      const parsed = JSON.parse(raw) as Store;
      if (!parsed.stories) parsed.stories = [];
      if (!parsed.meanings) parsed.meanings = [];
      return parsed;
    } catch (err: unknown) {
      attempts++;
      const isLockError =
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err.code === "EPERM" || err.code === "EBUSY" || err.code === "EACCES");
      if (attempts > maxRetries || !isLockError) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 20 * attempts));
    }
  }
}

export async function updateStore<T>(
  updater: (store: Store) => Promise<T> | T
): Promise<T> {
  const execute = async (): Promise<T> => {
    await ensureStore();
    const store = await readStore();
    const result = await updater(store);
    await atomicWriteStore(store);
    return result;
  };

  const nextOp = writeQueue.then(execute, execute);
  writeQueue = nextOp.catch(() => {});
  return nextOp;
}

export async function addNode(
  sessionId: string,
  userText: string,
  aiText: string
): Promise<MemoryNode> {
  return updateStore((store) => {
    const maxId = store.nodes.reduce((max, n) => Math.max(max, n.id), 0);
    const nextId = maxId + 1;

    const sessionNodes = store.nodes.filter((n) => n.sessionId === sessionId);
    const maxOrder = sessionNodes.reduce((max, n) => Math.max(max, n.order), 0);
    const nextOrder = maxOrder + 1;

    const newNode: MemoryNode = {
      id: nextId,
      sessionId,
      order: nextOrder,
      createdAt: new Date().toISOString(),
      user: userText,
      ai: aiText,
    };

    store.nodes.push(newNode);
    return newNode;
  });
}

export async function addModelCall(
  callData: Omit<ModelCall, "id" | "at">
): Promise<ModelCall> {
  return updateStore((store) => {
    if (!store.calls) {
      store.calls = [];
    }
    const maxId = store.calls.reduce((max, c) => Math.max(max, c.id), 0);
    const newRecord: ModelCall = {
      ...callData,
      id: maxId + 1,
      at: new Date().toISOString(),
    };
    store.calls.push(newRecord);
    if (store.calls.length > 200) {
      store.calls = store.calls.slice(-200);
    }
    return newRecord;
  });
}

export async function getActivePersona(providedStore?: Store): Promise<PersonaVersion> {
  const store = providedStore ?? (await readStore());
  const found = store.personas.find((p) => p.version === store.activePersona);
  if (found) return found;
  if (store.personas.length > 0) return store.personas[0];
  return {
    version: 1,
    systemPrompt: "너는 관람객의 하루 이야기를 들어 주는 친절한 대화 상대야. 짧고 따뜻하게 답한다.",
    sourceInsightIds: [],
    approvedAt: new Date().toISOString(),
    parentVersion: null,
  };
}

export async function getActiveRun(
  sessionId?: string,
  providedStore?: Store
): Promise<RemRun | null> {
  const store = providedStore ?? (await readStore());
  const active = store.runs.find((r) => {
    if (r.status !== "running") return false;
    if (sessionId) return r.sessionId === sessionId;
    return true;
  });
  return active ?? null;
}

export async function resetStore(): Promise<Store> {
  return updateStore(async (store) => {
    const rawSeed = await fs.readFile(SEED_STORE_PATH, "utf8");
    const seed: Store = JSON.parse(rawSeed);
    store.nodes = seed.nodes;
    store.insights = seed.insights;
    store.personas = seed.personas;
    store.activePersona = seed.activePersona;
    store.proposals = seed.proposals ?? [];
    store.runs = seed.runs ?? [];
    store.calls = seed.calls ?? [];
    store.stories = seed.stories ?? [];
    store.meanings = seed.meanings ?? [];
    return store;
  });
}
