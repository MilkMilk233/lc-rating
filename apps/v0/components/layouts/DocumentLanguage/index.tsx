"use client";

import { useI18n } from "@hooks/useI18n";
import { useEffect } from "react";

/**
 * The static export always ships `<html lang="zh">`, so the document language
 * is corrected on the client once the stored locale is known.
 *
 * It lives in its own component rather than inside `useI18n` because that hook
 * is called by every translated component; this way the DOM write happens once
 * per page instead of once per consumer.
 */
export default function DocumentLanguage() {
  const { isEn } = useI18n();

  useEffect(() => {
    document.documentElement.lang = isEn ? "en" : "zh-CN";
  }, [isEn]);

  return null;
}
