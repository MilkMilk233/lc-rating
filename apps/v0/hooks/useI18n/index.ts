"use client";

// The app's one language setting.
//
// It began as `useLeetCodeLanguage`, because all it did was pick between
// leetcode.cn and leetcode.com for outbound links. It now drives the whole
// interface as well: one toggle, because a reader who wants English problem
// links almost certainly wants English buttons too. The localStorage key keeps
// its old name so nobody's existing choice is silently reset.

import useStorage from "@hooks/useStorage";
import { useCallback } from "react";
import { en } from "./messages/en";
import { zh } from "./messages/zh";
import type { MessageKey, Messages } from "./messages/zh";

export type Locale = "cn" | "en";

/** Legacy key name, kept so the stored preference survives. */
export const LOCALE_KEY = "lc-rating-leetcode-language";

const MESSAGES: Record<Locale, Messages> = { cn: zh, en };

export type TranslateParams = Record<string, string | number>;

/**
 * Look up `key` in `locale`, substituting `{name}` placeholders. A missing
 * translation falls back to Chinese rather than showing a raw key.
 */
export function translate(
  locale: Locale,
  key: MessageKey,
  params?: TranslateParams,
): string {
  const template = MESSAGES[locale]?.[key] ?? zh[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

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
