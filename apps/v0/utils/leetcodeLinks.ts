import type { Locale } from "@hooks/useI18n";

const HOSTS: Record<Locale, string> = {
  cn: "https://leetcode.cn",
  en: "https://leetcode.com",
};

export function leetCodeHost(language: Locale) {
  return HOSTS[language];
}

export function leetCodeProblemUrl(slug: string, language: Locale) {
  return `${leetCodeHost(language)}/problems/${slug}`;
}

export function leetCodeContestUrl(slug: string, language: Locale) {
  return `${leetCodeHost(language)}/contest/${slug}`;
}

export function translateLeetCodeUrl(
  url: string | undefined,
  language: Locale
) {
  if (!url) return "";
  return url
    .replace("https://leetcode.cn", leetCodeHost(language))
    .replace("https://leetcode.com", leetCodeHost(language));
}

export function translateLeetCodeHtml(
  html: string | undefined,
  language: Locale
) {
  if (!html) return "";
  return html
    .replaceAll("https://leetcode.cn", leetCodeHost(language))
    .replaceAll("https://leetcode.com", leetCodeHost(language));
}
