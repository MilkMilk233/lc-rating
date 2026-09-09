// Projections derived from the event log.
//
// Everything here is a pure function of the stored events: no storage access,
// no React, no clock (callers pass `now` where it matters). UI code should read
// these projections instead of raw events so that schema changes stay contained.

import { BAND_ORDER } from "./bands";
import { isDue, overdueDays, replay } from "./srs";
import type { ScheduleState } from "./srs";
import type {
  AttemptEvent,
  EffortBand,
  ProgressEvent,
  SolvedAttempt,
} from "./types";

export interface DayStats {
  /** Local calendar day, "YYYY-MM-DD". */
  date: string;
  solved: number;
  gaveup: number;
  byBand: Record<EffortBand, number>;
}

export interface ProgressTotals {
  /** Questions with at least one attempt. */
  marked: number;
  /** Current state counts (latest attempt per question). */
  solved: number;
  gaveup: number;
  /** Raw attempt counts across the whole log. */
  solvedAttempts: number;
  gaveupAttempts: number;
}

export interface DerivedProgress {
  /** Deduplicated, ordered by (at, id). */
  events: ProgressEvent[];
  eventById: Map<string, ProgressEvent>;
  /** Ascending by `at` for each question. */
  attemptsByQid: Map<string, AttemptEvent[]>;
  /** Latest attempt per question. */
  currentByQid: Map<string, AttemptEvent>;
  /** Questions whose latest attempt was a solo/solution solve. */
  currentSolved: SolvedAttempt[];
  scheduleByQid: Map<string, ScheduleState>;
  daily: Map<string, DayStats>;
  totals: ProgressTotals;
}

function emptyByBand(): Record<EffortBand, number> {
  const counts = {} as Record<EffortBand, number>;
  for (const key of BAND_ORDER) counts[key] = 0;
  return counts;
}

/** Local calendar day key. Bucketing happens at read time so a timezone change does not rewrite history. */
export function dayKey(ts: number): string {
  const date = new Date(ts);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Shift a day key by whole days (local calendar). */
export function shiftDay(key: string, delta: number): string {
  const [year, month, day] = key.split("-").map(Number);
  return dayKey(new Date(year, month - 1, day + delta).getTime());
}

function compareEvents(a: ProgressEvent, b: ProgressEvent): number {
  if (a.at !== b.at) return a.at - b.at;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortEvents(events: ProgressEvent[]): ProgressEvent[] {
  return [...events].sort(compareEvents);
}

/** Merge any number of logs, dropping duplicate ids and re-sorting. */
export function mergeEvents(...lists: ProgressEvent[][]): ProgressEvent[] {
  const seen = new Set<string>();
  const merged: ProgressEvent[] = [];
  for (const list of lists) {
    for (const event of list) {
      if (!event || typeof event.id !== "string") continue;
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      merged.push(event);
    }
  }
  return merged.sort(compareEvents);
}

export function deriveProgress(events: ProgressEvent[]): DerivedProgress {
  const ordered = mergeEvents(events);

  const eventById = new Map<string, ProgressEvent>();
  const attemptsByQid = new Map<string, AttemptEvent[]>();
  const daily = new Map<string, DayStats>();
  let solvedAttempts = 0;
  let gaveupAttempts = 0;

  for (const event of ordered) {
    eventById.set(event.id, event);
    if (event.type !== "attempt") continue;

    const list = attemptsByQid.get(event.qid);
    if (list) list.push(event);
    else attemptsByQid.set(event.qid, [event]);

    const key = dayKey(event.at);
    let stats = daily.get(key);
    if (!stats) {
      stats = { date: key, solved: 0, gaveup: 0, byBand: emptyByBand() };
      daily.set(key, stats);
    }

    if (event.outcome === "solved") {
      stats.solved += 1;
      stats.byBand[event.band] += 1;
      solvedAttempts += 1;
    } else {
      stats.gaveup += 1;
      gaveupAttempts += 1;
    }
  }

  const currentByQid = new Map<string, AttemptEvent>();
  const scheduleByQid = new Map<string, ScheduleState>();
  const currentSolved: SolvedAttempt[] = [];
  let solved = 0;
  let gaveup = 0;

  attemptsByQid.forEach((list, qid) => {
    const current = list[list.length - 1];
    currentByQid.set(qid, current);
    const schedule = replay(list);
    if (schedule) scheduleByQid.set(qid, schedule);
    if (current.outcome === "solved") {
      currentSolved.push(current);
      solved += 1;
    } else {
      gaveup += 1;
    }
  });

  return {
    events: ordered,
    eventById,
    attemptsByQid,
    currentByQid,
    currentSolved,
    scheduleByQid,
    daily,
    totals: {
      marked: currentByQid.size,
      solved,
      gaveup,
      solvedAttempts,
      gaveupAttempts,
    },
  };
}

export function activeDates(daily: Map<string, DayStats>): Set<string> {
  const dates = new Set<string>();
  daily.forEach((stats, key) => {
    if (stats.solved + stats.gaveup > 0) dates.add(key);
  });
  return dates;
}

/** Consecutive practice days ending today (or yesterday, while today is still pending). */
export function streakDays(
  daily: Map<string, DayStats>,
  today: string,
): number {
  const active = activeDates(daily);
  if (active.size === 0) return 0;

  let cursor = active.has(today) ? today : shiftDay(today, -1);
  let count = 0;
  while (active.has(cursor)) {
    count += 1;
    cursor = shiftDay(cursor, -1);
  }
  return count;
}

/** Per-day stats for the last `n` calendar days, oldest first. */
export function lastNDays(
  daily: Map<string, DayStats>,
  n: number,
  today: string,
): DayStats[] {
  const out: DayStats[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const key = shiftDay(today, -i);
    out.push(
      daily.get(key) ?? {
        date: key,
        solved: 0,
        gaveup: 0,
        byBand: emptyByBand(),
      },
    );
  }
  return out;
}

/** Due questions, most overdue first. */
export function listDueQids(derived: DerivedProgress, now: number): string[] {
  const due: { qid: string; overdue: number; dueAt: number }[] = [];
  derived.scheduleByQid.forEach((schedule, qid) => {
    if (!isDue(schedule, now)) return;
    due.push({ qid, overdue: overdueDays(schedule, now), dueAt: schedule.dueAt });
  });
  due.sort((a, b) => b.overdue - a.overdue || a.dueAt - b.dueAt);
  return due.map((entry) => entry.qid);
}
