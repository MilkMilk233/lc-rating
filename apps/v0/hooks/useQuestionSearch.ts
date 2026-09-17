"use client";

// Client-side question search over the frozen static data.
//
// There are only ~2.3k questions, so a linear scan with substring matching is
// well under a millisecond per keystroke; no index library and no extra
// network request are needed. `useZen` and `useQuestionTags` are already
// cached by react-query, so opening /search after visiting /zen costs nothing.
//
// Why tags matter so much: titles are problem names ("爬楼梯"), not algorithm
// names. "动态规划", "贪心" and "并查集" match ZERO titles but hundreds of
// tagged questions, so tag matching is the backbone of this search rather
// than a nice-to-have.

import { useMemo } from "react";
import { useQuestionTags } from "./useQuestionTags";
import { useZen } from "./useZen";

/** The frozen dataset only covers contest questions, which start at #828. */
export const MIN_QUESTION_ID = 828;

export interface SearchDoc {
  qid: number;
  title: string;
  titleLower: string;
  slug: string;
  /** Slug with separators removed, so "twosum" finds "two-sum". */
  slugFlat: string;
  rating: number;
  contest: string;
  contestSlug: string;
  contestLower: string;
  /** Contest number parsed from "第 144 场周赛", or null. */
  contestNumber: number | null;
  /** Chinese and English tag names, index-aligned so a matched tag can be
   * handed to /zen, which keys its filters by the English name. */
  tagsCn: string[];
  tagsEn: string[];
}

/** Which field produced the match, shown to the user as a small hint. */
export type MatchReason = "题号" | "标题" | "英文名" | "标签" | "周赛";

export interface SearchHit {
  doc: SearchDoc;
  score: number;
  reason: MatchReason;
  /** English tag name when the hit came from a tag, for the /zen handoff. */
  tag?: string;
  /** Chinese label for `tag`, so the handoff link can read naturally. */
  tagCn?: string;
}

export type SearchMode = "idle" | "exact";

export interface SearchResult {
  hits: SearchHit[];
  mode: SearchMode;
}

// Scores are intentionally far apart so a stronger field always wins, and are
// summed across query tokens so "二分 查找" ranks a question tagged with both
// above one that only matches either.
const SCORE = {
  qidExact: 1000,
  titleWhole: 900,
  titlePrefix: 520,
  titleIncludes: 340,
  contestNumber: 300,
  slugFlat: 220,
  slugIncludes: 240,
  tagExact: 220,
  tagIncludes: 150,
  contestIncludes: 80,
};

const CONTEST_NUMBER = /第\s*(\d+)\s*场/;
const NUMERIC = /^\d{1,4}$/;

/** Full-width punctuation and digits are common in Chinese input methods. */
export function normalizeQuery(value: string): string {
  return value
    .replace(/[\uff01-\uff5e]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0),
    )
    .replace(/\u3000/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * `qtags.json` stores a `[null, null]` pair for 14 questions that had no tags
 * when the data was frozen, so every read has to survive a missing array.
 */
function cleanTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.every((tag) => typeof tag === "string")
    ? (value as string[])
    : (value.filter((tag) => typeof tag === "string") as string[]);
}

type RawQuestion = {
  question_id: string | number;
  title?: string;
  title_slug?: string;
  rating?: number;
  cont_title?: string;
  cont_title_slug?: string;
  _hash?: number;
};

type RawTagPair = [unknown, unknown] | null | undefined;

export function buildSearchIndex(
  zen: RawQuestion[],
  qtags: Record<string, RawTagPair>,
): SearchDoc[] {
  return zen.map((question) => {
    const pair = qtags[String(question._hash)];
    const title = question.title ?? "";
    const contest = question.cont_title ?? "";
    const contestSlug = question.cont_title_slug ?? "";
    const contestMatch = CONTEST_NUMBER.exec(contest);
    return {
      qid: Number(question.question_id),
      title,
      titleLower: title.toLowerCase(),
      slug: question.title_slug ?? "",
      slugFlat: (question.title_slug ?? "").replace(/[^a-z0-9]/g, ""),
      rating: Number(question.rating) || 0,
      contest,
      contestSlug,
      contestLower: `${contest} ${contestSlug}`.toLowerCase(),
      contestNumber: contestMatch ? Number(contestMatch[1]) : null,
      tagsEn: cleanTags(pair?.[0]),
      tagsCn: cleanTags(pair?.[1]),
    };
  });
}

interface TokenMatch {
  score: number;
  reason: MatchReason;
  tag?: string;
  tagCn?: string;
}

function matchToken(doc: SearchDoc, token: string): TokenMatch | null {
  // A bare number is always a lookup, never a substring hunt: "144" means
  // question #144 or contest #144, not every title containing a 1.
  if (NUMERIC.test(token)) {
    const value = Number(token);
    if (value === doc.qid) return { score: SCORE.qidExact, reason: "题号" };
    if (doc.contestNumber === value) {
      return { score: SCORE.contestNumber, reason: "周赛" };
    }
    return null;
  }

  if (doc.titleLower === token) {
    return { score: SCORE.titleWhole, reason: "标题" };
  }
  if (doc.titleLower.startsWith(token)) {
    return { score: SCORE.titlePrefix, reason: "标题" };
  }
  if (doc.titleLower.includes(token)) {
    return { score: SCORE.titleIncludes, reason: "标题" };
  }

  // "two sum" -> "two-sum", and "twosum" -> "two-sum".
  const slugToken = token.replace(/[\s_]+/g, "-");
  if (slugToken.length >= 2 && doc.slug.includes(slugToken)) {
    return { score: SCORE.slugIncludes, reason: "英文名" };
  }
  const flatToken = token.replace(/[^a-z0-9]/g, "");
  if (flatToken.length >= 3 && doc.slugFlat.includes(flatToken)) {
    return { score: SCORE.slugFlat, reason: "英文名" };
  }

  // Exact tag matches must beat partial ones, otherwise searching "图" would
  // rank "图论" questions alongside the 130 questions actually tagged 图.
  for (let i = 0; i < doc.tagsCn.length; i += 1) {
    const cn = doc.tagsCn[i].toLowerCase();
    const en = (doc.tagsEn[i] ?? "").toLowerCase();
    if (cn === token || en === token) {
      return {
        score: SCORE.tagExact,
        reason: "标签",
        tag: doc.tagsEn[i],
        tagCn: doc.tagsCn[i],
      };
    }
  }
  for (let i = 0; i < doc.tagsCn.length; i += 1) {
    const cn = doc.tagsCn[i].toLowerCase();
    const en = (doc.tagsEn[i] ?? "").toLowerCase();
    if (cn.includes(token) || en.includes(token)) {
      return {
        score: SCORE.tagIncludes,
        reason: "标签",
        tag: doc.tagsEn[i],
        tagCn: doc.tagsCn[i],
      };
    }
  }

  if (token.length >= 3 && doc.contestLower.includes(token)) {
    return { score: SCORE.contestIncludes, reason: "周赛" };
  }
  return null;
}

const byScore = (a: SearchHit, b: SearchHit) =>
  b.score - a.score || a.doc.rating - b.doc.rating || a.doc.qid - b.doc.qid;

export function searchQuestions(
  docs: SearchDoc[],
  rawQuery: string,
): SearchResult {
  const query = normalizeQuery(rawQuery);
  if (!query) return { hits: [], mode: "idle" };

  const tokens = query.split(/\s+/).filter(Boolean);
  const hits: SearchHit[] = [];

  for (let i = 0; i < docs.length; i += 1) {
    const doc = docs[i];
    let total = 0;
    let best: TokenMatch | null = null;
    let matchedAll = true;

    for (let t = 0; t < tokens.length; t += 1) {
      const match = matchToken(doc, tokens[t]);
      if (!match) {
        matchedAll = false;
        break;
      }
      total += match.score;
      if (!best || match.score > best.score) best = match;
    }

    if (matchedAll && best) {
      hits.push({ doc, score: total, reason: best.reason, tag: best.tag, tagCn: best.tagCn });
    }
  }

  hits.sort(byScore);
  return { hits, mode: "exact" };
}

export function useQuestionSearch(query: string): {
  hits: SearchHit[];
  mode: SearchMode;
  ready: boolean;
  total: number;
} {
  const { zen, isPending: zenPending } = useZen();
  const { tags, isPending: tagsPending } = useQuestionTags(null);

  const docs = useMemo(
    () => buildSearchIndex(zen as RawQuestion[], tags as Record<string, RawTagPair>),
    [zen, tags],
  );

  const result = useMemo(() => searchQuestions(docs, query), [docs, query]);

  return {
    hits: result.hits,
    mode: result.mode,
    ready: !zenPending && !tagsPending,
    total: docs.length,
  };
}
