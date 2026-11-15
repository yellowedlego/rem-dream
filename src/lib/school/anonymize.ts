import type { Meaning, SchoolMeaning } from "../types";

/**
 * Korean PII Anonymizer for School AI (Ticket B-09 / roadmap 3-2)
 *
 * Rules:
 * 1. Phone numbers (010-XXXX-XXXX, etc.)
 * 2. Email addresses
 * 3. URLs
 * 4. 6+ consecutive digits (student IDs, registration numbers)
 * 5. Class numbers ("N학년 N반 N번", "N학년 N반")
 * 6. Addresses ("XX시 XX구 XX동")
 * 7. Names with titles/vocatives ("민수야" -> "친구야", "김선생님" -> "선생님", "이쌤" -> "선생님")
 * 8. Discard if total text < 8 characters after cleaning
 */

export function anonymizePhone(text: string): string {
  return text
    .replace(/01[016789][-\s]?\d{3,4}[-\s]?\d{4}/g, "")
    .replace(/0\d{1,2}[-\s]?\d{3,4}[-\s]?\d{4}/g, "");
}

export function anonymizeEmail(text: string): string {
  return text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "");
}

export function anonymizeUrl(text: string): string {
  return text.replace(/https?:\/\/[^\s]+/g, "");
}

export function anonymizeLongDigits(text: string): string {
  return text.replace(/\d{6,}/g, "");
}

export function anonymizeClass(text: string): string {
  return text.replace(/\d{1,2}\s*학년\s*\d{1,2}\s*반(?:\s*\d{1,2}\s*번)?/g, "");
}

export function anonymizeAddress(text: string): string {
  return text.replace(/[가-힣]+(?:특별시|광역시|특별자치시|시|도)\s+[가-힣]+(?:시|군|구)\s+[가-힣]+(?:읍|면|동|로|길)(?:\s*\d+)?/g, "");
}

export function anonymizeNamesAndTitles(text: string): string {
  let res = text;
  // Teachers: ~선생님, ~쌤
  res = res.replace(/[가-힣]{1,4}(?:선생님|쌤)/g, "선생님");
  // Vocatives / friendly addresses with particles
  res = res.replace(/([가-힣]{2,3})(?:야|아)의(?=[\s.,!?~]|$)/g, "친구의");
  res = res.replace(/([가-힣]{2,3})(?:야|아)와(?=[\s.,!?~]|$)/g, "친구와");
  res = res.replace(/([가-힣]{2,3})(?:야|아)과(?=[\s.,!?~]|$)/g, "친구와");
  res = res.replace(/([가-힣]{2,3})(?:야|아)(?=[\s.,!?~]|$)/g, "친구야");
  // Subject particles: 민수가 -> 친구가, 영희는 -> 친구는
  res = res.replace(/([가-힣]{2,3})(?=이가|이가\s)/g, "친구");
  return res;
}

export function anonymizeText(text: string): string {
  if (!text) return "";
  let out = text;
  out = anonymizePhone(out);
  out = anonymizeEmail(out);
  out = anonymizeUrl(out);
  out = anonymizeLongDigits(out);
  out = anonymizeClass(out);
  out = anonymizeAddress(out);
  out = anonymizeNamesAndTitles(out);
  // Clean multiple spaces
  out = out.replace(/[ \t]+/g, " ").replace(/\n\s*\n/g, "\n").trim();
  return out;
}

export function isEligibleSchoolMeaning(title: string, essence: string): boolean {
  const cleanEssence = anonymizeText(essence);
  const cleanTitle = anonymizeText(title);
  return cleanTitle.length > 0 && cleanEssence.length >= 8;
}

export function anonymizeMeaning(
  meaning: Meaning,
  sourceTag: string,
  newId: number = meaning.id
): SchoolMeaning | null {
  const cleanTitle = anonymizeText(meaning.title);
  const cleanEssence = anonymizeText(meaning.essence);

  if (cleanEssence.length < 8 || cleanTitle.length === 0) {
    return null;
  }

  const cleanKeywords = (meaning.keywords || [])
    .map((k) => anonymizeText(k))
    .filter((k) => k.length > 0);

  return {
    id: newId,
    title: cleanTitle,
    essence: cleanEssence,
    keywords: cleanKeywords,
    count: 1,
    sourceTags: [sourceTag],
    createdAt: new Date().toISOString(),
  };
}
