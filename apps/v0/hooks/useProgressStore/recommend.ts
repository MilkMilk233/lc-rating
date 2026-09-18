// Recommendation queue builder.
//
// Pure functions over the derived projections, so the ordering rules stay
// testable and the React component is just presentation.
//
// Rules:
//   1. due reviews first (most overdue first), but interleaved with new work;
//   2. fresh problems scored on normalized terms (difficulty fit + tag novelty)
//      against their own per-tag target;
//   3. at most TAG_DAILY_CAP fresh problems per tag;
//   4. a "no idea" review that is still above the user's level is preceded by an
//      easier problem sharing a tag;
//   5. leeches (3+ consecutive give-ups) are parked and get the same treatment.

import type { Message } from "@hooks/useI18n/messages";
import {
  EASY_MODE_MARGIN,
  MIN_TOTAL_WEIGHT,
  targetForTags,
} from "./ability";
import type { AbilityEstimate, TargetAdjustment } from "./ability";
import type { DerivedProgress } from "./derive";
import { hasHeadroom } from "./pace";
import {
  DAY_MS,
  hashUnit,
  isDue,
  isFluentSolve,
  isGraduated,
  isLeech,
  overdueDays,
  urgency,
} from "./srs";
import type { AttemptEvent } from "./types";

export interface Candidate {
  qid: string;
  rating: number;
  paidOnly: boolean;
  tags: string[];
}

export type QueuePool =
  | "review"
  | "revive"
  | "revisit"
  | "new"
  | "prerequisite"
  | "sibling";

export interface QueueItem {
  qid: string;
  pool: QueuePool;
  /** Rendered by the caller: the model does not own the locale. */
  reason: Message;
}

/** Fresh problems per tag per day. */
export const TAG_DAILY_CAP = 2;

/**
 * New problems interleaved between two review blocks. 1 means strict
 * alternation (one review, one fresh); 2 means two fresh per review, so
 * reviews take about a third of a session.
 */
export const FRESH_PER_REVIEW = 2;

/** Rating distance at which difficulty fit drops to 0.5. */
export const PROXIMITY_SCALE = 80;

/** Weight of tag novelty vs difficulty fit (normalized 0..1 terms). */
export const NOVELTY_WEIGHT = 0.3;

/** Never serve fresh problems this far above their target. */
export const HARD_CEILING = 350;

/** Only insert a prerequisite when ability is this far below the problem. */
export const PREREQUISITE_ABILITY_GAP = 100;

/** The prerequisite must be this much easier than the blocked problem. */
export const PREREQUISITE_RATING_GAP = 150;

/**
 * A review is converted into a sibling when the problem is already comfortable:
 * solved at or above the pace for its difficulty, *and* sitting well below the
 * user's level. Re-solving such a problem mostly tests whether you remember
 * *that* solution, not whether you can recognise the pattern in a new one.
 *
 * Pace alone is not enough — a frontier problem solved at exactly the expected
 * pace is still at the frontier, so it keeps its review slot.
 */
function isComfortable(
  attempt: AttemptEvent | undefined,
  rating: number,
  abilityGlobal: number,
): boolean {
  return isFluentSolve(attempt) && hasHeadroom(rating, abilityGlobal);
}

/**
 * A problem this many intervals past its due date is treated as "half
 * forgotten" rather than urgent. Instead of occupying the front of the stream
 * (or forming a wall after a break), it is dripped back in roughly once every
 * OVERDUE_SPREAD_DAYS days. SuperMemo calls the same idea auto-postpone.
 */
export const OVERDUE_COMPRESSION_FACTOR = 3;
export const OVERDUE_SPREAD_DAYS = 14;

/** Whether a heavily overdue problem's turn has come today. */
export function surfacesToday(qid: string, now: number): boolean {
  const slot = Math.floor(hashUnit(qid) * OVERDUE_SPREAD_DAYS);
  return slot === Math.floor(now / DAY_MS) % OVERDUE_SPREAD_DAYS;
}

/** Difficulty fit (1 at the target, 0.5 at PROXIMITY_SCALE away). */
export function proximityScore(rating: number, target: number): number {
  return 1 / (1 + Math.abs(rating - target) / PROXIMITY_SCALE);
}

/** Average "newness" of a problem's tags, each in (0, 1]. */
export function noveltyScore(
  tags: string[],
  tagSolved: Map<string, number>,
): number {
  if (tags.length === 0) return 0.5;
  return (
    tags.reduce((sum, tag) => sum + 1 / (1 + (tagSolved.get(tag) ?? 0)), 0) /
    tags.length
  );
}

export function scoreCandidate(
  candidate: Candidate,
  target: number,
  tagSolved: Map<string, number>,
): number {
  const proximity = proximityScore(candidate.rating, target);
  const novelty = noveltyScore(candidate.tags, tagSolved);
  return (1 - NOVELTY_WEIGHT) * proximity + NOVELTY_WEIGHT * novelty;
}

function reasonForNew(
  candidate: Candidate,
  target: number,
  tagSolved: Map<string, number>,
  ability: AbilityEstimate,
  offset: number,
): Message {
  if (ability.totalWeight < MIN_TOTAL_WEIGHT) {
    return { key: "reason.basics" };
  }
  const novel = candidate.tags.find((tag) => !tagSolved.has(tag));
  if (novel) return { key: "reason.newTag", params: { tag: novel } };
  if (offset <= -100) return { key: "reason.regainFeel", params: { target } };
  if (offset >= 80) return { key: "reason.levelUp", params: { target } };
  return { key: "reason.fit", params: { target } };
}

export interface BuildQueueParams {
  candidates: Candidate[];
  byQid: Map<string, Candidate>;
  derived: DerivedProgress;
  ability: AbilityEstimate;
  /** Short-term difficulty adjustment (form, frustration, momentum). */
  adjustment: TargetAdjustment;
  /**
   * Fresh problems still owed before the next review.
   *
   * The queue is recomputed on every step so it reflects the latest ability
   * estimate, which means the interleave's position inside its own pattern has
   * to be handed back in — otherwise each rebuild would restart at "review
   * first" and reviews would arrive back to back.
   */
  leadFresh?: number;
  /** Questions already served in this session, whatever their outcome. */
  skip?: Set<string>;
  now: number;
}

export function buildRecommendationQueue({
  candidates,
  byQid,
  derived,
  ability,
  adjustment,
  now,
  leadFresh = 0,
  skip,
}: BuildQueueParams): QueueItem[] {
  const { currentByQid, scheduleByQid, currentSolved } = derived;
  const offset = adjustment.offset;
  const targetFor = (tags: string[]) =>
    targetForTags(tags, ability) + offset;

  const tagSolved = new Map<string, number>();
  for (const attempt of currentSolved) {
    const candidate = byQid.get(attempt.qid);
    if (!candidate) continue;
    for (const tag of candidate.tags) {
      tagSolved.set(tag, (tagSolved.get(tag) ?? 0) + 1);
    }
  }

  // ---- 1. due reviews, most *relatively* overdue first ------------------
  // Absolute lateness is misleading: 6 days late on a 3-day interval matters,
  // 6 days late on a 100-day interval does not.
  const due: { qid: string; dueAt: number; urgency: number }[] = [];
  scheduleByQid.forEach((schedule, qid) => {
    if (!isDue(schedule, now)) return;
    // A dismissed question is never offered again, however overdue it is.
    if (derived.dismissed.has(qid)) return;
    // Nor one already served this session, which is how "another one" sticks.
    if (skip?.has(qid)) return;
    const candidate = byQid.get(qid);
    if (!candidate || candidate.paidOnly) return;

    // Graduated problems stop taking review slots — but only once they sit
    // comfortably below the user's level. A frontier problem solved at the
    // expected pace is not mastered, it is simply at the frontier.
    if (
      isGraduated(derived.attemptsByQid.get(qid) ?? []) &&
      hasHeadroom(candidate.rating, ability.global)
    ) {
      return;
    }

    // Heavily overdue problems are dripped back in instead of forming a wall.
    const overdue = overdueDays(schedule, now);
    if (
      overdue >
      OVERDUE_COMPRESSION_FACTOR * Math.max(1, schedule.intervalDays)
    ) {
      if (!surfacesToday(qid, now)) return;
    }

    due.push({ qid, dueAt: schedule.dueAt, urgency: urgency(schedule, now) });
  });
  due.sort((a, b) => b.urgency - a.urgency || a.dueAt - b.dueAt);

  const reviews: QueueItem[] = due.map(({ qid }) => {
    const schedule = scheduleByQid.get(qid);
    const current = currentByQid.get(qid);
    const overdue = overdueDays(schedule, now);
    const leech = isLeech(schedule);
    const drill = schedule?.revisit === true;

    return {
      qid,
      pool: drill
        ? "revisit"
        : current?.outcome === "gaveup"
          ? "revive"
          : "review",
      reason: drill
        ? { key: "reason.drill" }
        : leech
          ? {
              key: "reason.leech",
              params: { count: schedule?.failCount ?? 0 },
            }
          : overdue > 0
            ? { key: "reason.overdue", params: { days: overdue } }
            : { key: "reason.dueToday" },
    };
  });

  // ---- 2. fresh problems, scored against their own target ---------------
  const scored = candidates
    .filter(
      (candidate) =>
        !currentByQid.has(candidate.qid) &&
        !candidate.paidOnly &&
        !derived.dismissed.has(candidate.qid) &&
        !skip?.has(candidate.qid),
    )
    .map((candidate) => {
      const target = targetFor(candidate.tags);
      return {
        candidate,
        target,
        score: scoreCandidate(candidate, target, tagSolved),
      };
    })
    .filter((entry) => entry.candidate.rating <= entry.target + HARD_CEILING)
    .sort((a, b) => b.score - a.score);

  // ---- 3. sibling substitution -----------------------------------------
  // An easy-mastered review is converted into a different problem sharing a
  // tag: re-solving the same one mostly tests memory of that solution. This
  // runs before the diversity pick so the converted slot reserves its tag.
  const tagCount = new Map<string, number>();
  const consumed = new Set<string>();
  const siblingFor = new Map<string, QueueItem>();

  for (const { qid } of due) {
    const blocked = byQid.get(qid);
    // Drill mode means the user wants *this* problem again, not a sibling.
    if (scheduleByQid.get(qid)?.revisit === true) continue;
    if (
      !blocked ||
      !isComfortable(currentByQid.get(qid), blocked.rating, ability.global)
    ) {
      continue;
    }

    const sibling = scored.find((entry) => {
      if (consumed.has(entry.candidate.qid)) return false;
      if (entry.candidate.qid === qid) return false;
      const shared = entry.candidate.tags.filter((tag) =>
        blocked.tags.includes(tag),
      );
      if (shared.length === 0) return false;
      return shared.some((tag) => (tagCount.get(tag) ?? 0) < TAG_DAILY_CAP);
    });
    if (!sibling) continue;

    consumed.add(sibling.candidate.qid);
    const sharedTag = sibling.candidate.tags.find((tag) =>
      blocked.tags.includes(tag),
    );
    if (sharedTag) {
      tagCount.set(sharedTag, (tagCount.get(sharedTag) ?? 0) + 1);
    }
    siblingFor.set(qid, {
      qid: sibling.candidate.qid,
      pool: "sibling",
      reason: { key: "reason.sibling", params: { tag: sharedTag ?? "" } },
    });
  }

  // ---- 4. per-tag diversity cap for the remaining fresh problems --------
  const picked: typeof scored = [];
  for (const entry of scored) {
    if (consumed.has(entry.candidate.qid)) continue;
    const full = entry.candidate.tags.some(
      (tag) => (tagCount.get(tag) ?? 0) >= TAG_DAILY_CAP,
    );
    if (full) continue;
    picked.push(entry);
    for (const tag of entry.candidate.tags) {
      tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
    }
  }

  const fresh: QueueItem[] = picked.map((entry) => ({
    qid: entry.candidate.qid,
    pool: "new" as const,
    reason: reasonForNew(entry.candidate, entry.target, tagSolved, ability, offset),
  }));

  // ---- 5. review blocks: substitution / prerequisite --------------------
  // Each review becomes a block so a prerequisite stays glued to its problem
  // when the queue is interleaved with fresh material.
  const reviewBlocks: QueueItem[][] = [];

  for (const item of reviews) {
    const sibling = siblingFor.get(item.qid);
    if (sibling) {
      reviewBlocks.push([sibling]);
      continue;
    }

    const block: QueueItem[] = [];
    const blocked = byQid.get(item.qid);
    const current: AttemptEvent | undefined = currentByQid.get(item.qid);

    if (
      blocked &&
      current?.outcome === "gaveup" &&
      current.reason === "no_idea"
    ) {
      const target = targetForTags(blocked.tags, ability);
      if (target < blocked.rating - PREREQUISITE_ABILITY_GAP) {
        const prerequisite = scored.find(
          (entry) =>
            !consumed.has(entry.candidate.qid) &&
            entry.candidate.qid !== blocked.qid &&
            entry.candidate.rating <= blocked.rating - PREREQUISITE_RATING_GAP &&
            entry.candidate.tags.some((tag) => blocked.tags.includes(tag)),
        );
        if (prerequisite) {
          consumed.add(prerequisite.candidate.qid);
          const sharedTag = prerequisite.candidate.tags.find((tag) =>
            blocked.tags.includes(tag),
          );
          block.push({
            qid: prerequisite.candidate.qid,
            pool: "prerequisite",
            reason: {
              key: "reason.prerequisite",
              params: { tag: sharedTag ?? "" },
            },
          });
        }
      }
    }

    block.push(item);
    reviewBlocks.push(block);
  }

  const remainingFresh = fresh.filter((item) => !consumed.has(item.qid));

  // ---- 5. interleave ----------------------------------------------------
  // Reviews are spaced out rather than alternated one for one. With a one-to-one
  // mix a session spends half its time re-solving old problems, and because
  // each new solve adds a future review the queue never drains — the ratio is
  // permanent, not a backlog that clears. FRESH_PER_REVIEW buys room for new
  // work; it does not delete reviews, it defers them.
  const queue: QueueItem[] = [];
  let reviewIndex = 0;
  let freshIndex = 0;

  // Resume mid-pattern: a session that has already served some of the fresh
  // problems owed after a review must not start over with another review, or
  // every rebuild would serve reviews back to back and the one-to-two ratio
  // would never hold.
  for (
    let owed = 0;
    owed < leadFresh && freshIndex < remainingFresh.length;
    owed += 1
  ) {
    queue.push(remainingFresh[freshIndex]);
    freshIndex += 1;
  }

  while (
    reviewIndex < reviewBlocks.length ||
    freshIndex < remainingFresh.length
  ) {
    if (reviewIndex < reviewBlocks.length) {
      queue.push(...reviewBlocks[reviewIndex]);
      reviewIndex += 1;
    }
    for (
      let extra = 0;
      extra < FRESH_PER_REVIEW && freshIndex < remainingFresh.length;
      extra += 1
    ) {
      queue.push(remainingFresh[freshIndex]);
      freshIndex += 1;
    }
  }
  // ---- 6. confidence builder -------------------------------------------
  // After repeated "no idea" attempts, lead with something winnable instead of
  // handing the user another wall.
  if (adjustment.easyMode) {
    const safe = scored.find(
      (entry) =>
        entry.candidate.rating <= adjustment.effective - EASY_MODE_MARGIN,
    );
    if (safe) {
      const existing = queue.findIndex(
        (item) => item.qid === safe.candidate.qid,
      );
      if (existing >= 0) {
        const [item] = queue.splice(existing, 1);
        item.reason = { key: "reason.steady" };
        queue.unshift(item);
      } else {
        queue.unshift({
          qid: safe.candidate.qid,
          pool: "new",
          reason: { key: "reason.steady" },
        });
      }
    }
  }

  return queue;
}
