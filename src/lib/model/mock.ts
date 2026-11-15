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
  } else if (opts.purpose === "school-chat") {
    text = "우리 학교 친구들에게서 자주 들은 이야기인데, 혹시 비슷한 기분인가요? 언제든 편하게 이야기해 줘요.";
  } else if (opts.purpose === "rem-compare") {
    // Before/After REM compare probe
    let version = 1;
    const verMatch = sysPrompt.match(/\[버전\s*(\d+)\]/i) || prompt.match(/버전\s*(\d+)/i);
    if (verMatch) {
      version = parseInt(verMatch[1], 10);
    } else if (sysPrompt.includes("[참고사항]") || sysPrompt.includes("[말투]")) {
      version = 2;
    }

    if (version >= 2) {
      text = `[v${version}] 목표를 향해 부지런히 달리면서도 가끔은 벅차 보이는 사람이야. 해야 할 일이 많을 땐 우선순위를 정해서 하나씩 작게 나눠 해결해 나가면 좋겠어.`;
    } else {
      text = `[v1] 오늘 하루를 열심히 살아가는 따뜻한 사람이라고 생각해. 이야기 들려줘서 고마워.`;
    }
  } else if (opts.purpose === "compare") {
    // 비교 체험: 사전 프롬프트가 있는 쪽(내 AI)은 찾은 위키 칸을 꺼내 말하고, 기본 AI는 무난하게 답한다
    if (sysPrompt.includes("[나와 말이 잘 통하는 AI")) {
      const polite = sysPrompt.includes("존댓말로");
      const found = /\[기억 위키에서 찾은[^\n]*\]\n- ([^:\n]+):/.exec(sysPrompt)?.[1];
      text = found
        ? polite
          ? `${found} 이야기 기억나요. 그 뒤로 어떻게 됐어요?`
          : `${found} 얘기 기억나! 그 뒤로 어떻게 됐어?`
        : polite
          ? "그랬군요. 조금 더 이야기해 줄래요?"
          : "그랬구나. 조금 더 얘기해 줄래?";
    } else {
      text = "질문해 주셔서 감사합니다. 더 알려 주시면 도와드릴게요.";
    }
  } else if (opts.purpose === "rem-step") {
    // Generate deterministic insight strings
    if (prompt.includes("dream") || prompt.includes("짝") || prompt.includes("의미") || (opts.temperature && opts.temperature >= 1.0)) {
      if (prompt.includes("음식") || prompt.includes("떡볶이") || prompt.includes("급식") || prompt.includes("김치찌개")) {
        text = JSON.stringify({
          content: "음식 이야기를 할 때마다 하루의 기분이 눈에 띄게 밝아지며 활력을 얻는다.",
          strength: 0.88,
          sourceNodeIds: [1, 2],
        });
      } else {
        text = JSON.stringify({
          content: "일상의 소소한 순간들 속에서 예상치 못한 긍정적인 반전을 이끌어낸다.",
          strength: 0.85,
          sourceNodeIds: [1, 2],
        });
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
    // Extract available session node IDs from prompt if present
    const nodeMatch = prompt.match(/<사용 가능한 기억 노드 번호>([\s\S]*?)<\/사용 가능한 기억 노드 번호>/);
    let mockEvidenceNodeIds = [1, 2];
    if (nodeMatch) {
      const parsedIds = nodeMatch[1]
        .split(/[,;\s]+/)
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !Number.isNaN(n) && n > 0);
      if (parsedIds.length >= 2) {
        mockEvidenceNodeIds = [parsedIds[0], parsedIds[1]];
      }
    }

    // Generate deterministic persona proposals in 3-tier JSON format
    if (prompt.includes("음식") || prompt.includes("기운") || prompt.includes("dream") || prompt.includes("좋아하는")) {
      text = JSON.stringify({
        summary: "친구가 지치거나 힘들어할 때 좋아하는 음식 이야기를 자연스럽게 꺼내며 기분을 북돋우려 합니다.",
        proposedPrompt: "너는 관람객의 하루 이야기를 들어 주는 친절한 대화 상대야. 짧고 따뜻하게 답한다.\n상대가 급해 보이면 먼저 할 일을 작게 나눠 준다.\n맛있는 음식이나 좋아하는 것을 언급하며 기운을 북돋운다.",
        items: [
          {
            id: 1,
            change: { id: 1, kind: "moveStyle", axis: "curiosity", delta: 0.05 },
            reason: "관람객의 일상에 호기심 어린 관심을 표현합니다.",
            evidenceNodeIds: mockEvidenceNodeIds,
            sourceInsightIds: [1],
            sourceMeaningIds: [],
            status: "pending",
          },
          {
            id: 2,
            change: {
              id: 2,
              kind: "addNote",
              text: "친구와의 일이나 좋아하는 음식 이야기를 자연스럽게 꺼내며 기운을 북돋워 줘요.",
              cues: ["음식", "기운", "친구", "좋아하는"],
            },
            reason: "좋아하는 음식과 기분 전환에 대해 부드럽게 묻습니다.",
            evidenceNodeIds: mockEvidenceNodeIds,
            sourceInsightIds: [1],
            sourceMeaningIds: [],
            status: "pending",
          },
        ],
      });
    } else {
      text = JSON.stringify({
        summary: "상대가 시험이나 과제로 급해 보일 때 먼저 범위를 묻고 작게 쪼개어 정리해 주도록 바뀝니다.",
        proposedPrompt: "너는 관람객의 하루 이야기를 들어 주는 친절한 대화 상대야. 짧고 따뜻하게 답한다.\n상대가 급해 보이면 먼저 할 일을 작게 나눠 준다.",
        items: [
          {
            id: 1,
            change: { id: 1, kind: "moveStyle", axis: "warmth", delta: 0.05 },
            reason: "대화에서 따뜻한 위로가 필요해 보여 온기를 조금 더합니다.",
            evidenceNodeIds: mockEvidenceNodeIds,
            sourceInsightIds: [1],
            sourceMeaningIds: [],
            status: "pending",
          },
          {
            id: 2,
            change: {
              id: 2,
              kind: "addNote",
              text: "할 일이 많아 벅찰 때는 가장 먼저 할 수 있는 작은 일 하나를 제안해요.",
              cues: ["시험", "과제", "바빠", "급해"],
            },
            reason: "과제나 시험 상황에서 차근차근 나누어 대처하도록 돕습니다.",
            evidenceNodeIds: mockEvidenceNodeIds,
            sourceInsightIds: [1],
            sourceMeaningIds: [],
            status: "pending",
          },
        ],
      });
    }
  }

  const inputTokens = Math.max(1, Math.ceil((opts.prompt.length + (opts.systemInstruction?.length || 0)) / 2));
  const outputTokens = Math.max(1, Math.ceil(text.length / 2));
  const ms = Math.max(5, Math.round(performance.now() - start));

  return { text, inputTokens, outputTokens, ms };
}
