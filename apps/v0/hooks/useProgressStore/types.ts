// Progress data schema (v2).
//
// The append-only event log is the single source of truth. Every user action
// that changes a question's state is stored as an immutable event; everything
// else (current status, review schedule, streaks, statistics) is derived from
// it on the fly. See ./derive.ts and ./srs.ts.
//
// Evolution rules — keep the log forward-compatible:
//   ALLOWED   adding optional fields, adding union members, adding enum values.
//   FORBIDDEN renaming / removing fields or changing the meaning of an existing
//             field. Those need a version bump plus an explicit conversion.
//
// Persistence layout lives in ./storage.ts.

/** How long the attempt felt, used as the primary difficulty signal. */
export type EffortBand = "LE5" | "L5_15" | "L15_30" | "L30_60" | "GT60";

/** Whether the user solved it alone or leaned on the editorial. */
export type Independence = "solo" | "solution";

/** Why the user gave up on an attempt. */
export type GaveUpReason = "idea_tedious" | "no_idea";

/**
 * Which entry point produced the event. Unknown values are preserved so a
 * newer client can still read an older one's log.
 */
export type AttemptSource = "zen" | "recommend" | (string & {});

interface AttemptBase {
  /** Stable id, used to deduplicate events on import. */
  id: string;
  /** Top-level discriminator so future event kinds can join the log. */
  type: "attempt";
  /** LeetCode question_id. */
  qid: string;
  /** When the attempt happened, epoch ms (defaults to the record time). */
  at: number;
  src: AttemptSource;
}

export interface SolvedAttempt extends AttemptBase {
  outcome: "solved";
  band: EffortBand;
  independence: Independence;
}

export interface GaveUpAttempt extends AttemptBase {
  outcome: "gaveup";
  reason: GaveUpReason;
}

export type AttemptEvent = SolvedAttempt | GaveUpAttempt;

/** Future event kinds (bookmarks, notes, ...) join this union. */
export type ProgressEvent = AttemptEvent;

/** The whole persisted document, stored under a single localStorage key. */
export interface ProgressStoreV2 {
  version: 2;
  installedAt: number;
  /** Ordered by (at, id). */
  events: ProgressEvent[];
}
