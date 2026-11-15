import type { PersonaChangeItem, PersonaVersion, SchoolMeaning } from "../types";

/**
 * Filter items that strictly qualify for School AI automatic application:
 * 1. At most 2 items per run.
 * 2. moveStyle delta is clamped/filtered to [-0.05, +0.05], and new value is in [0.3, 0.7].
 * 3. addNote requires note capacity < 10 and at least 3 distinct source tags.
 */
export function filterSchoolAutoApplyItems(
  items: PersonaChangeItem[],
  currentPersona: PersonaVersion,
  schoolMeanings: SchoolMeaning[]
): PersonaChangeItem[] {
  const currentStyle = currentPersona.style || {
    warmth: 0.5,
    empathy: 0.5,
    brevity: 0.5,
    curiosity: 0.5,
  };
  const currentNotes = currentPersona.notes || [];

  const approved: PersonaChangeItem[] = [];

  for (const item of items) {
    if (approved.length >= 2) break; // Max 2 items

    const change = item.change;

    if (change.kind === "moveStyle") {
      if (Math.abs(change.delta) > 0.05) continue;
      const curVal = currentStyle[change.axis] ?? 0.5;
      const targetVal = Number((curVal + change.delta).toFixed(3));
      if (targetVal < 0.3 || targetVal > 0.7) continue;
      approved.push(item);
    } else if (change.kind === "addNote") {
      if (currentNotes.length + approved.filter((a) => a.change.kind === "addNote").length >= 10) {
        continue;
      }
      // Check distinct source tags >= 3
      const tags = new Set<string>();
      if (item.sourceMeaningIds) {
        for (const smId of item.sourceMeaningIds) {
          const sm = schoolMeanings.find((m) => m.id === smId);
          if (sm?.sourceTags) {
            sm.sourceTags.forEach((t) => tags.add(t));
          }
        }
      }
      if (tags.size < 3) continue;
      approved.push(item);
    } else if (change.kind === "editNote" || change.kind === "removeNote") {
      approved.push(item);
    }
  }

  return approved;
}
