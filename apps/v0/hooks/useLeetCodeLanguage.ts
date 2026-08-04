import useStorage from "@hooks/useStorage";

export type LeetCodeLanguage = "cn" | "en";

export const LEETCODE_LANGUAGE_KEY = "lc-rating-leetcode-language";

export function useLeetCodeLanguage() {
  const [language = "cn", setLanguage] = useStorage<LeetCodeLanguage>(
    LEETCODE_LANGUAGE_KEY,
    {
      defaultValue: "cn",
    }
  );

  const toggleLanguage = () => {
    setLanguage(language === "cn" ? "en" : "cn");
  };

  return {
    language,
    setLanguage,
    toggleLanguage,
    isCn: language === "cn",
  };
}
