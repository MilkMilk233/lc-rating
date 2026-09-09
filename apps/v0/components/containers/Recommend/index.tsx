"use client";

import ProgressRecordPanel from "@components/ProgressRecordPanel";
import RatingCircle, { ColorRating } from "@components/RatingCircle";
import { useLeetCodeLanguage } from "@hooks/useLeetCodeLanguage";
import { useProgressStore } from "@hooks/useProgressStore";
import { attemptLabel } from "@hooks/useProgressStore/bands";
import { DAY_MS, applyAttempt, overdueDays } from "@hooks/useProgressStore/srs";
import type { AttemptEvent } from "@hooks/useProgressStore/types";
import { useQuestionTags } from "@hooks/useQuestionTags";
import { useZen } from "@hooks/useZen";
import {
  leetCodeContestUrl,
  leetCodeProblemUrl,
} from "@utils/leetcodeLinks";
import { bandFor, estimateStrength, xpForAttempt } from "@utils/practice";
import clsx from "clsx";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Container } from "react-bootstrap";
import {
  LuArrowUpRight,
  LuCheck,
  LuLightbulb,
  LuPartyPopper,
  LuRotateCcw,
  LuShuffle,
} from "react-icons/lu";

type Pool = "review" | "revive" | "new";

const POOL_BADGE: Record<Pool, { label: string; tone: string }> = {
  review: { label: "到期复习", tone: "orange" },
  revive: { label: "复活挑战", tone: "purple" },
  new: { label: "今日推荐", tone: "blue" },
};

export default function Recommend() {
  const { zen } = useZen();
  const { tags: questionTags } = useQuestionTags(null);
  const { language } = useLeetCodeLanguage();
  const { derived } = useProgressStore();
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [showRecord, setShowRecord] = useState(false);
  const [lastResult, setLastResult] = useState<{
    text: string;
    solved: boolean;
  } | null>(null);

  type ZenQuestion = (typeof zen)[number];
  type RecItem = { question: ZenQuestion; pool: Pool; reason: string };

  // The recommendation engine. Everything derives from the practice pool, the
  // event log, and topic tags — no extra storage needed.
  const { queue, target, solvedCount } = useMemo(() => {
    const now = Date.now();
    const byId = new Map<string, ZenQuestion>();
    zen.forEach((question) => byId.set(String(question.question_id), question));

    const tagsOf = (question: ZenQuestion): string[] =>
      questionTags[String(question._hash)]?.[1] ?? [];
    const ratingOf = (qid: string): number | undefined =>
      byId.get(qid)?.rating;

    // Capability estimate from solo solves only; editorial-assisted solves say
    // little about what the user can do alone.
    const soloRatings: number[] = [];
    derived.currentSolved.forEach((attempt) => {
      if (attempt.independence !== "solo") return;
      const rating = ratingOf(attempt.qid);
      if (rating != null) soloRatings.push(rating);
    });
    const strength = estimateStrength(soloRatings);
    const targetRating = strength || 1300;

    // 1. Due questions first, most overdue first. Anything not yet due stays
    //    out of the queue, so marking a problem never makes it bounce straight
    //    back on the next refresh.
    const dueItems: RecItem[] = [];
    derived.scheduleByQid.forEach((schedule, qid) => {
      if (now < schedule.dueAt) return;
      const question = byId.get(qid);
      if (!question || question.paid_only) return;

      const current = derived.currentByQid.get(qid);
      const overdue = overdueDays(schedule, now);
      dueItems.push({
        question,
        pool: current?.outcome === "gaveup" ? "revive" : "review",
        reason:
          overdue > 0
            ? `逾期 ${overdue} 天，先把它复习掉`
            : "今天到期，趁热复习一遍",
      });
    });
    dueItems.sort((a, b) => {
      const sa = derived.scheduleByQid.get(String(a.question.question_id));
      const sb = derived.scheduleByQid.get(String(b.question.question_id));
      return (sa?.dueAt ?? 0) - (sb?.dueAt ?? 0);
    });

    // 2. Fresh problems: closest difficulty to the target wins, with a novelty
    //    bonus for rarely-practiced tags to encourage coverage.
    const tagSolved = new Map<string, number>();
    derived.currentSolved.forEach((attempt) => {
      const question = byId.get(attempt.qid);
      if (!question) return;
      tagsOf(question).forEach((tag) =>
        tagSolved.set(tag, (tagSolved.get(tag) || 0) + 1),
      );
    });

    const fresh = zen.filter(
      (question) =>
        !derived.currentByQid.has(String(question.question_id)) &&
        !question.paid_only,
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
              (sum, tag) => sum + 1 / (1 + (tagSolved.get(tag) || 0)),
              0,
            ),
      }))
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.question);

    const reasonForNew = (question: ZenQuestion) => {
      if (soloRatings.length < 3) return "从基础题开始，先把地基打牢";
      const novel = tagsOf(question).find((tag) => !tagSolved.has(tag));
      if (novel) return `新题型：${novel}`;
      return `难度贴合你当前的水平 ≈${targetRating}`;
    };

    const items: RecItem[] = [
      ...dueItems,
      ...scored.map((question) => ({
        question,
        pool: "new" as Pool,
        reason: reasonForNew(question),
      })),
    ];

    return {
      queue: items,
      target: targetRating,
      solvedCount: derived.totals.solved,
    };
  }, [zen, derived, questionTags]);

  const visible = queue.filter(
    (item) => !skipped.has(String(item.question.question_id)),
  );
  const current = visible[0];

  const handleSkip = () => {
    if (!current) return;
    setShowRecord(false);
    setSkipped((prev) =>
      new Set(Array.from(prev)).add(String(current.question.question_id)),
    );
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
    const qid = String(question.question_id);
    const badge = POOL_BADGE[current.pool];
    const tags = questionTags[String(question._hash)]?.[1] ?? [];
    const currentAttempt = derived.currentByQid.get(qid);
    const schedule = derived.scheduleByQid.get(qid);
    const baseXp = bandFor(question.rating).xp;

    const handleRecorded = (event: AttemptEvent) => {
      setShowRecord(false);
      setSkipped((prev) => new Set(Array.from(prev)).add(qid));

      const next = applyAttempt(schedule, event);
      const days = Math.max(1, Math.round((next.dueAt - event.at) / DAY_MS));
      const xp = xpForAttempt(event, question.rating);
      setLastResult({
        solved: event.outcome === "solved",
        text:
          event.outcome === "solved"
            ? `「${question.title}」+${xp} XP，${days} 天后再见`
            : `「${question.title}」已记录，${days} 天后回来再战`,
      });
    };

    return (
      <section className="duo-card rec-card" key={qid}>
        <div className="rec-kicker">
          <span className={`rec-badge ${badge.tone}`}>{badge.label}</span>
          <span className="rec-xp">
            做出来可得 +{baseXp}~{Math.round(baseXp * 1.75)} XP
          </span>
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

        {currentAttempt && (
          <div className="rec-last">
            上次：{attemptLabel(currentAttempt)} ·{" "}
            {Math.floor((Date.now() - currentAttempt.at) / DAY_MS)} 天前
          </div>
        )}

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
          <button
            type="button"
            className="duo-btn-outline"
            onClick={() => setShowRecord((open) => !open)}
          >
            <span>{showRecord ? "收起记录" : "记录结果"}</span>
          </button>
          <button type="button" className="duo-btn-ghost" onClick={handleSkip}>
            <LuShuffle aria-hidden size={17} />
            <span>换一道</span>
          </button>
        </div>

        {showRecord && (
          <div className="rec-record">
            <ProgressRecordPanel
              qid={qid}
              questionTitle={question.title}
              source="recommend"
              onRecorded={handleRecorded}
              onCancel={() => setShowRecord(false)}
            />
          </div>
        )}
      </section>
    );
  };

  return (
    <Container fluid className="duo-shell page-shell recommend">
      <div className="rec-head">
        <h1>推荐刷题</h1>
        <span className="meta">
          已解决 {solvedCount} 道
          {solvedCount >= 3 ? ` · 当前目标 ≈${target}` : ""}
        </span>
      </div>

      {lastResult && (
        <div className={clsx("rec-banner", { ac: lastResult.solved })}>
          {lastResult.solved ? (
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
