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
  /** 이 모드가 몇 단계로 돌지 알린다 (화면 진행 막대용). markReading/markMeaning 한 번 = 한 단계 */
  setTotal?(steps: number): Promise<void>;
  shouldStop(): boolean;
  signal?: AbortSignal;
}

export interface RemMode {
  id: RemModeId;
  label: string;
  defaultTemperature: number;
  run(ctx: RemContext): Promise<Insight[]>;
}
