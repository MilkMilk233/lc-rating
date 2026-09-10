// Spaced-repetition scheduling (v3).
//
// Two forces are balanced here:
//   1. recall risk  — the harder a problem felt, the more it needs revisiting;
//   2. review cost  — a 45-minute problem costs far more to review than a
//      3-minute one, and re-serving it the next day is exhausting.
//
// So the FIRST interval grows with effort (recovery room), while the growth
// rate shrinks with effort (hard problems still end up reviewed more often over
// time, just not tomorrow).
//
// Pure functions only: no storage, no React, no Date.now(). Callers pass the
// events (and, when needed, the current time).

import type { AttemptEvent, EffortBand } from "./types";

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Never schedule further out than a year. */
export const MAX_INTERVAL_DAYS = 365;

/** First interval after a solve, in days. Effort buys recovery time. */
export const BASE_DAYS: Record<EffortBand, number> = {
  LE5: 7,
  L5_15: 5,
  L15_30: 7,
  L30_60: 9,
  GT60: 12,
};

/** Growth factor for consecutive successes. Harder problems grow slower. */
export const EASE: Record<EffortBand, number> = {
  LE5: 3.0,
  L5_15: 2.6,
  L15_30: 2.0,
  L30_60: 1.7,
  GT60: 1.5,
};

/** Leaning on the editorial means it was not really retrieved. */
export const SOLUTION_FACTOR = 0.6;

export const GAVEUP_COOLDOWN_DAYS = {
  idea_tedious: 2,
  no_idea: 7,
} as const;

/** Consecutive give-ups before a problem is parked as a "leech". */
export const LEECH_THRESHOLD = 3;

/** Parked problems come back after this many days, not tomorrow. */
export const LEECH_COOLDOWN_DAYS = 30;

/**
 * "Drill mode": the user flagged this problem as carrying something worth
 * memorising (a template, an API usage). Intervals are halved so it comes back
 * often, but capped so it never degenerates into a daily chore.
 */
export const REVISIT_INTERVAL_FACTOR = 0.5;
export const REVISIT_MAX_INTERVAL_DAYS = 21;

export interface ScheduleState {
  /** Days until the next review. */
  intervalDays: number;
  /** Epoch ms when this question should resurface. */
  dueAt: number;
  /** Timestamp of the attempt that produced this schedule. */
  lastAt: number;
  lastOutcome: AttemptEvent["outcome"];
  /** Consecutive give-ups; reset by any solve. */
  failCount: number;
  /** Drill mode: sticky until a solve is submitted without the flag. */
  revisit: boolean;
}

function clampInterval(days: number): number {
  if (!Number.isFinite(days)) return 1;
  return Math.min(Math.max(Math.round(days), 1), MAX_INTERVAL_DAYS);
}

/**
 * Stable pseudo-random unit value in [0, 1) derived from a string.
 *
 * Used for anything that should look random but must never change between
 * renders or reloads (interval jitter, overdue spreading).
 */
export function hashUnit(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

/**
 * Deterministic ±15% jitter, derived from the question id.
 *
 * Without it, everything solved on the same day shares the same interval and
 * therefore comes back on the same day — a "review wave" that gets worse the
 * more the user practices.
 */
export function fuzzFactor(qid: string): number {
  return 0.85 + hashUnit(qid) * 0.3;
}

/**
 * The interval actually used for the due date. Growth keeps using the clean
 * value so the ladder stays predictable; only the calendar date is jittered.
 */
export function fuzzedIntervalDays(intervalDays: number, qid: string): number {
  return clampInterval(intervalDays * fuzzFactor(qid));
}

/**
 * Interval after an attempt. `prev` is undefined for a first attempt, and the
 * ladder restarts after a give-up (you did not retrieve it at all).
 */
export function nextIntervalDays(
  prev: ScheduleState | undefined,
  event: AttemptEvent,
): number {
  if (event.outcome === "gaveup") {
    const fails = (prev?.failCount ?? 0) + 1;
    return fails >= LEECH_THRESHOLD
      ? LEECH_COOLDOWN_DAYS
      : GAVEUP_COOLDOWN_DAYS[event.reason];
  }

  const base = BASE_DAYS[event.band];

  if (event.independence === "solution") {
    return clampInterval(base * SOLUTION_FACTOR);
  }

  if (!prev || prev.lastOutcome === "gaveup") {
    return clampInterval(base);
  }

  // Always advance at least one day so slow solves still move forward.
  return clampInterval(
    Math.max(prev.intervalDays + 1, prev.intervalDays * EASE[event.band]),
  );
}

/** Fold one attempt into a schedule, producing the next schedule. */
export function applyAttempt(
  prev: ScheduleState | undefined,
  event: AttemptEvent,
): ScheduleState {
  // Drill mode is sticky across give-ups: it is decided by the most recent
  // *solve*, so failing once does not silently cancel the user's intent.
  const revisit =
    event.outcome === "solved"
      ? event.revisit === true
      : (prev?.revisit ?? false);

  let intervalDays = nextIntervalDays(prev, event);
  if (revisit && event.outcome === "solved") {
    intervalDays = Math.min(
      clampInterval(intervalDays * REVISIT_INTERVAL_FACTOR),
      REVISIT_MAX_INTERVAL_DAYS,
    );
  }

  return {
    intervalDays,
    dueAt: event.at + fuzzedIntervalDays(intervalDays, event.qid) * DAY_MS,
    lastAt: event.at,
    lastOutcome: event.outcome,
    failCount: event.outcome === "gaveup" ? (prev?.failCount ?? 0) + 1 : 0,
    revisit,
  };
}

/** A problem that keeps being given up on: park it instead of nagging. */
export function isLeech(schedule: ScheduleState | undefined): boolean {
  return (
    !!schedule &&
    schedule.failCount >= LEECH_THRESHOLD &&
    schedule.lastOutcome === "gaveup"
  );
}

/** Consecutive easy solo solves before a problem graduates. */
export const GRADUATION_STREAK = 3;

const EASY_BANDS: readonly EffortBand[] = ["LE5", "L5_15"];

/**
 * Graduation: three easy, independent solves in a row means the pattern is
 * internalised, so the problem stops taking up review slots. The event log is
 * untouched — if the user later struggles with it again, the last attempts
 * change and it comes back on its own.
 *
 * A flagged (drill-mode) attempt blocks graduation: the user explicitly said
 * they still want to practise this one.
 */
export function isGraduated(attempts: AttemptEvent[]): boolean {
  if (attempts.length < GRADUATION_STREAK) return false;
  return attempts
    .slice(-GRADUATION_STREAK)
    .every(
      (attempt) =>
        attempt.outcome === "solved" &&
        attempt.independence === "solo" &&
        attempt.revisit !== true &&
        EASY_BANDS.includes(attempt.band),
    );
}

/** Replay a question's attempts (ascending by `at`) into its current schedule. */
export function replay(events: AttemptEvent[]): ScheduleState | undefined {
  let state: ScheduleState | undefined;
  for (const event of events) {
    state = applyAttempt(state, event);
  }
  return state;
}

export function isDue(
  schedule: ScheduleState | undefined,
  now: number,
): boolean {
  return !!schedule && now >= schedule.dueAt;
}

/** Whole days past the due date (0 when not overdue yet). */
export function overdueDays(
  schedule: ScheduleState | undefined,
  now: number,
): number {
  if (!schedule || now < schedule.dueAt) return 0;
  return Math.floor((now - schedule.dueAt) / DAY_MS);
}

/**
 * How overdue relative to the problem's own interval.
 *
 * Absolute lateness is misleading: 6 days late on a 3-day interval is a real
 * miss, while 6 days late on a 100-day interval is noise. This is what review
 * ordering should use.
 */
export function urgency(
  schedule: ScheduleState | undefined,
  now: number,
): number {
  if (!schedule || now < schedule.dueAt) return 0;
  const interval = Math.max(1, schedule.intervalDays);
  return (now - schedule.dueAt) / DAY_MS / interval;
}
