export class PayloadTooLargeError extends Error {
  readonly status = 413;
  constructor(message = "Payload exceeds 8000 character limit") {
    super(message);
    this.name = "PayloadTooLargeError";
  }
}

export interface StorySpan {
  start: number;
  end: number;
  topic: string;
}

export interface SplitStoryOptions {
  maxNodes?: number;
  askModel?: boolean;
}

export interface SplitStoryResult {
  spans: StorySpan[];
  fallback: boolean;
}

/**
 * Extracts a concise human-readable topic (<= 30 characters) for a span slice.
 */
export function extractTopic(slice: string): string {
  const clean = slice.replace(/\s+/g, " ").trim();
  if (!clean) return "이야기 조각";

  // Take up to first sentence ending (. ? !)
  const match = clean.match(/^([^.?!]+)/);
  const candidate = (match ? match[1] : clean).trim();

  if (candidate.length <= 30) {
    return candidate;
  }
  return candidate.slice(0, 27) + "...";
}

/**
 * Validates that spans cover [0, text.length] strictly adjacent without gaps or overlaps.
 */
export function validateSpanIntegrity(text: string, spans: StorySpan[]): boolean {
  if (spans.length === 0) return text.length === 0;
  if (spans[0].start !== 0) return false;
  if (spans[spans.length - 1].end !== text.length) return false;

  for (let i = 0; i < spans.length; i++) {
    if (spans[i].start >= spans[i].end) return false;
    if (i > 0 && spans[i].start !== spans[i - 1].end) return false;
  }

  const concatenated = spans.map((s) => text.slice(s.start, s.end)).join("");
  return concatenated === text;
}

/**
 * Merges adjacent spans until span count <= maxNodes, preserving full coverage invariant.
 */
export function mergeSpansToCap(text: string, spans: StorySpan[], maxNodes: number): StorySpan[] {
  if (spans.length <= maxNodes) return spans;

  const result = [...spans];

  // Merge the shortest adjacent pair iteratively until result.length <= maxNodes
  while (result.length > maxNodes) {
    let minCombinedLen = Infinity;
    let bestIdx = 0;

    for (let i = 0; i < result.length - 1; i++) {
      const combinedLen =
        result[i].end - result[i].start + (result[i + 1].end - result[i + 1].start);
      if (combinedLen < minCombinedLen) {
        minCombinedLen = combinedLen;
        bestIdx = i;
      }
    }

    const mergedSpan: StorySpan = {
      start: result[bestIdx].start,
      end: result[bestIdx + 1].end,
      topic:
        result[bestIdx].topic ||
        extractTopic(text.slice(result[bestIdx].start, result[bestIdx + 1].end)),
    };

    result.splice(bestIdx, 2, mergedSpan);
  }

  return result;
}

/**
 * Slices text into strictly adjacent spans based on cut points.
 */
function spansFromCutPoints(text: string, cutPoints: number[]): StorySpan[] {
  const sortedCuts = Array.from(new Set(cutPoints.filter((c) => c > 0 && c < text.length))).sort(
    (a, b) => a - b
  );

  const indices = [0, ...sortedCuts, text.length];
  const spans: StorySpan[] = [];

  for (let i = 0; i < indices.length - 1; i++) {
    const start = indices[i];
    const end = indices[i + 1];
    const slice = text.slice(start, end);
    spans.push({
      start,
      end,
      topic: extractTopic(slice),
    });
  }

  // Merge any spans that are purely whitespace into adjacent non-whitespace spans
  let i = 0;
  while (i < spans.length && spans.length > 1) {
    const slice = text.slice(spans[i].start, spans[i].end);
    if (!slice.trim()) {
      if (i + 1 < spans.length) {
        spans[i + 1].start = spans[i].start;
        spans.splice(i, 1);
        continue;
      } else if (i > 0) {
        spans[i - 1].end = spans[i].end;
        spans.splice(i, 1);
        continue;
      }
    }
    i++;
  }

  return spans;
}

/**
 * Deterministic heuristic splitting using paragraphs -> sentences -> character chunks.
 */
export function heuristicSplit(text: string, maxNodes = 12): StorySpan[] {
  if (text.length === 0) return [];

  // 1. Try paragraph breaks (\n\n+)
  const paragraphCuts: number[] = [];
  const paraRegex = /\n\n+/g;
  let match: RegExpExecArray | null;
  while ((match = paraRegex.exec(text)) !== null) {
    const cut = match.index + match[0].length;
    if (cut > 0 && cut < text.length) {
      paragraphCuts.push(cut);
    }
  }

  if (paragraphCuts.length >= 1) {
    const paraSpans = spansFromCutPoints(text, paragraphCuts);
    if (paraSpans.length > 1) {
      return mergeSpansToCap(text, paraSpans, maxNodes);
    }
  }

  // 2. Try sentence breaks ([.?!] followed by whitespace or quote+whitespace)
  const sentenceCuts: number[] = [];
  const sentenceRegex = /[.?!]["']?\s+/g;
  while ((match = sentenceRegex.exec(text)) !== null) {
    const cut = match.index + match[0].length;
    if (cut > 0 && cut < text.length) {
      sentenceCuts.push(cut);
    }
  }

  if (sentenceCuts.length >= 1) {
    const sentenceSpans = spansFromCutPoints(text, sentenceCuts);
    if (sentenceSpans.length > 1) {
      return mergeSpansToCap(text, sentenceSpans, maxNodes);
    }
  }

  // 3. Delimiter fallback: Chunk slicing by characters
  const targetNodes = Math.min(maxNodes, Math.max(2, Math.ceil(text.length / 400)));
  const chunkSize = Math.ceil(text.length / targetNodes);
  const chunkCuts: number[] = [];

  for (let pos = chunkSize; pos < text.length; pos += chunkSize) {
    // Try to snap to nearest space within +/- 40 chars
    let snappedCut = pos;
    const searchStart = Math.max(pos - 40, (chunkCuts[chunkCuts.length - 1] ?? 0) + 20);
    const searchEnd = Math.min(pos + 40, text.length - 20);
    const spaceIndex = text.indexOf(" ", searchStart);
    if (spaceIndex !== -1 && spaceIndex < searchEnd) {
      snappedCut = spaceIndex + 1;
    }
    if (snappedCut > (chunkCuts[chunkCuts.length - 1] ?? 0) && snappedCut < text.length) {
      chunkCuts.push(snappedCut);
    }
  }

  const chunkSpans = spansFromCutPoints(text, chunkCuts);
  return mergeSpansToCap(text, chunkSpans, maxNodes);
}

/**
 * Splits raw user story into strictly adjacent, gap-free, non-overlapping spans.
 * Invariant: spans.map(s => text.slice(s.start, s.end)).join("") === text
 */
export async function splitStory(
  text: string,
  options?: SplitStoryOptions
): Promise<SplitStoryResult> {
  const maxNodes = options?.maxNodes ?? 12;

  // Enforce input length limit
  if (text.length > 8000) {
    throw new PayloadTooLargeError("Payload exceeds 8000 character limit");
  }

  if (text.length === 0) {
    return { spans: [], fallback: true };
  }

  // Heuristic splitting (used in MODEL_MOCK=1 or as guaranteed fallback)
  const spans = heuristicSplit(text, maxNodes);

  // Guarantee coverage integrity
  if (!validateSpanIntegrity(text, spans)) {
    // Extreme safety net: single span covering entire text
    const singleSpan: StorySpan[] = [
      {
        start: 0,
        end: text.length,
        topic: extractTopic(text),
      },
    ];
    return { spans: singleSpan, fallback: true };
  }

  return { spans, fallback: true };
}
