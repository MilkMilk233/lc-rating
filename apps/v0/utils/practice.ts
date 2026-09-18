// Shared practice/recommendation primitives used by the profile analytics and
// the /recommend page. Single source of truth for the difficulty bands and the
// XP economy.

import type { MessageKey } from "@hooks/useI18n/messages";
import { bandOf } from "@hooks/useProgressStore/bands";
import type { AttemptEvent, EffortBand } from "@hooks/useProgressStore/types";

/** Band names live in the message dictionary, addressed by this key. */
export const RATING_BANDS = [
  { key: "ratingBand.entry", range: "<1200", min: 0, max: 1200, xp: 6, color: "var(--rating-color-0)" },
  { key: "ratingBand.easy", range: "1200+", min: 1200, max: 1400, xp: 10, color: "var(--rating-color-1)" },
  { key: "ratingBand.improve", range: "1400+", min: 1400, max: 1600, xp: 15, color: "var(--rating-color-2)" },
  { key: "ratingBand.advanced", range: "1600+", min: 1600, max: 1900, xp: 22, color: "var(--rating-color-3)" },
  { key: "ratingBand.hard", range: "1900+", min: 1900, max: 2100, xp: 32, color: "var(--rating-color-4)" },
  { key: "ratingBand.legendary", range: "2100+", min: 2100, max: Infinity, xp: 50, color: "var(--rating-color-5)" },
] as const satisfies readonly {
  key: MessageKey;
  range: string;
  min: number;
  max: number;
  xp: number;
  color: string;
}[];

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
  no_idea: 1,
  saw_solution: 1,
} as const;

/** XP earned by a single attempt. `rating` is the problem's difficulty score. */
export function xpForAttempt(
  event: AttemptEvent,
  rating: number | undefined,
): number {
  if (event.outcome === "gaveup") return GAVEUP_XP[event.reason];

  const base = rating == null ? RATING_BANDS[0].xp : bandFor(rating).xp;
  // Looking up an API costs a little XP: the algorithm was still the user's,
  // but the solve was not fully unaided.
  const factor = event.independence === "syntax" ? SOLUTION_XP_FACTOR : 1;
  const band = bandOf(event.minutes);
  return Math.max(1, Math.round(base * EFFORT_XP_MULTIPLIER[band] * factor));
}
