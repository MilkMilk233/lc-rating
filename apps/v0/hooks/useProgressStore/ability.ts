// Capability estimation from the attempt log.
//
// The recommender needs a difficulty target. We derive it per tag (and globally)
// by weighting each successful attempt:
//
//   weight = independence × felt-difficulty band × recency decay
//
// Failures do not add samples; a recent "no idea" instead *caps* the estimate,
// because being unable to solve at rating R is direct evidence against ability
// above R.

import { DAY_MS } from "./srs";
import type { EffortBand, ProgressEvent } from "./types";

/** A 3-minute solve is stronger evidence than a 45-minute one. */
export const BAND_WEIGHT: Record<EffortBand, number> = {
  LE5: 1.0,
  L5_15: 0.9,
  L15_30: 0.7,
  L30_60: 0.45,
  GT60: 0.25,
};

/** Peeking at the editorial says little about what you can do alone. */
export const INDEPENDENCE_WEIGHT = { solo: 1, solution: 0.15 } as const;

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

  for (const event of events) {
    if (event.type !== "attempt") continue;
    const rating = ratingOf(event.qid);
    if (rating == null) continue;
    const tags = tagsOf(event.qid);

    if (event.outcome === "gaveup") {
      if (event.reason === "no_idea") {
        failures.push({ rating, tags, at: event.at });
      }
      continue;
    }

    const weight =
      BAND_WEIGHT[event.band] *
      INDEPENDENCE_WEIGHT[event.independence] *
      decayWeight(event.at, now);
    if (weight <= 0) continue;

    const sample: AbilitySample = { rating, weight };
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
  return Math.min(Math.max(value, min), max);
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
    } else if (attempt.independence === "solo" && attempt.band === "LE5") {
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
