// How long a problem "should" take, and how an attempt compares to that.
//
// The felt-difficulty band is an absolute duration, but the same duration means
// very different things at different difficulties: five minutes on a 1300 is
// normal, five minutes on a 2400 is exceptional, and forty-five minutes on a
// 2400 is roughly on pace. Everything downstream therefore works in rating
// space — "how many points above or below this problem did you perform" —
// rather than on the raw band.
//
// The curve is a hand-calibrated piecewise table instead of a formula: the ends
// stay controllable, and each number can be tuned from experience.

import type { EffortBand } from "./types";

/** Minutes a solver fluent at the problem's own level typically needs. */
export const EXPECTED_MINUTES_TABLE: readonly {
  rating: number;
  minutes: number;
}[] = [
  { rating: 1200, minutes: 4 },
  { rating: 1300, minutes: 5 },
  { rating: 1400, minutes: 6 },
  { rating: 1500, minutes: 8 },
  { rating: 1600, minutes: 10 },
  { rating: 1800, minutes: 15 },
  { rating: 2000, minutes: 23 },
  { rating: 2200, minutes: 35 },
  { rating: 2400, minutes: 50 },
];

/** Representative minutes for each band. */
export const BAND_MINUTES: Record<EffortBand, number> = {
  LE5: 3,
  L5_15: 9,
  L15_30: 22,
  L30_60: 45,
  GT60: 75,
};

/** Rating points per doubling of solving time. */
export const POINTS_PER_DOUBLING = 320;

/** Cap on the inferred difference, so extreme reports cannot run away. */
export const MAX_POINTS_ABOVE = 480;

/** Hours of headroom below your level before a problem can retire. */
export const GRADUATION_HEADROOM = 150;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Linear interpolation, extrapolated with the end segments' slope. */
export function expectedMinutes(rating: number): number {
  const table = EXPECTED_MINUTES_TABLE;
  const first = table[0];
  const last = table[table.length - 1];

  if (rating <= first.rating) {
    const second = table[1];
    const slope =
      (second.minutes - first.minutes) / (second.rating - first.rating);
    return Math.max(1, first.minutes + (rating - first.rating) * slope);
  }

  if (rating >= last.rating) {
    const previous = table[table.length - 2];
    const slope =
      (last.minutes - previous.minutes) / (last.rating - previous.rating);
    return last.minutes + (rating - last.rating) * slope;
  }

  for (let i = 1; i < table.length; i += 1) {
    const hi = table[i];
    if (rating <= hi.rating) {
      const lo = table[i - 1];
      const t = (rating - lo.rating) / (hi.rating - lo.rating);
      return lo.minutes + t * (hi.minutes - lo.minutes);
    }
  }

  return last.minutes;
}

/**
 * How far above (positive) or below (negative) the problem's own level this
 * attempt performed, in rating points.
 *
 *   pointsAbove = 320 × log2( expectedMinutes(rating) / actualMinutes(band) )
 */
export function pointsAbove(rating: number, band: EffortBand): number {
  const expected = expectedMinutes(rating);
  const actual = BAND_MINUTES[band];
  const raw = POINTS_PER_DOUBLING * Math.log2(expected / actual);
  return clamp(raw, -MAX_POINTS_ABOVE, MAX_POINTS_ABOVE);
}

/**
 * The level this single attempt implies. Unlike `pointsAbove` it never drops
 * below the problem's own rating: solving it at all proves you can solve at
 * that level, and the band only adds a fluency bonus on top.
 */
export function impliedAbility(rating: number, band: EffortBand): number {
  return rating + Math.max(0, pointsAbove(rating, band));
}

/** Growth-rate modulation from relative performance (1 = exactly on pace). */
export function easeFactorFromPace(points: number): number {
  return clamp(1 + points / 600, 0.7, 1.4);
}

/** True when the attempt was at or above the expected pace for its level. */
export function isOnPace(points: number): boolean {
  return points >= 0;
}
