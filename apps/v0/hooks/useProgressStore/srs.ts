// Spaced-repetition scheduling (Anki-style progressive intervals).
//
// Pure functions only: no storage, no React, no Date.now(). Callers pass the
// events (and, when needed, the current time), which keeps the rules easy to
// unit test and lets the rest of the app stay declarative.

import type { AttemptEvent, EffortBand } from "./types";

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Progressive review intervals, in days. Index = step. */
export const LADDER_DAYS: readonly number[] = [1, 3, 7, 15, 30, 60, 120];

export const MAX_STEP = LADDER_DAYS.length - 1;

/**
 * A "no idea" attempt is a knowledge gap, not a near miss: give it a longer
 * cooldown than the default 1 day so the user is nudged toward easier material
 * first instead of bouncing off the same wall tomorrow.
 */
export const NO_IDEA_COOLDOWN_DAYS = 7;

/** How many ladder steps a successful solo solve advances. */
const STEP_DELTA: Record<EffortBand, number> = {
  LE5: 2,
  L5_15: 1,
  L15_30: 1,
  L30_60: 0,
  GT60: 0,
};

export interface ScheduleState {
  /** Index into LADDER_DAYS. */
  step: number;
  /** Epoch ms when this question should resurface. */
  dueAt: number;
  /** Timestamp of the attempt that produced this schedule. */
  lastAt: number;
  lastOutcome: AttemptEvent["outcome"];
}

export function clampStep(step: number): number {
  if (!Number.isFinite(step)) return 0;
  return Math.min(Math.max(Math.round(step), 0), MAX_STEP);
}

export function intervalDaysForStep(step: number): number {
  return LADDER_DAYS[clampStep(step)];
}

/**
 * The step after an attempt. `prevStep` is undefined for a first attempt,
 * which starts from the bottom of the ladder.
 */
export function nextStep(
  prevStep: number | undefined,
  event: AttemptEvent,
): number {
  const base = clampStep(prevStep ?? 0);

  if (event.outcome === "gaveup") return 0;
  // Leaning on the editorial means the problem was not really recalled.
  if (event.independence === "solution") return 0;

  return clampStep(base + STEP_DELTA[event.band]);
}

function daysUntilDue(event: AttemptEvent, step: number): number {
  if (event.outcome === "gaveup") {
    return event.reason === "no_idea" ? NO_IDEA_COOLDOWN_DAYS : LADDER_DAYS[0];
  }
  return intervalDaysForStep(step);
}

/** Fold one attempt into a schedule, producing the next schedule. */
export function applyAttempt(
  prev: ScheduleState | undefined,
  event: AttemptEvent,
): ScheduleState {
  const step = nextStep(prev?.step, event);
  return {
    step,
    dueAt: event.at + daysUntilDue(event, step) * DAY_MS,
    lastAt: event.at,
    lastOutcome: event.outcome,
  };
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
