"use client";

// React binding for utils/tagNames: canonical English in values, translated at
// display. See that module for why the rule exists.

import { useI18n } from "@hooks/useI18n";
import { buildZhTagIndex, zhTagName } from "@utils/tagNames";
import { useCallback, useMemo } from "react";
import { useQuestionTags } from "./useQuestionTags";

export function useTagLabel(): (tagEn: string) => string {
  const { isEn } = useI18n();
  const { tags } = useQuestionTags(null);

  const zhByEn = useMemo(() => buildZhTagIndex(tags), [tags]);

  return useCallback(
    (tagEn: string) => (isEn ? tagEn : zhTagName(zhByEn, tagEn)),
    [isEn, zhByEn],
  );
}
