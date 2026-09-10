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

import {
  EASY_MODE_MARGIN,
  MIN_TOTAL_WEIGHT,
  targetForTags,
} from "./ability";
import type { AbilityEstimate, TargetAdjustment } from "./ability";
import type { DerivedProgress } from "./derive";
import { DAY_MS, hashUnit, isDue, isGraduated, isLeech, overdueDays, urgency } from "./srs";
import type { AttemptEvent, EffortBand } from "./types";

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
  reason: string;
}

/** Fresh problems per tag per day. */
export const TAG_DAILY_CAP = 2;

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
 * Bands that mean "this pattern is already internalised".
 *
 * Re-solving such a problem mostly tests whether you remember *that* solution,
 * not whether you can recognise the pattern in a new problem. So its review
 * slot is converted into a sibling: a different problem sharing a tag.
 */
const EASY_MASTERED_BANDS: readonly EffortBand[] = ["LE5", "L5_15"];

function isEasyMastered(attempt: AttemptEvent | undefined): boolean {
  return (
    !!attempt &&
    attempt.outcome === "solved" &&
    attempt.independence === "solo" &&
    EASY_MASTERED_BANDS.includes(attempt.band)
  );
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
): string {
  if (ability.totalWeight < MIN_TOTAL_WEIGHT) {
    return "从基础题开始，先把地基打牢";
  }
  const novel = candidate.tags.find((tag) => !tagSolved.has(tag));
  if (novel) return `新题型：${novel}`;
  if (offset <= -100) return `先找回手感，难度 ≈${target}`;
  if (offset >= 80) return `状态不错，难度上调到 ≈${target}`;
  return `难度贴合你当前的水平 ≈${target}`;
}

export interface BuildQueueParams {
  candidates: Candidate[];
  byQid: Map<string, Candidate>;
  derived: DerivedProgress;
  ability: AbilityEstimate;
  /** Short-term difficulty adjustment (form, frustration, momentum). */
  adjustment: TargetAdjustment;
  now: number;
}

export function buildRecommendationQueue({
  candidates,
  byQid,
  derived,
  ability,
  adjustment,
  now,
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
    const candidate = byQid.get(qid);
    if (!candidate || candidate.paidOnly) return;

    // Graduated problems stop taking up review slots.
    if (isGraduated(derived.attemptsByQid.get(qid) ?? [])) return;

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
        ? "待强化：把这道题里的模板 / 用法再过一遍"
        : leech
          ? `这题已经卡了 ${schedule?.failCount ?? 0} 次，先放一放，练练同类更简单的`
          : overdue > 0
            ? `逾期 ${overdue} 天，先把它复习掉`
            : "今天到期，趁热复习一遍",
    };
  });

  // ---- 2. fresh problems, scored against their own target ---------------
  const scored = candidates
    .filter(
      (candidate) => !currentByQid.has(candidate.qid) && !candidate.paidOnly,
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
    if (!blocked || !isEasyMastered(currentByQid.get(qid))) continue;

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
      reason: `已经会了，换个题面巩固「${sharedTag ?? "同类"}」`,
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
            reason: `先垫一道更简单的「${sharedTag ?? "同类"}」题`,
          });
        }
      }
    }

    block.push(item);
    reviewBlocks.push(block);
  }

  const remainingFresh = fresh.filter((item) => !consumed.has(item.qid));

  // ---- 5. interleave ----------------------------------------------------
  const queue: QueueItem[] = [];
  const length = Math.max(reviewBlocks.length, remainingFresh.length);
  for (let i = 0; i < length; i += 1) {
    if (i < reviewBlocks.length) queue.push(...reviewBlocks[i]);
    if (i < remainingFresh.length) queue.push(remainingFresh[i]);
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
        item.reason = "先找回手感，来一道稳的";
        queue.unshift(item);
      } else {
        queue.unshift({
          qid: safe.candidate.qid,
          pool: "new",
          reason: "先找回手感，来一道稳的",
        });
      }
    }
  }

  return queue;
}
