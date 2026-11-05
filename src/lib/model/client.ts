import "server-only";
import { getEnv, getLiveApiKey } from "@/lib/env";
import { generateMockResponse } from "./mock";
import { addModelCall } from "@/lib/store";
import type { ModelPurpose } from "@/lib/types";

/** 대화 기록 한 칸 (모델 쪽 역할 이름은 Gemini 규칙대로 "model") */
export interface ChatTurn {
  role: "user" | "model";
  text: string;
}

export interface CallModelOptions {
  /** 이번에 보낼 사용자 쪽 글 */
  prompt: string;
  systemInstruction?: string;
  /** 이번 글 앞에 넣을 대화 기록 (오래된 것부터) */
  history?: ChatTurn[];
  /** 이번 글에 함께 보내는 이미지 (이미 검사를 통과한 것. base64) */
  images?: { mimeType: string; data: string }[];
  temperature?: number;
  maxOutputTokens?: number;
  /** JSON으로 받기: 스키마를 주면 모델이 그 모양으로만 답한다 (Gemini responseSchema) */
  json?: { schema: Record<string, unknown> };
  purpose: ModelPurpose;
  runId?: string;
  model?: string;
}

export interface CallModelResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  ms: number;
}

/** 화면에 그대로 보여 줘도 되는 짧은 오류 (원문은 ModelCall.error에만 남긴다) */
export class ModelCallError extends Error {
  constructor(
    message: string,
    readonly detail: string,
  ) {
    super(message);
    this.name = "ModelCallError";
  }
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjkCount = 0;
  let otherCount = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if ((code >= 0xac00 && code <= 0xd7af) || (code >= 0x4e00 && code <= 0x9fff)) {
      cjkCount++;
    } else {
      otherCount++;
    }
  }
  return Math.max(1, Math.ceil(cjkCount + otherCount / 3.5));
}

/** 모델 오류 원문에서 키처럼 보이는 값을 지운다 (기록에 남기기 전에) */
function scrub(text: string): string {
  return text.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[key]").slice(0, 1000);
}

export async function callModel(opts: CallModelOptions): Promise<CallModelResult> {
  const env = getEnv();
  const model = opts.model || env.geminiModel;
  const temperature = opts.temperature ?? 0.7;
  const startTime = performance.now();

  let resultText = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let elapsedMs = 0;
  let callError: string | null = null;

  try {
    if (env.isMock) {
      const mockRes = await generateMockResponse({
        prompt: opts.prompt,
        systemInstruction: opts.systemInstruction,
        temperature,
        purpose: opts.purpose,
        runId: opts.runId,
      });
      resultText = mockRes.text;
      inputTokens = mockRes.inputTokens;
      outputTokens = mockRes.outputTokens;
      elapsedMs = mockRes.ms;
    } else {
      const apiKey = getLiveApiKey();
      // 키는 주소(쿼리)가 아니라 헤더로 보낸다: 주소는 서버·프록시 기록에 남기 쉽다
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

      const contents = [
        ...(opts.history ?? [])
          .filter((t) => t.text.trim())
          .map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
        {
          role: "user",
          parts: [
            { text: opts.prompt },
            ...(opts.images ?? []).map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
          ],
        },
      ];

      const generationConfig: Record<string, unknown> = { temperature };
      if (opts.maxOutputTokens) generationConfig.maxOutputTokens = opts.maxOutputTokens;
      if (opts.json) {
        generationConfig.responseMimeType = "application/json";
        generationConfig.responseSchema = opts.json.schema;
      }

      const requestBody: Record<string, unknown> = { contents, generationConfig };
      if (opts.systemInstruction && opts.systemInstruction.trim()) {
        requestBody.systemInstruction = { parts: [{ text: opts.systemInstruction.trim() }] };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(30000),
      });

      elapsedMs = Math.round(performance.now() - startTime);

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`Gemini API error (HTTP ${res.status}): ${errorText || res.statusText}`);
      }

      const data = await res.json();
      resultText =
        data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
      if (!resultText) {
        const reason = data.candidates?.[0]?.finishReason ?? data.promptFeedback?.blockReason ?? "empty";
        throw new Error(`Gemini returned no text (${reason})`);
      }

      inputTokens =
        data.usageMetadata?.promptTokenCount ??
        estimateTokens(opts.prompt + (opts.systemInstruction || "") + (opts.history ?? []).map((t) => t.text).join("")) +
          (opts.images?.length ?? 0) * 258;
      outputTokens = data.usageMetadata?.candidatesTokenCount ?? estimateTokens(resultText);
    }
  } catch (err) {
    elapsedMs = Math.round(performance.now() - startTime);
    callError = scrub(err instanceof Error ? err.message : String(err));
  } finally {
    try {
      await addModelCall({
        purpose: opts.purpose,
        runId: opts.runId ?? null,
        model: env.isMock ? `mock-${model}` : model,
        temperature,
        // 이미지 데이터(base64)는 기록에 남기지 않고 장 수만 적는다
        prompt: opts.images?.length ? `[이미지 ${opts.images.length}장] ${opts.prompt}` : opts.prompt,
        response: resultText,
        inputTokens: callError ? null : inputTokens,
        outputTokens: callError ? null : outputTokens,
        ms: elapsedMs,
        error: callError,
      });
    } catch (logErr) {
      console.error("Failed to persist ModelCall record in store:", logErr);
    }
  }

  if (callError) {
    throw new ModelCallError("모델 응답을 받지 못했어요. 잠시 뒤 다시 시도해 주세요.", callError);
  }

  return {
    text: resultText,
    inputTokens,
    outputTokens,
    ms: elapsedMs,
  };
}

/**
 * JSON으로 받아서 파싱까지 한다. 모양이 틀리면(파싱 실패) ModelCallError를 던진다.
 * 내용 검증(번호 범위 등)은 부르는 쪽이 한다.
 */
export async function callModelJson<T>(opts: CallModelOptions & { json: { schema: Record<string, unknown> } }): Promise<T> {
  const res = await callModel(opts);
  const raw = res.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ModelCallError("모델 응답 모양이 올바르지 않아요.", `JSON parse failed: ${raw.slice(0, 200)}`);
  }
}
