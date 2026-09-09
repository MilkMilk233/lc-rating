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
  MIN_TOTAL_WEIGHT,
  targetForTags,
} from "./ability";
import type { AbilityEstimate } from "./ability";
import type { DerivedProgress } from "./derive";
import { isDue, isLeech, overdueDays } from "./srs";
import type { AttemptEvent } from "./types";

export interface Candidate {
  qid: string;
  rating: number;
  paidOnly: boolean;
  tags: string[];
}

export type QueuePool = "review" | "revive" | "new" | "prerequisite";

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
): string {
  if (ability.totalWeight < MIN_TOTAL_WEIGHT) {
    return "从基础题开始，先把地基打牢";
  }
  const novel = candidate.tags.find((tag) => !tagSolved.has(tag));
  if (novel) return `新题型：${novel}`;
  return `难度贴合你当前的水平 ≈${target}`;
}

export interface BuildQueueParams {
  candidates: Candidate[];
  byQid: Map<string, Candidate>;
  derived: DerivedProgress;
  ability: AbilityEstimate;
  now: number;
}

export function buildRecommendationQueue({
  candidates,
  byQid,
  derived,
  ability,
  now,
}: BuildQueueParams): QueueItem[] {
  const { currentByQid, scheduleByQid, currentSolved } = derived;

  const tagSolved = new Map<string, number>();
  for (const attempt of currentSolved) {
    const candidate = byQid.get(attempt.qid);
    if (!candidate) continue;
    for (const tag of candidate.tags) {
      tagSolved.set(tag, (tagSolved.get(tag) ?? 0) + 1);
    }
  }

  // ---- 1. due reviews, most overdue first -------------------------------
  const due: { qid: string; dueAt: number }[] = [];
  scheduleByQid.forEach((schedule, qid) => {
    if (!isDue(schedule, now)) return;
    const candidate = byQid.get(qid);
    if (!candidate || candidate.paidOnly) return;
    due.push({ qid, dueAt: schedule.dueAt });
  });
  due.sort((a, b) => a.dueAt - b.dueAt);

  const reviews: QueueItem[] = due.map(({ qid }) => {
    const schedule = scheduleByQid.get(qid);
    const current = currentByQid.get(qid);
    const overdue = overdueDays(schedule, now);
    const leech = isLeech(schedule);

    return {
      qid,
      pool: current?.outcome === "gaveup" ? "revive" : "review",
      reason: leech
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
      const target = targetForTags(candidate.tags, ability);
      return {
        candidate,
        target,
        score: scoreCandidate(candidate, target, tagSolved),
      };
    })
    .filter((entry) => entry.candidate.rating <= entry.target + HARD_CEILING)
    .sort((a, b) => b.score - a.score);

  // ---- 3. per-tag diversity cap ----------------------------------------
  const tagCount = new Map<string, number>();
  const picked: typeof scored = [];
  for (const entry of scored) {
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
    reason: reasonForNew(entry.candidate, entry.target, tagSolved, ability),
  }));

  // ---- 4. prerequisite before a too-hard "no idea" review --------------
  // Each review becomes a block so a prerequisite stays glued to its problem
  // when the queue is interleaved with fresh material.
  const consumed = new Set<string>();
  const reviewBlocks: QueueItem[][] = [];

  for (const item of reviews) {
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
  return queue;
}
