// Tag names have two stored forms per question: `qtags.json` keeps English at
// index 0 and Chinese at index 1, index-aligned.
//
// Which form ends up inside a value decides whether a language toggle can still
// reach it. The rule:
//
//   values that outlive a render  -> canonical English
//   anything shown to the user    -> resolved through this map
//
// The recommendation plan is why the rule exists: it is built once and never
// rebuilt, so a tag name baked in under the old locale survived the toggle and
// appeared next to chips that had translated.

export type QTagPairs = Record<string, [unknown, unknown] | null | undefined>;

/** English tag name -> Chinese tag name, built from every question's pair. */
export function buildZhTagIndex(qtags: QTagPairs): Map<string, string> {
  const index = new Map<string, string>();
  Object.keys(qtags).forEach((hash) => {
    const pair = qtags[hash];
    const en = pair?.[0];
    const zh = pair?.[1];
    if (!Array.isArray(en) || !Array.isArray(zh)) return;
    en.forEach((name, i) => {
      const zhName = zh[i];
      if (typeof name === "string" && typeof zhName === "string") {
        index.set(name, zhName);
      }
    });
  });
  return index;
}

/**
 * Chinese name for a canonical English tag. Unknown names pass through, so a
 * tag that only exists in one language is shown as-is rather than disappearing.
 */
export function zhTagName(index: Map<string, string>, tagEn: string): string {
  return index.get(tagEn) ?? tagEn;
}
