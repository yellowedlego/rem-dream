import type { Insight } from "../../types.ts";
import type { RemContext, RemMode } from "../types.ts";
import { DREAM_SYSTEM_PROMPT, buildDreamPairPrompt } from "../../prompts/rem.ts";

const MAX_INSIGHTS = 6;

export const dreamMode: RemMode = {
  id: "dream",
  label: "꿈꾸기",
  defaultTemperature: 1.1,
  async run(ctx: RemContext): Promise<Insight[]> {
    const accumulated: { content: string; sourceNodeIds: number[] }[] = [];
    const nodes = ctx.nodes;

    if (nodes.length === 1) {
      const node = nodes[0];
      await ctx.markReading([node.id]);
      const prompt = `dream mode: <이번 기억 노드="${node.id}">\n사용자: ${node.user}\nAI: ${node.ai}\n</이번 기억>`;
      const res = await ctx.ask(prompt, {
        temperature: ctx.temperature,
        systemInstruction: DREAM_SYSTEM_PROMPT,
        purpose: "rem-step",
      });
      if (res && res.text) {
        accumulated.push({
          content: res.text.trim(),
          sourceNodeIds: [node.id],
        });
      }
    } else {
      // Pair nodes
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

        if (accumulated.length >= MAX_INSIGHTS) break;
      }
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
