import type { ModelPurpose } from "@/lib/types";

export interface MockModelOptions {
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  purpose: ModelPurpose;
  runId?: string;
}

export interface MockModelResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  ms: number;
}

export async function generateMockResponse(opts: MockModelOptions): Promise<MockModelResult> {
  const start = performance.now();
  // Simulate minimal tick for asynchronous fidelity
  await new Promise((resolve) => setTimeout(resolve, 5));

  const prompt = opts.prompt.trim();
  const sysPrompt = opts.systemInstruction?.trim() || "";
  let text = "";

  if (opts.purpose === "chat") {
    const isVerification = prompt.replace(/\s+/g, "").includes("나에대해어떻게생각해");

    if (isVerification) {
      if (sysPrompt.includes("음식") || sysPrompt.includes("기운") || sysPrompt.includes("좋아하는 것")) {
        // Persona v3 (Food & Comfort)
        text = "오늘도 많이 애쓴 사람이야. 열심히 하는 것도 좋지만, 좋아하는 맛있는 음식 챙겨 먹으면서 잠시 숨 돌리는 시간도 가졌으면 좋겠어.";
      } else if (sysPrompt.includes("작게 나눠") || sysPrompt.includes("할 일") || sysPrompt.includes("쪼개")) {
        // Persona v2 (Task-splitting)
        text = "목표를 향해 부지런히 달리면서도 가끔은 벅차 보이는 사람이야. 해야 할 일이 많을 땐 우선순위를 정해서 하나씩 작게 나눠 해결해 나가면 좋겠어.";
      } else {
        // Persona v1 (Baseline 따뜻한 경청)
        text = "오늘 하루를 열심히 살아가는 따뜻한 사람이라고 생각해. 이야기 들려줘서 고마워.";
      }
    } else if (prompt.includes("안녕") || prompt.includes("반가")) {
      text = "안녕하세요! 오늘 하루는 어떠셨나요?";
    } else if (prompt.includes("피곤") || prompt.includes("힘들") || prompt.includes("지쳐")) {
      if (sysPrompt.includes("음식") || sysPrompt.includes("기운")) {
        text = "오늘 정말 고생 많으셨어요. 좋아하는 따뜻한 음식 챙겨 드시고 푹 쉬세요.";
      } else if (sysPrompt.includes("작게 나눠")) {
        text = "많이 지치셨군요. 오늘은 꼭 해야 할 일 한 가지만 먼저 끝내고 쉬어 보는 건 어떨까요?";
      } else {
        text = "오늘 정말 고단했겠어요. 이야기 들려줘서 고맙고, 편안한 밤 보내세요.";
      }
    } else if (prompt.includes("시험") || prompt.includes("공부") || prompt.includes("과제")) {
      if (sysPrompt.includes("작게 나눠")) {
        text = "할 일이 많아 막막할 때는 범위를 작게 나눠서 하나씩 정리해 보세요.";
      } else {
        text = "준비하느라 수고 많았어요. 결과에 상관없이 최선을 다한 당신을 응원해요.";
      }
    } else {
      if (sysPrompt.includes("작게 나눠")) {
        text = "말씀 잘 들었어요. 복잡한 상황일수록 차근차근 작게 나눠서 생각해 보면 도움이 돼요.";
      } else if (sysPrompt.includes("음식") || sysPrompt.includes("기운")) {
        text = "말씀해 주셔서 감사해요. 맛있는 간식 드시면서 기운 내세요!";
      } else {
        text = "말씀해 주셔서 감사해요. 당신의 오늘 이야기를 귀담아듣고 있어요.";
      }
    }
  } else if (opts.purpose === "rem-step") {
    // Generate deterministic insight strings
    if (prompt.includes("dream") || prompt.includes("짝") || (opts.temperature && opts.temperature >= 1.0)) {
      if (prompt.includes("음식") || prompt.includes("떡볶이") || prompt.includes("급식") || prompt.includes("김치찌개")) {
        text = "음식 이야기를 할 때마다 하루의 기분이 눈에 띄게 밝아지며 활력을 얻는다.";
      } else {
        text = "일상의 소소한 순간들 속에서 예상치 못한 긍정적인 반전을 이끌어낸다.";
      }
    } else {
      // Consolidate mode
      if (prompt.includes("시험") || prompt.includes("급") || prompt.includes("피구") || prompt.includes("과제")) {
        text = "급한 일이 생기면 먼저 범위를 묻고 작게 나누려 한다.";
      } else if (prompt.includes("친구") || prompt.includes("다툰") || prompt.includes("연락") || prompt.includes("말다툼")) {
        text = "친구와의 일은 처음엔 짧게 말하지만 계속 신경 쓴다.";
      } else {
        text = "하루 동안 마주친 도전들을 되돌아보며 스스로 대처 방식을 정립해 간다.";
      }
    }
  } else if (opts.purpose === "rem-proposal") {
    // Generate deterministic persona proposals in JSON format
    if (prompt.includes("음식") || prompt.includes("기운") || prompt.includes("dream") || prompt.includes("좋아하는")) {
      text = JSON.stringify({
        summary: "친구가 지치거나 힘들어할 때 좋아하는 음식 이야기를 자연스럽게 꺼내며 기분을 북돋우려 합니다.",
        proposedPrompt: "너는 관람객의 하루 이야기를 들어 주는 친절한 대화 상대야. 짧고 따뜻하게 답한다.\n상대가 급해 보이면 먼저 할 일을 작게 나눠 준다.\n맛있는 음식이나 좋아하는 것을 언급하며 기운을 북돋운다."
      });
    } else {
      text = JSON.stringify({
        summary: "상대가 시험이나 과제로 급해 보일 때 먼저 범위를 묻고 작게 쪼개어 정리해 주도록 바뀝니다.",
        proposedPrompt: "너는 관람객의 하루 이야기를 들어 주는 친절한 대화 상대야. 짧고 따뜻하게 답한다.\n상대가 급해 보이면 먼저 할 일을 작게 나눠 준다."
      });
    }
  }

  const inputTokens = Math.max(1, Math.ceil((opts.prompt.length + (opts.systemInstruction?.length || 0)) / 2));
  const outputTokens = Math.max(1, Math.ceil(text.length / 2));
  const ms = Math.max(5, Math.round(performance.now() - start));

  return { text, inputTokens, outputTokens, ms };
}
