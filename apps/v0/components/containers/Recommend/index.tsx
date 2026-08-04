"use client";

import RatingCircle, { ColorRating } from "@components/RatingCircle";
import { useLeetCodeLanguage } from "@hooks/useLeetCodeLanguage";
import {
  ProgressKeyType,
  useProgressOptions,
  useQuestProgress,
} from "@hooks/useProgress";
import { useQuestionTags } from "@hooks/useQuestionTags";
import { useSolutions } from "@hooks/useSolutions";
import { useZen } from "@hooks/useZen";
import {
  leetCodeContestUrl,
  leetCodeProblemUrl,
  leetCodeSolutionUrl,
} from "@utils/leetcodeLinks";
import {
  STATUS_XP,
  bandFor,
  displayOptionLabel,
  estimateStrength,
} from "@utils/practice";
import clsx from "clsx";
import Link from "next/link";
import { CSSProperties, useMemo, useState } from "react";
import { Container } from "react-bootstrap";
import {
  LuArrowUpRight,
  LuBookOpen,
  LuCheck,
  LuLightbulb,
  LuPartyPopper,
  LuRotateCcw,
  LuShuffle,
} from "react-icons/lu";

type Pool = "review" | "revive" | "new";

const POOL_BADGE: Record<Pool, { label: string; tone: string }> = {
  review: { label: "回炉复习", tone: "orange" },
  revive: { label: "复活挑战", tone: "purple" },
  new: { label: "今日推荐", tone: "blue" },
};

export default function Recommend() {
  const { zen } = useZen();
  const { tags: questionTags } = useQuestionTags(null);
  const { solutions } = useSolutions();
  const { language } = useLeetCodeLanguage();
  const { allProgress, updateProgress, removeProgress } = useQuestProgress();
  const { optionKeys, getOption } = useProgressOptions();
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [lastResult, setLastResult] = useState<{
    text: string;
    ac: boolean;
  } | null>(null);

  type ZenQuestion = (typeof zen)[number];
  type RecItem = { question: ZenQuestion; pool: Pool; reason: string };

  // The recommendation engine. Everything derives from the practice pool,
  // local progress, and topic tags — no extra storage needed.
  const { queue, target, acCount } = useMemo(() => {
    const tagsOf = (question: ZenQuestion): string[] =>
      questionTags[String(question._hash)]?.[1] ?? [];

    const byId = new Map<string, ZenQuestion>();
    zen.forEach((question) => byId.set(String(question.question_id), question));

    const acRatings: number[] = [];
    const tagAc = new Map<string, number>();
    const reviewPool: ZenQuestion[] = [];
    const hardPool: ZenQuestion[] = [];

    Object.entries(allProgress).forEach(([questID, status]) => {
      const question = byId.get(questID);
      if (!question) return;
      if (status === "AC") {
        acRatings.push(question.rating);
        tagsOf(question).forEach((tag) =>
          tagAc.set(tag, (tagAc.get(tag) || 0) + 1),
        );
      } else if (status === "REVIEW_NEEDED") {
        reviewPool.push(question);
      } else if (status === "TOO_HARD") {
        hardPool.push(question);
      }
    });

    // Practice target: slightly above the current capability estimate.
    // Beginners start from solid ground (1300).
    const strength = estimateStrength(acRatings);
    const targetRating = strength || 1300;

    const byDistance = (a: ZenQuestion, b: ZenQuestion) =>
      Math.abs(a.rating - targetRating) - Math.abs(b.rating - targetRating);

    // 1. Spaced repetition first: review items closest to the target.
    reviewPool.sort(byDistance);

    // 2. Revive "too hard" problems once the target has caught up with them.
    const revivePool = hardPool
      .filter((question) => question.rating <= targetRating + 50)
      .sort(byDistance);

    // 3. Fresh problems: closest difficulty to the target wins, with a
    // novelty bonus for rarely-practiced tags to encourage coverage.
    const fresh = zen.filter(
      (question) =>
        !allProgress[String(question.question_id)] && !question.paid_only,
    );
    const windowed = fresh.filter(
      (question) =>
        question.rating >= targetRating - 100 &&
        question.rating <= targetRating + 250,
    );
    const scored = (windowed.length > 0 ? windowed : fresh)
      .map((question) => ({
        question,
        score:
          -Math.abs(question.rating - targetRating) +
          20 *
            tagsOf(question).reduce(
              (sum, tag) => sum + 1 / (1 + (tagAc.get(tag) || 0)),
              0,
            ),
      }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.question);

    const reasonForNew = (question: ZenQuestion) => {
      if (acRatings.length < 3) return "从基础题开始，先把地基打牢";
      const novel = tagsOf(question).find((tag) => !tagAc.has(tag));
      if (novel) return `新题型：${novel}`;
      return `难度贴合你当前的水平 ≈${targetRating}`;
    };

    const items: RecItem[] = [
      ...reviewPool.map((question) => ({
        question,
        pool: "review" as Pool,
        reason: "这道题在等你复习，趁热打铁",
      })),
      ...revivePool.map((question) => ({
        question,
        pool: "revive" as Pool,
        reason: "曾经太难，现在的你也许能拿下",
      })),
      ...scored.map((question) => ({
        question,
        pool: "new" as Pool,
        reason: reasonForNew(question),
      })),
    ];

    return { queue: items, target: targetRating, acCount: acRatings.length };
  }, [zen, allProgress, questionTags]);

  const visible = queue.filter(
    (item) => !skipped.has(String(item.question.question_id)),
  );
  const current = visible[0];

  const handleSkip = () => {
    if (!current) return;
    setSkipped((prev) => new Set(prev).add(String(current.question.question_id)));
  };

  const handleMark = (key: ProgressKeyType) => {
    if (!current) return;
    const question = current.question;
    const questID = String(question.question_id);
    const option = getOption(key);
    const label = displayOptionLabel(key, option.label);

    if (key === "TODO") {
      removeProgress(questID);
    } else {
      updateProgress(questID, key);
    }

    const xpGain =
      key === "AC"
        ? bandFor(question.rating).xp
        : key === "WORKING"
          ? STATUS_XP.WORKING
          : key === "REVIEW_NEEDED"
            ? STATUS_XP.REVIEW_NEEDED
            : key === "TOO_HARD"
              ? STATUS_XP.TOO_HARD
              : key === "TODO"
                ? 0
                : STATUS_XP.CUSTOM;

    const text =
      key === "AC"
        ? `漂亮！「${question.title}」到手，+${xpGain} XP`
        : key === "WORKING"
          ? `「${question.title}」继续攻克，+${xpGain} XP`
          : key === "REVIEW_NEEDED"
            ? `「${question.title}」已加入复习清单，+${xpGain} XP`
            : key === "TOO_HARD"
              ? `「${question.title}」先放一放，+${xpGain} XP，以后再战`
              : key === "TODO"
                ? `已移除「${question.title}」的标记`
                : `「${question.title}」已标记为「${label}」`;

    setLastResult({ text, ac: key === "AC" });
    // Move past this card for the session; a refresh restores the natural order.
    setSkipped((prev) => new Set(prev).add(questID));
  };

  const renderBody = () => {
    if (zen.length === 0) {
      return (
        <section className="duo-card rec-placeholder">
          <p>正在从题库中挑选适合你的题…</p>
        </section>
      );
    }

    if (queue.length === 0) {
      return (
        <section className="duo-card rec-placeholder">
          <span className="duo-chip gold">
            <LuPartyPopper aria-hidden size={24} />
          </span>
          <h2>练习池被你刷完了</h2>
          <p>不可思议！去难度练习里回顾一下自己的战绩吧。</p>
          <Link href="/zen" className="duo-btn">
            前往难度练习
          </Link>
        </section>
      );
    }

    if (!current) {
      return (
        <section className="duo-card rec-placeholder">
          <h2>候选都看完了</h2>
          <p>休息一下，或者重置候选再来一轮。</p>
          <button
            type="button"
            className="duo-btn"
            onClick={() => setSkipped(new Set())}
          >
            <LuRotateCcw aria-hidden size={18} />
            <span>重置候选</span>
          </button>
        </section>
      );
    }

    const question = current.question;
    const badge = POOL_BADGE[current.pool];
    const tags = questionTags[String(question._hash)]?.[1] ?? [];
    const solution = solutions[String(question._hash)];
    const solutionUrl = solution
      ? leetCodeSolutionUrl(solution.questSlug, solution.solnSlug, language)
      : null;

    return (
      <section
        className="duo-card rec-card"
        key={String(question.question_id)}
      >
        <div className="rec-kicker">
          <span className={`rec-badge ${badge.tone}`}>{badge.label}</span>
          <span className="rec-xp">AC 可得 +{bandFor(question.rating).xp} XP</span>
        </div>

        <a
          className="rec-title"
          href={leetCodeProblemUrl(question.title_slug, language)}
          target="_blank"
          rel="noreferrer"
        >
          {question.question_id}. {question.title}
          <LuArrowUpRight aria-hidden size={20} />
        </a>

        <div className="rec-meta">
          <RatingCircle rating={Number(question.rating)} />
          <ColorRating rating={question.rating}>
            {question.rating.toFixed(0)}
          </ColorRating>
          <span>·</span>
          <a
            href={leetCodeContestUrl(question.cont_title_slug, language)}
            target="_blank"
            rel="noreferrer"
          >
            {question.cont_title}
          </a>
        </div>

        {tags.length > 0 && (
          <div className="rec-tags">
            {tags.map((tag) => (
              <span className="duo-tag-chip" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="rec-reason">
          <LuLightbulb aria-hidden size={16} />
          <span>{current.reason}</span>
        </div>

        <div className="rec-actions">
          <a
            className="duo-btn"
            href={leetCodeProblemUrl(question.title_slug, language)}
            target="_blank"
            rel="noreferrer"
          >
            <span>去做题</span>
            <LuArrowUpRight aria-hidden size={18} />
          </a>
          {solutionUrl && (
            <a
              className="duo-btn-outline"
              href={solutionUrl}
              target="_blank"
              rel="noreferrer"
            >
              <LuBookOpen aria-hidden size={18} />
              <span>看 0x3f 题解</span>
            </a>
          )}
          <button type="button" className="duo-btn-ghost" onClick={handleSkip}>
            <LuShuffle aria-hidden size={17} />
            <span>换一道</span>
          </button>
        </div>

        <div className="rec-mark">
          <span className="rec-mark-label">完成后标记进度</span>
          <div className="rec-status-row">
            {optionKeys.map((key) => {
              const option = getOption(key as ProgressKeyType);
              return (
                <button
                  type="button"
                  className="rec-status-btn"
                  key={key}
                  style={
                    { "--status-color": option.color } as CSSProperties
                  }
                  onClick={() => handleMark(key as ProgressKeyType)}
                >
                  {displayOptionLabel(key, option.label)}
                </button>
              );
            })}
          </div>
        </div>
      </section>
    );
  };

  return (
    <Container fluid className="duo-shell page-shell recommend">
      <div className="rec-head">
        <h1>推荐刷题</h1>
        <span className="meta">
          已 AC {acCount} 道
          {acCount >= 3 ? ` · 当前目标 ≈${target}` : ""}
        </span>
      </div>

      {lastResult && (
        <div className={clsx("rec-banner", { ac: lastResult.ac })}>
          {lastResult.ac ? (
            <LuPartyPopper aria-hidden size={18} />
          ) : (
            <LuCheck aria-hidden size={18} />
          )}
          <span>{lastResult.text}</span>
        </div>
      )}

      {renderBody()}
    </Container>
  );
}
