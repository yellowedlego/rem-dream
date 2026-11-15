import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { PersonaProposal, RemRun } from "../types";

export interface ReplayStep {
  step: number;
  readingNodeIds: number[];
  insight: {
    id: number;
    content: string;
    strength: number;
    sourceNodeIds: number[];
  };
}

export interface ReplayData {
  id: string;
  sessionId?: string;
  mode?: string;
  scope?: string;
  title: string;
  createdAt: string;
  steps: ReplayStep[];
  proposal: Partial<PersonaProposal>;
  comparison?: {
    question: string;
    before: string;
    after: string;
  };
}

const REPLAY_DIR = path.join(process.cwd(), "data", "replays");

/**
 * Load all replay JSON files from `data/replays` directory.
 */
export async function loadAllReplays(): Promise<ReplayData[]> {
  try {
    await fs.mkdir(REPLAY_DIR, { recursive: true });
    const files = await fs.readdir(REPLAY_DIR);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));
    const results: ReplayData[] = [];

    for (const file of jsonFiles) {
      const full = path.join(REPLAY_DIR, file);
      const content = await fs.readFile(full, "utf8");
      try {
        const parsed = JSON.parse(content) as ReplayData;
        results.push(parsed);
      } catch {
        // Skip malformed
      }
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Retrieve a specific replay by its id.
 */
export async function getReplayById(id: string): Promise<ReplayData | null> {
  const all = await loadAllReplays();
  return all.find((r) => r.id === id) ?? null;
}
