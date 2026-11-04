import "server-only";
import { getEnv, getLiveApiKey } from "@/lib/env";
import { generateMockResponse } from "./mock";
import { addModelCall } from "@/lib/store";

export interface CallModelOptions {
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  purpose: "chat" | "rem-step" | "rem-proposal";
  runId?: string;
  model?: string;
}

export interface CallModelResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  ms: number;
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
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const requestBody: Record<string, unknown> = {
        contents: [
          {
            role: "user",
            parts: [{ text: opts.prompt }],
          },
        ],
        generationConfig: {
          temperature,
        },
      };

      if (opts.systemInstruction && opts.systemInstruction.trim()) {
        requestBody.systemInstruction = {
          parts: [{ text: opts.systemInstruction.trim() }],
        };
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
      resultText = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";

      inputTokens = data.usageMetadata?.promptTokenCount ?? estimateTokens(opts.prompt + (opts.systemInstruction || ""));
      outputTokens = data.usageMetadata?.candidatesTokenCount ?? estimateTokens(resultText);
    }
  } catch (err) {
    elapsedMs = Math.round(performance.now() - startTime);
    callError = err instanceof Error ? err.message : String(err);
  } finally {
    try {
      await addModelCall({
        purpose: opts.purpose,
        runId: opts.runId ?? null,
        model: env.isMock ? `mock-${model}` : model,
        temperature,
        prompt: opts.prompt,
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
    throw new Error(callError);
  }

  return {
    text: resultText,
    inputTokens,
    outputTokens,
    ms: elapsedMs,
  };
}
