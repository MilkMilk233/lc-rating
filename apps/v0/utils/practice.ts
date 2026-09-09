// Shared practice/recommendation primitives used by the profile analytics and
// the /recommend page. Single source of truth for the difficulty bands and the
// XP economy.

import type { AttemptEvent, EffortBand } from "@hooks/useProgressStore/types";

export const RATING_BANDS = [
  { label: "入门", range: "<1200", min: 0, max: 1200, xp: 6, color: "var(--rating-color-0)" },
  { label: "普及", range: "1200+", min: 1200, max: 1400, xp: 10, color: "var(--rating-color-1)" },
  { label: "提高", range: "1400+", min: 1400, max: 1600, xp: 15, color: "var(--rating-color-2)" },
  { label: "进阶", range: "1600+", min: 1600, max: 1900, xp: 22, color: "var(--rating-color-3)" },
  { label: "困难", range: "1900+", min: 1900, max: 2100, xp: 32, color: "var(--rating-color-4)" },
  { label: "传说", range: "2100+", min: 2100, max: Infinity, xp: 50, color: "var(--rating-color-5)" },
];

export const bandFor = (rating: number) =>
  RATING_BANDS.find((band) => rating >= band.min && rating < band.max) ??
  RATING_BANDS[0];

// ---------------------------------------------------------------------------
// XP economy (minimal first pass; numbers get tuned once real data exists).
//
// Struggle is rewarded, speed is not: a slow solo solve is worth more than a
// fast one, and leaning on the editorial is heavily discounted so that reading
// solutions never becomes a shortcut to levels.
// ---------------------------------------------------------------------------

export const EFFORT_XP_MULTIPLIER: Record<EffortBand, number> = {
  LE5: 1,
  L5_15: 1.1,
  L15_30: 1.25,
  L30_60: 1.5,
  GT60: 1.75,
};

export const SOLUTION_XP_FACTOR = 0.5;

export const GAVEUP_XP = {
  idea_tedious: 2,
  no_idea: 1,
} as const;

/** XP earned by a single attempt. `rating` is the problem's difficulty score. */
export function xpForAttempt(
  event: AttemptEvent,
  rating: number | undefined,
): number {
  if (event.outcome === "gaveup") return GAVEUP_XP[event.reason];

  const base = rating == null ? RATING_BANDS[0].xp : bandFor(rating).xp;
  const factor = event.independence === "solution" ? SOLUTION_XP_FACTOR : 1;
  return Math.max(1, Math.round(base * EFFORT_XP_MULTIPLIER[event.band] * factor));
}
