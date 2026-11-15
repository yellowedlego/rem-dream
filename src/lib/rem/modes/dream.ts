import type { Insight, Meaning, MemoryNode } from "../../types.ts";
import type { RemContext, RemMode } from "../types.ts";
import { DREAM_SYSTEM_PROMPT, buildDreamPairPrompt } from "../../prompts/rem.ts";

const MAX_PAIRS = 3;

export function buildDreamMeaningPairPrompt(opts: {
  a: Meaning;
  b: Meaning;
}): string {
  return `<자료>
<A 의미="${opts.a.title}">
핵심: ${opts.a.essence}
키워드: ${opts.a.keywords.join(", ")}
</A>
<B 의미="${opts.b.title}">
핵심: ${opts.b.essence}
키워드: ${opts.b.keywords.join(", ")}
</B>
</자료>`;
}

export const dreamMode: RemMode = {
  id: "dream",
  label: "꿈꾸기",
  defaultTemperature: 1.2,
  async run(ctx: RemContext): Promise<Insight[]> {
    const accumulated: { content: string; sourceNodeIds: number[] }[] = [];
    const meanings = ctx.meanings || [];
    const nodes = ctx.nodes || [];

    if (meanings.length >= 2) {
      // Find cross-story pairs first, then same-story pairs
      const pairs: [Meaning, Meaning][] = [];

      // 1. Cross-story pairs
      for (let i = 0; i < meanings.length; i++) {
        for (let j = i + 1; j < meanings.length; j++) {
          if (meanings[i].storyId !== meanings[j].storyId) {
            pairs.push([meanings[i], meanings[j]]);
            if (pairs.length >= MAX_PAIRS) break;
          }
        }
        if (pairs.length >= MAX_PAIRS) break;
      }

      // 2. Same-story pairs to fill up to MAX_PAIRS if needed
      if (pairs.length < MAX_PAIRS) {
        for (let i = 0; i < meanings.length; i++) {
          for (let j = i + 1; j < meanings.length; j++) {
            if (meanings[i].storyId === meanings[j].storyId) {
              const alreadyPaired = pairs.some(
                ([a, b]) =>
                  (a.id === meanings[i].id && b.id === meanings[j].id) ||
                  (a.id === meanings[j].id && b.id === meanings[i].id)
              );
              if (!alreadyPaired) {
                pairs.push([meanings[i], meanings[j]]);
                if (pairs.length >= MAX_PAIRS) break;
              }
            }
          }
          if (pairs.length >= MAX_PAIRS) break;
        }
      }

      // Execute dream synthesis per pair
      for (const [m1, m2] of pairs) {
        if (ctx.shouldStop()) break;

        // Emit star constellation line connection marker
        await ctx.markMeaning([m1.id, m2.id]);

        const prompt = buildDreamMeaningPairPrompt({ a: m1, b: m2 });
        const res = await ctx.ask(prompt, {
          temperature: ctx.temperature,
          systemInstruction: DREAM_SYSTEM_PROMPT,
          purpose: "rem-step",
        });

        if (!res || !res.text) continue;
        const rawText = res.text.trim();
        let content = rawText;
        let strength = 0.8;

        if (rawText.startsWith("{")) {
          try {
            const parsed = JSON.parse(rawText);
            if (parsed.content && typeof parsed.content === "string") {
              content = parsed.content.trim();
            }
            if (typeof parsed.strength === "number") {
              strength = parsed.strength;
            }
          } catch {}
        }

        // Filter insights with strength < 0.3
        if (strength >= 0.3) {
          const combinedNodeIds = Array.from(new Set([...m1.nodeIds, ...m2.nodeIds]));
          accumulated.push({
            content,
            sourceNodeIds: combinedNodeIds.length > 0 ? combinedNodeIds : [1, 2],
          });
        }
      }
    } else if (nodes.length >= 2) {
      // Fallback to node pairing for legacy test compatibility
      for (let i = 0; i < nodes.length - 1; i += 2) {
        if (ctx.shouldStop()) break;
        const a = nodes[i];
        const b = nodes[i + 1] || nodes[0];

        await ctx.markReading([a.id, b.id]);
        const prompt = buildDreamPairPrompt({ a, b });
        const res = await ctx.ask(prompt, {
          temperature: ctx.temperature,
          systemInstruction: DREAM_SYSTEM_PROMPT,
          purpose: "rem-step",
        });

        if (!res || !res.text) continue;
        const rawText = res.text.trim();
        let content = rawText;

        if (rawText.startsWith("{")) {
          try {
            const json = JSON.parse(rawText);
            if (json && typeof json.content === "string") {
              content = json.content.trim();
            }
          } catch {}
        }

        accumulated.push({
          content,
          sourceNodeIds: [a.id, b.id],
        });

        if (accumulated.length >= MAX_PAIRS) break;
      }
    } else {
      throw new Error("최소 2개 이상의 의미(또는 대화 기억)가 필요합니다.");
    }

    const now = new Date().toISOString();
    return accumulated.map((item, index) => ({
      id: index + 1,
      mode: "dream",
      sourceNodeIds: item.sourceNodeIds,
      content: item.content,
      createdAt: now,
    }));
  },
};
