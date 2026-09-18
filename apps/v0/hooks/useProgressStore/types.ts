// Progress data schema (v3).
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
// v3 replaced the coarse felt-difficulty band with a measured duration in
// minutes, dropped the "solved with the editorial" pseudo-success, and added
// dismissals. `bandOf(minutes)` reproduces the old band exactly, and the v2
// conversion lives in ./storage.ts.
//
// Persistence layout lives in ./storage.ts.

/** Coarse duration bucket. Derived from `minutes`, never stored. */
export type EffortBand = "LE5" | "L5_15" | "L15_30" | "L30_60" | "GT60";

/**
 * Whether the algorithm was the user's own.
 *
 * `syntax` means they knew the approach and only looked up an API or language
 * detail: the algorithmic evidence is intact, but the duration now includes
 * time spent reading documentation.
 */
export type Independence = "solo" | "syntax";

/**
 * How an attempt ended without a solution of the user's own.
 *
 * `saw_solution` means they read the editorial; `no_idea` means they ran out
 * of ideas. Both are the same observation to the scheduler and the estimator —
 * the user did not produce the algorithm inside the time they spent — so the
 * distinction is kept for the record rather than for the model.
 */
export type GaveUpReason = "no_idea" | "saw_solution";

/**
 * Which entry point produced the event. Unknown values are preserved so a
 * newer client can still read an older one's log.
 */
export type AttemptSource = "zen" | "recommend" | (string & {});

interface EventBase {
  /** Stable id, used to deduplicate events on import. */
  id: string;
  /** LeetCode question_id. */
  qid: string;
  /** When the event happened, epoch ms (defaults to the record time). */
  at: number;
}

interface AttemptBase extends EventBase {
  /** Top-level discriminator so future event kinds can join the log. */
  type: "attempt";
  src: AttemptSource;
  /**
   * How long the user spent on the problem, in minutes.
   *
   * This is the only duration fact: the felt-difficulty band is derived from
   * it, so a record can never carry a band that disagrees with its own
   * duration. Values the tracker did not measure (typed by hand, or carried
   * over from a v2 band) are marked by `timed` and given a wider error term.
   */
  minutes: number;
  /** True when `minutes` came from the tracker rather than from the user. */
  timed?: true;
  /**
   * True when `minutes` was inferred rather than observed — currently only by
   * the v2 conversion, which fills in the midpoint of the band the user picked.
   *
   * Kept apart from a hand-typed value because the two have different worth:
   * a typed duration is a (noisy) report, an imputed one is our own guess. The
   * calibration check has to be able to drop the guesses, or it would be
   * testing the model against its own assumptions.
   */
  imputed?: true;
  /**
   * The problem's difficulty at the time of the attempt.
   *
   * Snapshotted on purpose: the scheduler needs it to judge whether the felt
   * duration was fast or slow *for that level*, and deriving it from the frozen
   * question data would require the store to know about the question pool.
   * Older events simply lack it and fall back to the absolute model.
   */
  rating?: number;
}

export interface SolvedAttempt extends AttemptBase {
  outcome: "solved";
  independence: Independence;
  /**
   * "There is something here worth drilling" — a transferable fragment such as
   * an API usage or a template. Orthogonal to difficulty: a five-minute solve
   * can still carry a template worth memorising.
   *
   * The mode is sticky: it stays on until a later solve is submitted without
   * it, and a give-up in between does not clear it.
   */
  revisit?: boolean;
}

export interface GaveUpAttempt extends AttemptBase {
  outcome: "gaveup";
  reason: GaveUpReason;
}

export type AttemptEvent = SolvedAttempt | GaveUpAttempt;

/**
 * "Do not offer me this problem again."
 *
 * A preference about the candidate, not an observation of an attempt, which is
 * why it is its own event kind: it must never enter the difficulty estimate,
 * and it needs to be revocable by deleting it. A later attempt on the same
 * question also revives it, because the latest event wins.
 */
export interface DismissEvent extends EventBase {
  type: "dismiss";
}

/** Future event kinds (bookmarks, notes, ...) join this union. */
export type ProgressEvent = AttemptEvent | DismissEvent;

/** The whole persisted document, stored under a single localStorage key. */
export interface ProgressStore {
  version: 3;
  installedAt: number;
  /** Ordered by (at, id). */
  events: ProgressEvent[];
}
