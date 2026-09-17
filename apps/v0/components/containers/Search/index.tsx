"use client";

// Question lookup: find a question by number, title, algorithm tag or contest,
// see whether it has been practised and when it is due, then jump to it.
//
// Deliberately NOT a second /zen: /zen owns rating/tag/outcome filtering over
// the whole pool. This page owns lookup, so its only filter is "hide what I
// have already touched" and broad tag queries hand off to /zen.

import Loading from "@components/Loading";
import ProgressRecordPanel from "@components/ProgressRecordPanel";
import RatingCircle, { ColorRating } from "@components/RatingCircle";
import { useI18n } from "@hooks/useI18n";
import { useQuestionTitle } from "@hooks/useQuestionTitles";
import type { Locale } from "@hooks/useI18n";
import { useProgressStore } from "@hooks/useProgressStore";
import { attemptLabel } from "@hooks/useProgressStore/bands";
import { isDue } from "@hooks/useProgressStore/srs";
import {
  MATCH_REASON_KEY,
  MIN_QUESTION_ID,
  useQuestionSearch,
} from "@hooks/useQuestionSearch";
import type { SearchHit } from "@hooks/useQuestionSearch";
import { leetCodeContestUrl, leetCodeProblemUrl } from "@utils/leetcodeLinks";
import clsx from "clsx";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Container, Modal } from "react-bootstrap";
import { LuSearch, LuX } from "react-icons/lu";

const VISIBLE_LIMIT = 30;
const TAG_CHIP_LIMIT = 6;
// Example queries, not labels: the English ones are the English tag names,
// which the index matches just as well as the Chinese ones.
const SUGGESTIONS: Record<Locale, string[]> = {
  cn: ["动态规划", "二分查找", "并查集", "two sum", "144"],
  en: ["dynamic programming", "binary search", "union find", "two sum", "144"],
};

/** A bare number the pool cannot contain, so the empty state can say why. */
const looksLikeMissingQid = (query: string) =>
  /^\d{1,4}$/.test(query) && Number(query) < MIN_QUESTION_ID;

export default function Search() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language, isCn, t, locale } = useI18n();
  const titleOf = useQuestionTitle();
  const { derived } = useProgressStore();
  const { currentByQid, scheduleByQid } = derived;

  const [query, setQuery] = useState("");
  const [onlyTodo, setOnlyTodo] = useState(false);
  const [selected, setSelected] = useState(0);
  const [recordTarget, setRecordTarget] = useState<SearchHit | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const restored = useRef(false);

  const deferredQuery = useDeferredValue(query);
  const { hits, ready, total } = useQuestionSearch(deferredQuery);

  // Restore ?q= once on mount. The value cannot seed useState because the
  // static export prerenders with empty search params.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const initial = searchParams.get("q");
    if (initial) setQuery(initial);
  }, [searchParams]);

  // Skipped on the first run so the restore above is not immediately undone by
  // a replace() that still sees an empty query.
  const skipSync = useRef(true);
  useEffect(() => {
    if (skipSync.current) {
      skipSync.current = false;
      return;
    }
    router.replace(
      deferredQuery ? `/search?q=${encodeURIComponent(deferredQuery)}` : "/search",
      { scroll: false },
    );
  }, [deferredQuery, router]);

  const filtered = useMemo(
    () =>
      onlyTodo
        ? hits.filter((hit) => !currentByQid.has(String(hit.doc.qid)))
        : hits,
    [hits, onlyTodo, currentByQid],
  );
  const visible = filtered.slice(0, VISIBLE_LIMIT);
  const hidden = filtered.length - visible.length;

  useEffect(() => {
    setSelected(0);
  }, [deferredQuery, onlyTodo]);

  // The tag most of the results matched, so a broad query can be continued in
  // /zen with that filter already applied.
  const dominantTag = useMemo(() => {
    if (hidden <= 0) return null;
    const counts = new Map<string, { en: string; cn: string; count: number }>();
    filtered.forEach((hit) => {
      if (!hit.tag) return;
      const entry = counts.get(hit.tag);
      if (entry) entry.count += 1;
      else counts.set(hit.tag, { en: hit.tag, cn: hit.tagCn ?? hit.tag, count: 1 });
    });
    let best: { en: string; cn: string; count: number } | null = null;
    counts.forEach((entry) => {
      if (!best || entry.count > best.count) best = entry;
    });
    return best;
  }, [filtered, hidden]);

  const openQuestion = useCallback(
    (hit: SearchHit | undefined) => {
      if (!hit) return;
      window.open(leetCodeProblemUrl(hit.doc.slug, language), "_blank", "noopener");
    },
    [language],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // The record panel owns the keyboard while it is open (1/0 outcome,
      // 1-5 band, S, D, Esc), so this handler stands down entirely.
      if (recordTarget) return;

      // Enter/arrows/Esc belong to the IME while a Chinese candidate list is
      // open; acting on them would fire shortcuts mid-word.
      if (event.isComposing || event.keyCode === 229) return;

      const target = event.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      const inSearchInput = target === inputRef.current;

      if (event.metaKey || event.ctrlKey) {
        if (event.key.toLowerCase() === "k") {
          event.preventDefault();
          inputRef.current?.focus();
          inputRef.current?.select();
        }
        return;
      }
      if (event.altKey) return;

      if (event.key === "/" && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
        return;
      }
      // Single-letter shortcuts would be swallowed while typing, so they only
      // apply once focus has left the box (Esc, Tab or a click).
      if (typing && !inSearchInput) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelected((index) => Math.min(index + 1, visible.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelected((index) => Math.max(index - 1, 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        openQuestion(visible[selected]);
      } else if (event.key === "Escape") {
        if (query) setQuery("");
        else inputRef.current?.blur();
      } else if (!typing && event.key.toLowerCase() === "r") {
        const hit = visible[selected];
        if (hit) {
          event.preventDefault();
          setRecordTarget(hit);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, selected, query, openQuestion, recordTarget]);

  const renderHit = (hit: SearchHit, index: number) => {
    const qid = String(hit.doc.qid);
    const current = currentByQid.get(qid);
    const schedule = scheduleByQid.get(qid);
    const tags = isCn ? hit.doc.tagsCn : hit.doc.tagsEn;

    return (
      <li
        key={qid}
        className={clsx("search-row", { active: index === selected })}
        onMouseEnter={() => setSelected(index)}
      >
        <div className="search-row-main">
          <RatingCircle rating={hit.doc.rating} />
          <ColorRating rating={hit.doc.rating}>
            {hit.doc.rating.toFixed(0)}
          </ColorRating>
          <a
            className="search-title"
            href={leetCodeProblemUrl(hit.doc.slug, language)}
            target="_blank"
            rel="noreferrer"
          >
            <span className="search-qid">#{hit.doc.qid}</span> {titleOf(hit.doc.qid, hit.doc.title)}
          </a>
          <span className="search-reason">{t(MATCH_REASON_KEY[hit.reason])}</span>
          <span className="search-actions">
            <button
              type="button"
              className={clsx("pc-state", { recorded: !!current })}
              onClick={() => setRecordTarget(hit)}
              title={current ? t("search.reRecord") : t("search.record")}
            >
              {attemptLabel(current, t)}
            </button>
            {isDue(schedule, Date.now()) && <span className="zen-due">{t("zen.due")}</span>}
          </span>
        </div>

        <div className="search-row-foot">
          {tags.slice(0, TAG_CHIP_LIMIT).map((tag) => (
            <span className="search-tag" key={tag}>
              {tag}
            </span>
          ))}
          {tags.length > TAG_CHIP_LIMIT && (
            <span className="search-tag more">+{tags.length - TAG_CHIP_LIMIT}</span>
          )}
          <a
            className="search-contest"
            href={leetCodeContestUrl(hit.doc.contestSlug, language)}
            target="_blank"
            rel="noreferrer"
          >
            {hit.doc.contest}
          </a>
        </div>
      </li>
    );
  };

  const numberish = /^\d{1,4}$/.test(deferredQuery);

  return (
    <Container fluid className="zen-container page-shell">
      <header className="page-heading">
        <div>
          <p className="eyebrow">Lookup</p>
          <h1 className="page-title">{t("search.title")}</h1>
          <p className="page-description">
            {t("search.description")}
          </p>
        </div>
        <div className="metric-strip">
          <span className="metric-pill">
            {t("search.pool")} <strong>{total}</strong>
          </span>
          {deferredQuery && (
            <span className="metric-pill">
              {t("search.hits")} <strong>{filtered.length}</strong>
            </span>
          )}
        </div>
      </header>

      <div className="data-panel search-panel">
        <div className="search-box">
          <LuSearch aria-hidden size={20} />
          <input
            ref={inputRef}
            className="search-input"
            value={query}
            autoFocus
            spellCheck={false}
            placeholder={t("search.placeholder")}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t("search.title")}
          />
          {query ? (
            <button
              type="button"
              className="search-clear"
              aria-label={t("search.clear")}
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
            >
              <LuX size={18} />
            </button>
          ) : null}
        </div>

        <div className="search-controls">
          <label className="search-toggle">
            <input
              type="checkbox"
              checked={onlyTodo}
              onChange={(event) => setOnlyTodo(event.target.checked)}
            />
            {t("search.onlyTodo")}
          </label>
          <span className="search-kbd-hints">
            <kbd className="kbd-hint">↑</kbd>
            <kbd className="kbd-hint">↓</kbd> {t("search.hint.keys")}
            <kbd className="kbd-hint">Enter</kbd> {t("search.hint.open")}
            <kbd className="kbd-hint">R</kbd> {t("search.hint.record")}
            <kbd className="kbd-hint">/</kbd> {t("search.hint.focus")}
          </span>
        </div>

        {!ready ? (
          <Loading />
        ) : !deferredQuery ? (
          <div className="search-empty">
            <p>{t("search.empty.prompt")}</p>
            <div className="search-suggestions">
              {SUGGESTIONS[locale].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setQuery(item);
                    inputRef.current?.focus();
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
            <p className="search-note">
              {t("search.empty.note", { total, min: MIN_QUESTION_ID })}
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="search-empty">
            <p>
              {t("search.noMatch", { query: deferredQuery })}
              {onlyTodo ? t("search.noMatch.excluded") : ""}
            </p>
            <p className="search-note">
              {looksLikeMissingQid(deferredQuery)
                ? t("search.noMatch.missingQid", {
                    query: deferredQuery,
                    min: MIN_QUESTION_ID,
                  })
                : numberish
                  ? t("search.noMatch.number")
                  : t("search.noMatch.generic")}
            </p>
          </div>
        ) : (
          <>
            <ul className="search-results">{visible.map(renderHit)}</ul>

            {hidden > 0 && (
              <div className="search-more">
                <span>
                  {t("search.more", { total: filtered.length, shown: VISIBLE_LIMIT })}
                </span>
                {dominantTag && (
                  <Link
                    className="search-handoff"
                    href={`/zen?tags=${encodeURIComponent(dominantTag.en)}`}
                  >
                    {t("search.handoff", { tag: dominantTag.cn })}
                  </Link>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <Modal
        show={!!recordTarget}
        onHide={() => setRecordTarget(null)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>{t("record.title")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {recordTarget && (
            <ProgressRecordPanel
              qid={String(recordTarget.doc.qid)}
              questionTitle={titleOf(
                recordTarget.doc.qid,
                recordTarget.doc.title,
              )}
              rating={recordTarget.doc.rating}
              source="search"
              onRecorded={() => setRecordTarget(null)}
              onCancel={() => setRecordTarget(null)}
            />
          )}
        </Modal.Body>
      </Modal>
    </Container>
  );
}
