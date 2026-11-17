import type { Insight } from "../../types.ts";
import type { RemContext, RemMode } from "../types.ts";
import { CONSOLIDATE_SYSTEM_PROMPT, buildConsolidateNodePrompt } from "../../prompts/rem.ts";

const MAX_INSIGHTS = 6;

export const consolidateMode: RemMode = {
  id: "consolidate",
  label: "기억 정리",
  defaultTemperature: 0.7,
  async run(ctx: RemContext): Promise<Insight[]> {
    const accumulated: { content: string; sourceNodeIds: number[] }[] = [];
    await ctx.setTotal?.(ctx.nodes.length);

    for (const node of ctx.nodes) {
      if (ctx.shouldStop()) break;

      await ctx.markReading([node.id]);

      const prompt = buildConsolidateNodePrompt({
        node,
        previousInsights: accumulated.map((item, idx) => ({ id: idx + 1, content: item.content })),
        meanings: ctx.meanings,
      });

      const response = await ctx.ask(prompt, {
        temperature: ctx.temperature,
        systemInstruction: CONSOLIDATE_SYSTEM_PROMPT,
        purpose: "rem-step",
      });

      if (!response || !response.text) continue;

      const rawText = response.text.trim();
      let parsed = false;

      // Attempt to parse JSON response
      if (rawText.startsWith("{") || rawText.startsWith("[")) {
        try {
          const json = JSON.parse(rawText);
          if (Array.isArray(json)) {
            for (const item of json) {
              if (item && typeof item.content === "string") {
                accumulated.push({
                  content: item.content.trim(),
                  sourceNodeIds: Array.isArray(item.sourceNodeIds) ? item.sourceNodeIds : [node.id],
                });
              }
            }
            parsed = true;
          } else if (json && Array.isArray(json.insights)) {
            for (const item of json.insights) {
              if (item && typeof item.content === "string") {
                accumulated.push({
                  content: item.content.trim(),
                  sourceNodeIds: Array.isArray(item.sourceNodeIds) ? item.sourceNodeIds : [node.id],
                });
              }
            }
            parsed = true;
          } else if (json && typeof json.content === "string") {
            accumulated.push({
              content: json.content.trim(),
              sourceNodeIds: Array.isArray(json.sourceNodeIds) ? json.sourceNodeIds : [node.id],
            });
            parsed = true;
          }
        } catch {
          // Fall through to plain text handling
        }
      }

      // Fallback for plain text response (e.g. from MODEL_MOCK=1)
      if (!parsed && rawText.length > 0) {
        accumulated.push({
          content: rawText,
          sourceNodeIds: [node.id],
        });
      }

      // Enforce max insights cap
      if (accumulated.length > MAX_INSIGHTS) {
        accumulated.splice(0, accumulated.length - MAX_INSIGHTS);
      }
    }

    const now = new Date().toISOString();
    return accumulated.map((item, index) => ({
      id: index + 1, // Runner will assign persistent store ID
      mode: "consolidate",
      sourceNodeIds: item.sourceNodeIds,
      content: item.content,
      createdAt: now,
    }));
  },
};
