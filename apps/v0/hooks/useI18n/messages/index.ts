// Pure i18n core: no React, no "use client", so model-layer modules (the SRS
// recommendation queue, storage validation) can name a message key without
// depending on a hook.

import { en } from "./en";
import { zh } from "./zh";
import type { MessageKey, Messages } from "./zh";

export type { MessageKey, Messages } from "./zh";

export type Locale = "cn" | "en";

/** Legacy key name, kept so an existing stored preference survives. */
export const LOCALE_KEY = "lc-rating-leetcode-language";

const MESSAGES: Record<Locale, Messages> = { cn: zh, en };

export type TranslateParams = Record<string, string | number>;

/** A message to be rendered later, e.g. a recommendation's explanation. */
export interface Message {
  key: MessageKey;
  params?: TranslateParams;
}

export type Translate = (key: MessageKey, params?: TranslateParams) => string;

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
