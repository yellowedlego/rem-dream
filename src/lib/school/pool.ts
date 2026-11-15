import "server-only";
import { readStore, updateStore } from "../store";
import type { Meaning, SchoolMeaning } from "../types";
import { anonymizeMeaning } from "./anonymize";

function grams(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of s.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (w.length === 1) continue;
    for (let i = 0; i + 2 <= w.length; i++) out.add(w.slice(i, i + 2));
  }
  return out;
}

function calculateSimilarity(
  aTitle: string,
  aKeywords: string[],
  bTitle: string,
  bKeywords: string[]
): number {
  // Title 2-gram similarity
  const gA = grams(aTitle);
  const gB = grams(bTitle);
  let titleIntersection = 0;
  for (const g of gA) {
    if (gB.has(g)) titleIntersection++;
  }
  const titleUnion = new Set([...gA, ...gB]).size;
  const titleSim = titleUnion > 0 ? titleIntersection / titleUnion : 0;

  // Keyword overlap
  const kwA = new Set(aKeywords.map((k) => k.toLowerCase()));
  const kwB = new Set(bKeywords.map((k) => k.toLowerCase()));
  let kwIntersection = 0;
  for (const k of kwA) {
    if (kwB.has(k)) kwIntersection++;
  }
  const minKwLen = Math.min(kwA.size, kwB.size);
  const kwSim = minKwLen > 0 ? kwIntersection / minKwLen : 0;

  return Math.max(titleSim, kwSim);
}

/**
 * Add a meaning to the school pool after anonymization.
 * If 60%+ similar to an existing school meaning, increments count and records sourceTag.
 */
export async function addMeaningToSchoolPool(
  meaning: Meaning,
  sourceTag: string
): Promise<SchoolMeaning | null> {
  return updateStore((store) => {
    if (!store.schoolMeanings) {
      store.schoolMeanings = [];
    }

    const maxId = store.schoolMeanings.reduce((max, m) => Math.max(max, m.id), 0);
    const candidate = anonymizeMeaning(meaning, sourceTag, maxId + 1);
    if (!candidate) return null;

    // Check for similarity >= 60% with existing pool items
    for (const existing of store.schoolMeanings) {
      const sim = calculateSimilarity(
        candidate.title,
        candidate.keywords,
        existing.title,
        existing.keywords
      );
      if (sim >= 0.6) {
        existing.count = (existing.count || 1) + 1;
        if (!existing.sourceTags) existing.sourceTags = [];
        if (!existing.sourceTags.includes(sourceTag)) {
          existing.sourceTags.push(sourceTag);
        }
        return existing;
      }
    }

    // Otherwise add as new
    store.schoolMeanings.push(candidate);
    return candidate;
  });
}

/**
 * Synchronous version for use inside an active updateStore transaction.
 */
export function pushToSchoolPoolSync(
  store: { schoolMeanings?: SchoolMeaning[] },
  meanings: Meaning[],
  sourceTag: string
): SchoolMeaning[] {
  if (!store.schoolMeanings) {
    store.schoolMeanings = [];
  }
  const added: SchoolMeaning[] = [];

  for (const meaning of meanings) {
    const maxId = store.schoolMeanings.reduce((max, m) => Math.max(max, m.id), 0);
    const candidate = anonymizeMeaning(meaning, sourceTag, maxId + 1);
    if (!candidate) continue;

    let matched = false;
    for (const existing of store.schoolMeanings) {
      const sim = calculateSimilarity(
        candidate.title,
        candidate.keywords,
        existing.title,
        existing.keywords
      );
      if (sim >= 0.6) {
        existing.count = (existing.count || 1) + 1;
        if (!existing.sourceTags) existing.sourceTags = [];
        if (!existing.sourceTags.includes(sourceTag)) {
          existing.sourceTags.push(sourceTag);
        }
        matched = true;
        added.push(existing);
        break;
      }
    }

    if (!matched) {
      store.schoolMeanings.push(candidate);
      added.push(candidate);
    }
  }

  return added;
}

export async function getSchoolPool(): Promise<SchoolMeaning[]> {
  const store = await readStore();
  return store.schoolMeanings || [];
}

export interface SchoolHit {
  meaning: SchoolMeaning;
  score: number;
}

/**
 * Search school pool for up to `limit` (default 4) relevant meanings for chat context.
 */
export async function searchSchoolPool(
  query: string,
  limit: number = 4
): Promise<SchoolMeaning[]> {
  const store = await readStore();
  const pool = store.schoolMeanings || [];
  if (pool.length === 0) return [];

  const q = grams(query);
  if (q.size === 0) {
    // If no query terms, return the highest counted meanings
    return [...pool].sort((a, b) => (b.count || 1) - (a.count || 1)).slice(0, limit);
  }

  const hits: SchoolHit[] = [];
  for (const m of pool) {
    const head = grams(`${m.title} ${(m.keywords || []).join(" ")}`);
    const body = grams(m.essence);
    let score = 0;
    for (const g of q) {
      if (head.has(g)) score += 2;
      else if (body.has(g)) score += 1;
    }
    if (score >= 2) {
      hits.push({ meaning: m, score });
    }
  }

  hits.sort((a, b) => b.score - a.score || (b.meaning.count || 1) - (a.meaning.count || 1));
  const results = hits.slice(0, limit).map((h) => h.meaning);

  // If hits < limit, pad with highest count items not already included
  if (results.length < limit) {
    const includedIds = new Set(results.map((r) => r.id));
    const leftovers = pool
      .filter((m) => !includedIds.has(m.id))
      .sort((a, b) => (b.count || 1) - (a.count || 1));
    for (const rem of leftovers) {
      if (results.length >= limit) break;
      results.push(rem);
    }
  }

  return results.slice(0, limit);
}
