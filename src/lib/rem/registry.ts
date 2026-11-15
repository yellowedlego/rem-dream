import type { RemMode } from "./types.ts";
import type { RemModeId } from "../types.ts";
import { consolidateMode } from "./modes/consolidate.ts";
import { dreamMode } from "./modes/dream.ts";

const registry = new Map<string, RemMode>();

export function registerMode(mode: RemMode): void {
  registry.set(mode.id, mode);
}

export function getMode(id: RemModeId): RemMode | undefined {
  return registry.get(id);
}

export function listModes(): RemMode[] {
  return Array.from(registry.values());
}

// Auto-register built-in modes
registerMode(consolidateMode);
registerMode(dreamMode);
