import type {
  Insight,
  Meaning,
  MemoryNode,
  ModelPurpose,
  PersonaScope,
  RemModeId,
} from "../types.ts";

export interface RemContext {
  runId: string;
  sessionId: string;
  scope?: PersonaScope;
  nodes: MemoryNode[];
  meanings: Meaning[];
  temperature: number;
  ask(
    prompt: string,
    opts?: {
      temperature?: number;
      systemInstruction?: string;
      purpose?: ModelPurpose;
    }
  ): Promise<{ text: string }>;
  markReading(nodeIds: number[]): Promise<void>;
  markMeaning(meaningIds: number[]): Promise<void>;
  shouldStop(): boolean;
  signal?: AbortSignal;
}

export interface RemMode {
  id: RemModeId;
  label: string;
  defaultTemperature: number;
  run(ctx: RemContext): Promise<Insight[]>;
}
