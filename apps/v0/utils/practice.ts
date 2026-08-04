// Shared practice/recommendation primitives used by both the profile
// analytics and the /recommend page. Single source of truth for the
// difficulty bands and the XP economy.

export const RATING_BANDS = [
  { label: "入门", range: "<1200", min: 0, max: 1200, xp: 6, color: "var(--rating-color-0)" },
  { label: "普及", range: "1200+", min: 1200, max: 1400, xp: 10, color: "var(--rating-color-1)" },
  { label: "提高", range: "1400+", min: 1400, max: 1600, xp: 15, color: "var(--rating-color-2)" },
  { label: "进阶", range: "1600+", min: 1600, max: 1900, xp: 22, color: "var(--rating-color-3)" },
  { label: "困难", range: "1900+", min: 1900, max: 2100, xp: 32, color: "var(--rating-color-4)" },
  { label: "传说", range: "2100+", min: 2100, max: Infinity, xp: 50, color: "var(--rating-color-5)" },
];

// Honest effort always earns something, even when the problem wins.
export const STATUS_XP = {
  WORKING: 2,
  REVIEW_NEEDED: 2,
  TOO_HARD: 1,
  CUSTOM: 1,
};

export const bandFor = (rating: number) =>
  RATING_BANDS.find((band) => rating >= band.min && rating < band.max) ??
  RATING_BANDS[0];

// Capability estimate: average of the user's top-quartile AC ratings,
// nudged slightly upward so practice stays in the zone of proximal
// development. Returns 0 when there is not enough data (< 3 ACs).
export const estimateStrength = (acRatings: number[]) => {
  if (acRatings.length < 3) return 0;
  const sorted = [...acRatings].sort((a, b) => b - a);
  const top = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 4)));
  const estimate = top.reduce((sum, rating) => sum + rating, 0) / top.length;
  return Math.round((estimate + 100) / 50) * 50;
};

export const displayOptionLabel = (key: string, label?: string) => {
  if (label) return label;
  if (key === "TODO") return "待开始";
  return key;
};
