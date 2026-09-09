import { LeetCodeLanguage } from "@hooks/useLeetCodeLanguage";

const HOSTS: Record<LeetCodeLanguage, string> = {
  cn: "https://leetcode.cn",
  en: "https://leetcode.com",
};

export function leetCodeHost(language: LeetCodeLanguage) {
  return HOSTS[language];
}

export function leetCodeProblemUrl(slug: string, language: LeetCodeLanguage) {
  return `${leetCodeHost(language)}/problems/${slug}`;
}

export function leetCodeContestUrl(slug: string, language: LeetCodeLanguage) {
  return `${leetCodeHost(language)}/contest/${slug}`;
}

export function translateLeetCodeUrl(
  url: string | undefined,
  language: LeetCodeLanguage
) {
  if (!url) return "";
  return url
    .replace("https://leetcode.cn", leetCodeHost(language))
    .replace("https://leetcode.com", leetCodeHost(language));
}

export function translateLeetCodeHtml(
  html: string | undefined,
  language: LeetCodeLanguage
) {
  if (!html) return "";
  return html
    .replaceAll("https://leetcode.cn", leetCodeHost(language))
    .replaceAll("https://leetcode.com", leetCodeHost(language));
}
