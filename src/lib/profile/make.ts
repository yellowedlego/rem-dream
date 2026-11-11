import "server-only";
import { getEnv } from "@/lib/env";
import { callModelJson } from "@/lib/model/client";
import { PROFILE_SCHEMA, PROFILE_SYSTEM, buildProfilePrompt, type ProfileAnswer } from "@/lib/prompts/profile";
import { readStore, updateStore } from "@/lib/store";
import { splitSentences } from "@/lib/story/groups";
import { speakersOf } from "@/lib/story/speakers";
import type { MemoryNode, Profile, Relation, Store, WikiEntry } from "@/lib/types";
import { TIPS_MAX, WIKI_MAX, buildPrompt, inferStyle } from "./build";

/** 모델에 넣는 최근 조각 수 */
const PIECES_MAX = 40;

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/**
 * 노드 하나를 "내 말 / AI 말"로 나눈다.
 * 대화 노드는 그대로(user/ai). 붙여 넣은 대화 기록에서 나온 노드는 원문에서 [나]/[AI] 문장을 갈라 낸다.
 * (그냥 이야기였으면 내 말 = 노드 글, AI 말 = 이 앱의 짧은 반응)
 */
export function voicesOf(node: MemoryNode, store: Store): { me: string; ai: string } {
  const story = node.storyId ? store.stories.find((s) => s.id === node.storyId) : undefined;
  if (!story || !node.storySpans) return { me: node.user, ai: node.ai };
  const text = story.rawText;
  const sentences = splitSentences(text);
  const speakers = speakersOf(text, sentences);
  if (!speakers) return { me: node.user, ai: node.ai };
  const me: string[] = [];
  const ai: string[] = [];
  sentences.forEach((s, i) => {
    if (!node.storySpans!.some(([a, b]) => s.start >= a && s.end <= b)) return;
    (speakers[i] === "ai" ? ai : me).push(text.slice(s.start, s.end).trim());
  });
  return { me: me.join(" "), ai: ai.join(" ") };
}

function ruleProfile(nodes: MemoryNode[], store: Store, sessionId: string) {
  const meanings = store.meanings.filter((m) => m.sessionId === sessionId);
  let wiki: WikiEntry[];
  if (meanings.length > 0) {
    wiki = meanings.slice(-WIKI_MAX).map((m, i) => ({
      id: i + 1,
      title: clip(m.title, 16),
      body: clip(m.essence, 160),
      keywords: m.keywords.slice(0, 4),
      sourceNodeIds: m.nodeIds,
    }));
  } else {
    wiki = nodes.slice(-WIKI_MAX).map((n, i) => {
      const me = voicesOf(n, store).me || n.user;
      return {
        id: i + 1,
        title: clip(n.topic ?? me, 16),
        body: `나는 "${clip(me, 70)}"라고 했어.`,
        keywords: [],
        sourceNodeIds: [n.id],
      };
    });
  }
  const titles = wiki.slice(0, 3).map((w) => w.title);
  return {
    about: titles.length ? `나는 요즘 ${titles.join(", ")} 같은 이야기를 자주 해.` : "",
    tips: ["내가 길게 말하면 끝까지 듣고, 중요한 것 한두 가지만 짚어 줘.", "내가 전에 한 이야기와 이어지면 그걸 기억해서 말해 줘."],
    wiki,
  };
}

function checkAnswer(a: ProfileAnswer | null, nodes: MemoryNode[]) {
  if (!a || typeof a.about !== "string" || !Array.isArray(a.wiki)) return null;
  const wiki: WikiEntry[] = [];
  for (const w of a.wiki) {
    if (!w || typeof w.title !== "string" || typeof w.body !== "string" || !w.title.trim() || !w.body.trim()) continue;
    const ids = [...new Set((Array.isArray(w.nodes) ? w.nodes : []).filter((n) => Number.isInteger(n) && n >= 1 && n <= nodes.length))]
      .sort((x, y) => x - y)
      .map((n) => nodes[n - 1].id);
    wiki.push({
      id: wiki.length + 1,
      title: clip(w.title, 16),
      body: clip(w.body, 160),
      keywords: (Array.isArray(w.keywords) ? w.keywords : []).filter((k): k is string => typeof k === "string" && !!k.trim()).map((k) => clip(k, 12)).slice(0, 4),
      sourceNodeIds: ids,
    });
    if (wiki.length >= WIKI_MAX) break;
  }
  if (wiki.length === 0) return null;
  const tips = (Array.isArray(a.tips) ? a.tips : []).filter((t): t is string => typeof t === "string" && !!t.trim()).map((t) => clip(t, 90)).slice(0, TIPS_MAX);
  return { about: clip(a.about, 300), tips, wiki };
}

/** 세션의 대화·이야기·의미로 "내 AI" 프로필을 만들어 저장한다. 기록이 없으면 null */
export async function makeProfile(sessionId: string, relation: Relation): Promise<Profile | null> {
  const store = await readStore();
  const nodes = store.nodes.filter((n) => n.sessionId === sessionId).sort((a, b) => a.order - b.order).slice(-PIECES_MAX);
  if (nodes.length === 0) return null;

  const voices = nodes.map((n) => voicesOf(n, store));
  const style = inferStyle(voices.map((v) => v.me));
  const meanings = store.meanings.filter((m) => m.sessionId === sessionId);

  let parts: { about: string; tips: string[]; wiki: WikiEntry[] } | null = null;
  let method: Profile["method"] = "rule";
  if (!getEnv().isMock) {
    try {
      const answer = await callModelJson<ProfileAnswer>({
        prompt: buildProfilePrompt(
          voices.map((v) => ({ user: clip(v.me, 400), ai: clip(v.ai, 300) })),
          meanings.map((m) => ({ title: m.title, essence: m.essence })),
        ),
        systemInstruction: PROFILE_SYSTEM,
        temperature: 0.4,
        json: { schema: PROFILE_SCHEMA as unknown as Record<string, unknown> },
        purpose: "profile",
      });
      parts = checkAnswer(answer, nodes);
      if (parts) method = "ai";
    } catch (err) {
      console.warn("[profile] model failed, using rule profile:", err);
    }
  }
  if (!parts) parts = ruleProfile(nodes, store, sessionId);
  if (parts.tips.length === 0) parts.tips = ruleProfile(nodes, store, sessionId).tips;

  const prompt = buildPrompt({ relation, style, ...parts });
  return updateStore((s) => {
    if (!s.profiles) s.profiles = [];
    const profile: Profile = {
      id: s.profiles.reduce((m, p) => Math.max(m, p.id), 0) + 1,
      sessionId,
      createdAt: new Date().toISOString(),
      relation,
      style,
      ...parts!,
      prompt,
      method,
    };
    s.profiles.push(profile);
    return profile;
  });
}
