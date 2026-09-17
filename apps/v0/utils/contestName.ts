// Contest display names.
//
// Frozen data stores the Chinese name ("第 144 场周赛") because that is what
// leetcode.cn shows. The English name is not stored: every contest slug in the
// pool matches `weekly-contest-N` or `biweekly-contest-N`, and deriving
// "Weekly Contest N" from it reproduces the upstream English name for all 566
// contests exactly, so storing it would only be a second copy that can drift.

const CONTEST_SLUG = /^(bi)?weekly-contest-(\d+)$/;

/** English display name for a contest slug, or the slug itself if unknown. */
export function englishContestName(slug: string | undefined): string {
  if (!slug) return "";
  const match = CONTEST_SLUG.exec(slug);
  if (!match) return slug;
  return `${match[1] ? "Biweekly" : "Weekly"} Contest ${match[2]}`;
}

/** Picks the contest name that matches the active locale. */
export function contestName(
  isEn: boolean,
  slug: string | undefined,
  chineseName: string,
): string {
  return isEn ? englishContestName(slug) || chineseName : chineseName;
}
