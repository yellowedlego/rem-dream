import "server-only";

export interface EnvConfig {
  geminiApiKey: string;
  geminiModel: string;
  isMock: boolean;
}

export function getEnv(): EnvConfig {
  const isMock = process.env.MODEL_MOCK === "1" || process.env.MODEL_MOCK === "true";
  const geminiModel = process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash"; // 정식 출시(GA) Flash. 실제 값은 .env.local의 GEMINI_MODEL
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim() || "";

  return {
    geminiApiKey,
    geminiModel,
    isMock,
  };
}

export function getLiveApiKey(): string {
  const env = getEnv();
  if (env.isMock) {
    return "";
  }
  if (!env.geminiApiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Please set GEMINI_API_KEY in .env.local or set MODEL_MOCK=1 for offline testing."
    );
  }
  return env.geminiApiKey;
}
