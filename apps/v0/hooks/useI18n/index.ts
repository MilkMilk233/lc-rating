"use client";

// React binding for ./messages, which owns the copy and the pure lookup.
//
// The setting began as `useLeetCodeLanguage`, because all it did was pick
// between leetcode.cn and leetcode.com for outbound links. It now drives the
// whole interface as well: one toggle, because a reader who wants English
// problem pages almost certainly wants English buttons too. The localStorage
// key keeps its old name so nobody's existing choice is silently reset.

import useStorage from "@hooks/useStorage";
import { useCallback } from "react";
import { LOCALE_KEY, translate } from "./messages";
import type { Locale, MessageKey, TranslateParams } from "./messages";

export { LOCALE_KEY, translate } from "./messages";
export type {
  Locale,
  Message,
  MessageKey,
  Translate,
  TranslateParams,
} from "./messages";

export function useI18n() {
  const [locale = "cn", setLocale] = useStorage<Locale>(LOCALE_KEY, {
    defaultValue: "cn",
  });

  const t = useCallback(
    (key: MessageKey, params?: TranslateParams) =>
      translate(locale, key, params),
    [locale],
  );

  const toggle = useCallback(() => {
    setLocale(locale === "cn" ? "en" : "cn");
  }, [locale, setLocale]);

  return {
    locale,
    setLocale,
    toggle,
    t,
    isCn: locale === "cn",
    isEn: locale === "en",
    /** Locale as the LeetCode host selector expects it. */
    language: locale,
  };
}
