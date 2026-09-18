"use client";

// Wall-clock tracking for "how long did this problem take".
//
// What can and cannot be measured: the user solves on leetcode.com in another
// tab, so this page is hidden while they work. Page-visibility and idle
// detection therefore measure nothing useful — the only observable is the gap
// between opening the problem from here and coming back to record it.
//
// That gap is a *suggestion*, never a fact. It over-counts whenever the user
// walks away, so it is only offered when it looks plausible, the record panel
// shows it, and the user can overwrite it. A duration the user did not confirm
// is stored with `timed: false` and gets a wider error term downstream.

import { useCallback, useSyncExternalStore } from "react";

export interface ActiveProblem {
  qid: string;
  startedAt: number;
}

export const ACTIVE_PROBLEM_KEY = "lc-rating-active-problem-v1";

/** Below this the user cannot have started; above it they probably walked away. */
export const MIN_TRACKED_MS = 30 * 1000;
export const MAX_TRACKED_MS = 3 * 60 * 60 * 1000;

/** A marker older than this is stale and ignored rather than reported. */
export const STALE_MS = 24 * 60 * 60 * 1000;

const listeners = new Set<() => void>();

function read(): ActiveProblem | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_PROBLEM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveProblem>;
    if (typeof parsed?.qid !== "string" || typeof parsed?.startedAt !== "number") {
      return null;
    }
    return { qid: parsed.qid, startedAt: parsed.startedAt };
  } catch {
    return null;
  }
}

function write(value: ActiveProblem | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(ACTIVE_PROBLEM_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(ACTIVE_PROBLEM_KEY);
  } catch (error) {
    console.error("[timer] failed to persist the active problem:", error);
  }
}

let active: ActiveProblem | null = read();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Another tab may open a different problem, so the marker follows it.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== ACTIVE_PROBLEM_KEY) return;
    active = read();
    emit();
  });
}

/** Call when the user opens a problem from this site. */
export function markAttemptStart(qid: string | number): void {
  active = { qid: String(qid), startedAt: Date.now() };
  write(active);
  emit();
}

/** Call when the marker no longer applies (recorded, or moved on). */
export function clearAttemptStart(): void {
  if (!active) return;
  active = null;
  write(null);
  emit();
}

export function useActiveProblem(): ActiveProblem | null {
  return useSyncExternalStore(
    subscribe,
    () => active,
    () => null,
  );
}

/**
 * Minutes to prefill for `qid`, or null when the tracker has nothing credible.
 *
 * Returning null is the honest answer for "no marker", "marker for a different
 * problem", "too short to be a real attempt", "long enough that they walked
 * away" and "left over from yesterday" — all of which would otherwise be
 * silently recorded as measurements.
 */
export function trackedMinutes(
  active: ActiveProblem | null,
  qid: string | number,
  now: number = Date.now(),
): number | null {
  if (!active || active.qid !== String(qid)) return null;
  const elapsed = now - active.startedAt;
  if (!Number.isFinite(elapsed)) return null;
  if (elapsed < MIN_TRACKED_MS || elapsed > MAX_TRACKED_MS) return null;
  if (elapsed > STALE_MS) return null;
  return Math.max(1, Math.round(elapsed / 60000));
}

/** Convenience wrapper for components that only need the prefill value. */
export function useTrackedMinutes(qid: string | number): number | null {
  const activeProblem = useActiveProblem();
  const compute = useCallback(
    (now?: number) => trackedMinutes(activeProblem, qid, now),
    [activeProblem, qid],
  );
  return compute();
}
