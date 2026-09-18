"use client";

// Session state for the recommendation queue.
//
// The queue itself is *not* stored. It is recomputed on every step from the
// event log, so it always reflects the latest ability estimate — freezing it
// would mean the tenth card was still chosen against the picture from before
// the first one was recorded.
//
// What has to survive a reload is only the part that cannot be recomputed:
//
//   served       which questions this session already put in front of the user,
//                so "another one" sticks and a skipped review does not bounce
//                straight back
//   pendingFresh how many fresh problems are still owed before the next review
//
// The second one is the subtle half. The queue interleaves one review per
// FRESH_PER_REVIEW new problems, and recomputing always starts that pattern at
// "review first" — so without the phase, every reload (and every recorded
// attempt) would serve reviews back to back.
//
// This is a cache of session position, not a second source of truth: deleting
// it loses nothing but the place in the current sitting.

export const SESSION_KEY = "lc-rating-plan-v1";

/**
 * A sitting, not a fixture. Past this the served list is dropped and the
 * session starts over, which is also what keeps the list from growing.
 */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface QueueSession {
  served: string[];
  pendingFresh: number;
  updatedAt: number;
}

const EMPTY: QueueSession = { served: [], pendingFresh: 0, updatedAt: 0 };

/** The stored session, or an empty one when absent, expired, or unreadable. */
export function readSession(now: number = Date.now()): QueueSession {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<QueueSession>;
    if (typeof parsed?.updatedAt !== "number") return EMPTY;
    if (now - parsed.updatedAt > SESSION_TTL_MS) return EMPTY;
    const served = Array.isArray(parsed.served)
      ? parsed.served.filter((qid): qid is string => typeof qid === "string")
      : [];
    const pendingFresh =
      typeof parsed.pendingFresh === "number" && parsed.pendingFresh > 0
        ? Math.floor(parsed.pendingFresh)
        : 0;
    return { served, pendingFresh, updatedAt: parsed.updatedAt };
  } catch {
    return EMPTY;
  }
}

export function writeSession(session: QueueSession): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (error) {
    console.error("[plan] failed to persist the session:", error);
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing useful to do */
  }
}
