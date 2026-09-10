// Capability estimation from the attempt log.
//
// The recommender needs a difficulty target. Each successful attempt becomes a
// sample at "the level this attempt implies":
//
//   solo solve      -> impliedAbility(rating, band)
//                      = the problem's rating, plus a bonus when the solve was
//                        at or above the pace expected for that difficulty
//   editorial solve -> the problem's rating (the time proves nothing)
//
// weight = independence × recency decay × first-solve factor
//
// The bonus is one-sided: a slow solve never pushes the estimate *below* the
// problem's rating, because solving it at all proves you can operate there.
// The felt band therefore feeds the sample value, not the weight — the same
// band means different things at 1300 and at 2400.
//
// Failures do not add samples; a recent "no idea" instead *caps* the estimate,
// because being unable to solve at rating R is direct evidence against ability
// above R.

import { impliedAbility, pointsAbove } from "./pace";
import { DAY_MS } from "./srs";
import type { ProgressEvent, SolvedAttempt } from "./types";

/** Peeking at the editorial says little about what you can do alone. */
export const INDEPENDENCE_WEIGHT = { solo: 1, solution: 0.15 } as const;

/** Re-solving a problem you have already logged says less than the first try. */
export const REPEAT_ATTEMPT_WEIGHT = 0.4;

/** 90-day half-life: recent form dominates without discarding history. */
export const HALF_LIFE_DAYS = 90;

/** A tag needs this much weighted evidence before it gets its own estimate. */
export const MIN_TAG_WEIGHT = 1.0;

/** Below this total weight the data is too thin to trust. */
export const MIN_TOTAL_WEIGHT = 0.8;

export const COLD_START_RATING = 1100;

/** Aim slightly above demonstrated ability (zone of proximal development). */
export const STRETCH = 50;

/** How long a "no idea" keeps capping the estimate. */
export const FAILURE_WINDOW_DAYS = 30;

/** Target this far below a failed problem's rating. */
export const FAILURE_MARGIN = 50;

export interface AbilitySample {
  rating: number;
  weight: number;
}

export interface AbilityEstimate {
  global: number;
  byTag: Map<string, number>;
  totalWeight: number;
}

export function decayWeight(at: number, now: number): number {
  const ageDays = Math.max(0, (now - at) / DAY_MS);
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

/** How much one solved attempt counts, before per-tag aggregation. */
export function attemptWeight(
  attempt: SolvedAttempt,
  isFirstSolve: boolean,
  now: number,
): number {
  return (
    INDEPENDENCE_WEIGHT[attempt.independence] *
    decayWeight(attempt.at, now) *
    (isFirstSolve ? 1 : REPEAT_ATTEMPT_WEIGHT)
  );
}

export function weightedPercentile(
  samples: AbilitySample[],
  quantile: number,
): number | undefined {
  if (samples.length === 0) return undefined;

  const sorted = [...samples].sort((a, b) => a.rating - b.rating);
  const total = sorted.reduce((sum, sample) => sum + sample.weight, 0);
  if (total <= 0) return undefined;

  const target = total * quantile;
  let acc = 0;
  for (const sample of sorted) {
    acc += sample.weight;
    if (acc >= target) return sample.rating;
  }
  return sorted[sorted.length - 1].rating;
}

export function estimateAbility(
  events: ProgressEvent[],
  ratingOf: (qid: string) => number | undefined,
  tagsOf: (qid: string) => string[],
  now: number,
): AbilityEstimate {
  const allSamples: AbilitySample[] = [];
  const tagSamples = new Map<string, AbilitySample[]>();
  const failures: { rating: number; tags: string[]; at: number }[] = [];
  const seen = new Set<string>();

  for (const event of events) {
    if (event.type !== "attempt") continue;

    const isFirstSolve = !seen.has(event.qid);
    seen.add(event.qid);

    // Prefer the difficulty snapshotted on the event: it is what the attempt
    // was actually judged against, even if the question pool later changes.
    const rating = event.rating ?? ratingOf(event.qid);
    if (rating == null) continue;
    const tags = tagsOf(event.qid);

    if (event.outcome === "gaveup") {
      if (event.reason === "no_idea") {
        failures.push({ rating, tags, at: event.at });
      }
      continue;
    }

    const weight = attemptWeight(event, isFirstSolve, now);
    if (weight <= 0) continue;

    const sample: AbilitySample = {
      rating:
        event.independence === "solo"
          ? impliedAbility(rating, event.band)
          : rating,
      weight,
    };
    allSamples.push(sample);
    for (const tag of tags) {
      const list = tagSamples.get(tag);
      if (list) list.push(sample);
      else tagSamples.set(tag, [sample]);
    }
  }

  const byTag = new Map<string, number>();
  tagSamples.forEach((samples, tag) => {
    const total = samples.reduce((sum, sample) => sum + sample.weight, 0);
    if (total < MIN_TAG_WEIGHT) return;
    const percentile = weightedPercentile(samples, 0.75);
    if (percentile == null) return;
    byTag.set(tag, Math.round(percentile + STRETCH));
  });

  // Recent "no idea" attempts cap every tag they touched.
  for (const failure of failures) {
    if ((now - failure.at) / DAY_MS > FAILURE_WINDOW_DAYS) continue;
    const ceiling = Math.round(failure.rating - FAILURE_MARGIN);
    for (const tag of failure.tags) {
      const current = byTag.get(tag);
      if (current == null || current > ceiling) byTag.set(tag, ceiling);
    }
  }

  const totalWeight = allSamples.reduce((sum, sample) => sum + sample.weight, 0);

  let global =
    totalWeight < MIN_TOTAL_WEIGHT
      ? COLD_START_RATING
      : Math.round(
          (weightedPercentile(allSamples, 0.75) ?? COLD_START_RATING) + STRETCH,
        );

  for (const failure of failures) {
    if ((now - failure.at) / DAY_MS > FAILURE_WINDOW_DAYS) continue;
    if (global > failure.rating) global = failure.rating;
  }

  return { global, byTag, totalWeight };
}

/**
 * Difficulty target for one problem: its weakest practised tag, falling back to
 * the global estimate. Conservative on purpose — a multi-tag problem is limited
 * by the tag you are least ready for.
 */
export function targetForTags(
  tags: string[],
  ability: AbilityEstimate,
): number {
  let target = Infinity;
  for (const tag of tags) {
    const value = ability.byTag.get(tag);
    if (value != null) target = Math.min(target, value);
  }
  return Number.isFinite(target) ? target : ability.global;
}

// ---------------------------------------------------------------------------
// Dynamic difficulty adjustment.
//
// Ability has two parts: the level demonstrated by history, and current form.
// History alone would keep serving the same difficulty to someone who has been
// away for months, or who just failed three problems in a row — both are
// reliable ways to make a user quit. These three terms move the target up or
// down without touching the stored data.
// ---------------------------------------------------------------------------

/** Days of inactivity before form starts to decay. */
export const GAP_GRACE_DAYS = 7;
export const GAP_PENALTY_PER_DAY = 1.5;
export const MAX_GAP_PENALTY = 200;

/** A break this long is worth acknowledging in the UI. */
export const WELCOME_BACK_DAYS = 14;

export const FRUSTRATION_NO_IDEA = 60;
export const FRUSTRATION_TEDIOUS = 30;

export const MOMENTUM_PER_FAST_SOLVE = 40;
export const MAX_MOMENTUM = 120;

/**
 * How far above the problem's own level a solve must land to count as a hot
 * streak. Absolute speed is not enough: five minutes on a 1300 is routine.
 */
export const MOMENTUM_PACE_THRESHOLD = 150;

/** Total adjustment is capped so the target never runs away. */
export const MAX_TARGET_OFFSET = 200;

/** Consecutive "no idea" attempts that trigger a confidence-builder card. */
export const EASY_MODE_STREAK = 2;

/** How far below the effective target a confidence-builder should sit. */
export const EASY_MODE_MARGIN = 150;

const RECENT_WINDOW = 3;

/** Only attempts this recent say anything about current form. */
export const FORM_WINDOW_DAYS = 7;

export interface TargetAdjustment {
  /** Demonstrated level from history. */
  base: number;
  /** Days since the last recorded attempt. */
  gapDays: number;
  /** Negative when the user has been away. */
  gapPenalty: number;
  /** Negative after recent give-ups. */
  frustration: number;
  /** Positive after recent fast solo solves. */
  momentum: number;
  /** Clamped sum of the three terms. */
  offset: number;
  /** base + offset. */
  effective: number;
  /** True when the last attempts were all "no idea". */
  easyMode: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);}

/** Solo solve that landed clearly above the problem's own level. */
function isClearlyFastForLevel(attempt: SolvedAttempt): boolean {
  if (attempt.rating == null) return attempt.band === "LE5";
  return pointsAbove(attempt.rating, attempt.band) >= MOMENTUM_PACE_THRESHOLD;
}

export function targetAdjustment(
  events: ProgressEvent[],
  ability: AbilityEstimate,
  now: number,
): TargetAdjustment {
  const base = ability.global;
  const attempts = events
    .filter((event) => event.type === "attempt")
    .sort((a, b) => a.at - b.at);
  const last = attempts[attempts.length - 1];

  const gapDays = last == null ? 0 : Math.max(0, (now - last.at) / DAY_MS);
  const gapPenalty =
    gapDays > GAP_GRACE_DAYS
      ? -Math.min(
          MAX_GAP_PENALTY,
          Math.round((gapDays - GAP_GRACE_DAYS) * GAP_PENALTY_PER_DAY),
        )
      : 0;

  // Momentum and frustration describe *current* form, so stale attempts are
  // ignored — otherwise a good run three months ago would cancel out the
  // returning-user discount.
  const recent = attempts
    .filter((attempt) => now - attempt.at <= FORM_WINDOW_DAYS * DAY_MS)
    .slice(-RECENT_WINDOW);
  let frustration = 0;
  let momentum = 0;
  for (const attempt of recent) {
    if (attempt.outcome === "gaveup") {
      frustration -=
        attempt.reason === "no_idea"
          ? FRUSTRATION_NO_IDEA
          : FRUSTRATION_TEDIOUS;
    } else if (
      attempt.independence === "solo" &&
      isClearlyFastForLevel(attempt)
    ) {
      momentum += MOMENTUM_PER_FAST_SOLVE;
    }
  }
  momentum = Math.min(momentum, MAX_MOMENTUM);

  const offset = clamp(
    gapPenalty + frustration + momentum,
    -MAX_TARGET_OFFSET,
    MAX_TARGET_OFFSET,
  );

  const easyMode =
    recent.length >= EASY_MODE_STREAK &&
    recent
      .slice(-EASY_MODE_STREAK)
      .every(
        (attempt) =>
          attempt.outcome === "gaveup" && attempt.reason === "no_idea",
      );

  return {
    base,
    gapDays: Math.round(gapDays),
    gapPenalty,
    frustration,
    momentum,
    offset,
    effective: base + offset,
    easyMode,
  };
}
