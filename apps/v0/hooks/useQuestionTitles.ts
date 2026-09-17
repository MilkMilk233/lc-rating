"use client";

// English problem titles.
//
// They live in their own file rather than inside zenk.json so the ~2.3k strings
// are stored once and readers using the Chinese UI never download them: the
// query is disabled unless the locale is English, so switching costs one 30KB
// (gzip) request and nothing for everyone else.
//
// Upstream covers contest problems only, and one question in the pool is
// missing there; `titleFor` therefore always takes the Chinese title as a
// fallback rather than returning undefined.

import { useI18n } from "@hooks/useI18n";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

export type QuestionTitles = Record<string, string>;

let titlesCache: Promise<QuestionTitles> | undefined;

export function loadQuestionTitles() {
  titlesCache ??= fetch("/titles-en.json", { cache: "force-cache" })
    .then((res) => res.json())
    .then((result: QuestionTitles) => result);

  return titlesCache;
}

export function useQuestionTitles() {
  const { locale } = useI18n();

  const { data = {}, isFetching } = useQuery({
    queryKey: ["titles-en"],
    queryFn: loadQuestionTitles,
    enabled: locale === "en",
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
  });

  return { titles: data, isPending: locale === "en" && isFetching };
}

/**
 * Returns a `(qid, chineseTitle) => title` resolver that follows the locale.
 * Components pass the Chinese title they already have, so nothing breaks while
 * the English file is still in flight.
 */
export function useQuestionTitle() {
  const { locale } = useI18n();
  const { titles } = useQuestionTitles();

  return useCallback(
    (qid: string | number, fallback: string) =>
      locale === "en" ? titles[String(qid)] ?? fallback : fallback,
    [locale, titles],
  );
}
