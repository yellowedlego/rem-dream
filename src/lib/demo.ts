import "server-only";
import { updateStore } from "@/lib/store";
import type { Meaning, MemoryNode, Story } from "@/lib/types";

// 예시 기억: 모델 없이(인터넷·키 없이) 세션 하나에 이야기·노드·의미(별)를 채운다.
// 네트워크가 막힌 컴퓨터에서도 별자리·내 AI 화면을 볼 수 있게 하는 용도.

interface Sample {
  pieces: { topic: string; user: string; ai: string }[];
  meanings: { title: string; essence: string; keywords: string[]; pieces: number[] }[];
}

const SAMPLES: Sample[] = [
  {
    pieces: [
      { topic: "수학 시험", user: "오늘 수학 수행평가 망함 ㅋㅋ 범위가 너무 넓었어.", ai: "범위가 넓으면 정말 막막했겠어요." },
      { topic: "떡볶이", user: "그래서 친구랑 떡볶이 먹고 기분 좀 풀었어.", ai: "떡볶이는 힐링 조합이죠!" },
      { topic: "동아리 전시", user: "요즘 동아리 전시 준비하는데 내가 프론트 맡아서 바빠 ㅋㅋ", ai: "프론트라니 멋져요, 많이 바쁘겠어요." },
      { topic: "밤샘", user: "어제는 화면 만들다가 새벽 두 시에 잤어.", ai: "그래도 재밌었나 봐요." },
    ],
    meanings: [
      { title: "시험 뒤엔 떡볶이", essence: "이 이야기는 시험이 망해도 친구와 맛있는 걸 먹으며 털어내는 사람임을 말해 줘요.", keywords: ["시험", "떡볶이", "친구"], pieces: [0, 1] },
      { title: "만드는 게 재밌다", essence: "이 이야기는 전시 화면을 만드느라 밤을 새우면서도 즐거워함을 말해 줘요.", keywords: ["전시", "프론트", "밤샘"], pieces: [2, 3] },
    ],
  },
  {
    pieces: [
      { topic: "진로 고민", user: "컴공 가고 싶은데 수학이 약해서 걱정돼.", ai: "수학은 차근차근 늘릴 수 있어요." },
      { topic: "좋아하는 것", user: "근데 난 그냥 뭔가 만드는 게 좋아. 전시 화면 만들 때 제일 재밌었어.", ai: "직접 만드는 경험이 소중하죠." },
      { topic: "해커톤", user: "해커톤은 좀 무서워 ㅋㅋ 그냥 친구들이랑 하는 게 편해.", ai: "편한 사람들과 하는 게 더 잘 되기도 해요." },
    ],
    meanings: [
      { title: "진로 앞 걱정", essence: "이 이야기는 좋아하는 길이 있지만 수학 때문에 불안해함을 말해 줘요.", keywords: ["진로", "컴공", "수학"], pieces: [0] },
      { title: "친구들과 만들기", essence: "이 이야기는 혼자 큰 무대보다 친구들과 편하게 만드는 방식을 선호함을 말해 줘요.", keywords: ["만들기", "친구", "해커톤"], pieces: [1, 2] },
      { title: "만드는 게 재밌다", essence: "이 이야기는 무언가를 직접 만들 때 가장 즐거워함을 말해 줘요.", keywords: ["만들기", "전시"], pieces: [1] },
    ],
  },
  {
    pieces: [
      { topic: "아침", user: "아침에 일어나는 게 제일 힘들어. 오 분만 더 하다가 늦어.", ai: "아침은 누구에게나 어렵죠." },
      { topic: "급식", user: "급식 메뉴가 떡볶이면 하루가 완전 달라져 ㅋㅋ", ai: "급식 떡볶이 날은 특별하죠." },
      { topic: "고양이", user: "집에 고양이가 있는데 걔 때문에 집에 가는 게 기다려져.", ai: "고양이가 기다려지는 이유가 되어 주네요." },
      { topic: "주말", user: "주말엔 아무것도 안 하고 누워서 영상 보는 게 좋아.", ai: "푹 쉬는 것도 중요해요." },
    ],
    meanings: [
      { title: "소소한 즐거움", essence: "이 이야기는 급식, 고양이처럼 작은 것에서 기운을 얻는 사람임을 말해 줘요.", keywords: ["급식", "떡볶이", "고양이"], pieces: [1, 2] },
      { title: "쉬고 싶은 몸", essence: "이 이야기는 아침과 주말에 쉬는 시간을 간절히 원함을 말해 줘요.", keywords: ["아침", "주말", "휴식"], pieces: [0, 3] },
    ],
  },
];

let cursor = 0;

/** 세션 하나에 예시 기억을 채운다. 몇 번째 예시인지 돌려 쓴다. 만든 별(의미) 수를 돌려준다 */
export async function addDemo(sessionId: string): Promise<{ nodes: number; meanings: number }> {
  const sample = SAMPLES[cursor++ % SAMPLES.length];
  return updateStore((store) => {
    const now = new Date().toISOString();
    const storyId = store.stories.reduce((m, s) => Math.max(m, s.id), 0) + 1;
    let nodeId = store.nodes.reduce((m, n) => Math.max(m, n.id), 0) + 1;
    let order = store.nodes.filter((n) => n.sessionId === sessionId).reduce((m, n) => Math.max(m, n.order), 0) + 1;

    // 원문 = 조각들을 이어 붙인 것. 조각마다 원문 속 구간을 적어 구간이 원문 전체를 빈틈없이 덮게 한다
    let rawText = "";
    const created: MemoryNode[] = sample.pieces.map((p) => {
      const start = rawText.length;
      rawText += p.user + "\n";
      return {
        id: nodeId++,
        sessionId,
        order: order++,
        createdAt: now,
        user: p.user,
        ai: p.ai,
        storyId,
        storySpans: [[start, rawText.length]],
        topic: p.topic,
      };
    });
    store.nodes.push(...created);
    const story: Story = { id: storyId, sessionId, rawText, nodeIds: created.map((n) => n.id), createdAt: now };
    store.stories.push(story);

    let meaningId = store.meanings.reduce((m, x) => Math.max(m, x.id), 0) + 1;
    const made: Meaning[] = sample.meanings.map((m) => ({
      id: meaningId++,
      storyId,
      sessionId,
      nodeIds: m.pieces.map((i) => created[i].id),
      title: m.title,
      essence: m.essence,
      keywords: m.keywords,
      createdAt: now,
    }));
    store.meanings.push(...made);
    return { nodes: created.length, meanings: made.length };
  });
}
