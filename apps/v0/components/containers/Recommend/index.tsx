"use client";

import ProgressRecordPanel from "@components/ProgressRecordPanel";
import RatingCircle, { ColorRating } from "@components/RatingCircle";
import { useLeetCodeLanguage } from "@hooks/useLeetCodeLanguage";
import { useProgressStore } from "@hooks/useProgressStore";
import { estimateAbility } from "@hooks/useProgressStore/ability";
import { attemptLabel } from "@hooks/useProgressStore/bands";
import { buildRecommendationQueue } from "@hooks/useProgressStore/recommend";
import type {
  Candidate,
  QueuePool,
} from "@hooks/useProgressStore/recommend";
import { DAY_MS, applyAttempt } from "@hooks/useProgressStore/srs";
import type { AttemptEvent } from "@hooks/useProgressStore/types";
import { useQuestionTags } from "@hooks/useQuestionTags";
import { useZen } from "@hooks/useZen";
import {
  leetCodeContestUrl,
  leetCodeProblemUrl,
} from "@utils/leetcodeLinks";
import { bandFor, xpForAttempt } from "@utils/practice";
import clsx from "clsx";
import { useCallback, useEffect, useState } from "react";
import { Container } from "react-bootstrap";
import {
  LuArrowUpRight,
  LuCheck,
  LuLightbulb,
  LuPartyPopper,
  LuRotateCcw,
  LuShuffle,
} from "react-icons/lu";

type Pool = QueuePool;

const POOL_BADGE: Record<Pool, { label: string; tone: string }> = {
  review: { label: "到期复习", tone: "orange" },
  revive: { label: "复活挑战", tone: "purple" },
  prerequisite: { label: "先垫一题", tone: "blue" },
  new: { label: "今日推荐", tone: "blue" },
};

export default function Recommend() {
  const { zen } = useZen();
  const { tags: questionTags } = useQuestionTags(null);
  const { language } = useLeetCodeLanguage();
  const { derived } = useProgressStore();
  type ZenQuestion = (typeof zen)[number];
  type RecItem = { question: ZenQuestion; pool: Pool; reason: string };
  interface Plan {
    items: RecItem[];
    target: number;
  }

  const [plan, setPlan] = useState<Plan | null>(null);
  const [showRecord, setShowRecord] = useState(false);
  const [lastResult, setLastResult] = useState<{
    text: string;
    solved: boolean;
  } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Refresh due state while the page stays open.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // The recommendation engine. Everything derives from the practice pool, the
  // event log, and topic tags — no extra storage needed.
  //
  // Deliberately NOT a useMemo: the plan is built once and then consumed card by
  // card. Re-deriving it after every attempt restarts the review/new
  // interleaving from the top, which puts a review at the head every time — the
  // user then sees review after review with no alternation.
  const buildPlan = useCallback((): Plan => {
    const questionByQid = new Map<string, ZenQuestion>();
    const byQid = new Map<string, Candidate>();
    const candidates: Candidate[] = [];

    zen.forEach((question) => {
      const qid = String(question.question_id);
      const candidate: Candidate = {
        qid,
        rating: question.rating,
        paidOnly: question.paid_only,
        tags: questionTags[String(question._hash)]?.[1] ?? [],
      };
      questionByQid.set(qid, question);
      byQid.set(qid, candidate);
      candidates.push(candidate);
    });

    // Capability estimate: per-tag and global, weighted by independence, felt
    // difficulty and recency, with recent "no idea" attempts capping it.
    const ability = estimateAbility(
      derived.events,
      (qid) => byQid.get(qid)?.rating,
      (qid) => byQid.get(qid)?.tags ?? [],
      now,
    );

    const items: RecItem[] = [];
    const plan = buildRecommendationQueue({
      candidates,
      byQid,
      derived,
      ability,
      now,
    });
    for (const item of plan) {
      const question = questionByQid.get(item.qid);
      if (question) {
        items.push({ question, pool: item.pool, reason: item.reason });
      }
    }

    return { items, target: ability.global };
  }, [zen, derived, questionTags, now]);

  useEffect(() => {
    if (plan !== null || zen.length === 0) return;
    setPlan(buildPlan());
  }, [plan, zen.length, buildPlan]);

  const current = plan?.items[0];

  const consume = useCallback((qid: string) => {
    setPlan((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.filter(
              (item) => String(item.question.question_id) !== qid,
            ),
          }
        : prev,
    );
  }, []);

  const restart = () => {
    setShowRecord(false);
    setLastResult(null);
    setPlan(buildPlan());
  };

  const handleSkip = () => {
    if (!current) return;
    setShowRecord(false);
    consume(String(current.question.question_id));
  };

  const renderBody = () => {
    if (zen.length === 0 || plan === null) {
      return (
        <section className="duo-card rec-placeholder">
          <p>正在从题库中挑选适合你的题…</p>
        </section>
      );
    }

    if (plan.items.length === 0) {
      const allAttempted = derived.totals.marked >= zen.length;
      return (
        <section className="duo-card rec-placeholder">
          <span className="duo-chip gold">
            <LuPartyPopper aria-hidden size={24} />
          </span>
          <h2>{allAttempted ? "练习池被你刷完了" : "这一轮候选看完了"}</h2>
          <p>
            {allAttempted
              ? "不可思议！去难度练习里回顾一下自己的战绩吧。"
              : "休息一下，或者重新生成一轮候选。"}
          </p>
          <button type="button" className="duo-btn" onClick={restart}>
            <LuRotateCcw aria-hidden size={18} />
            <span>{allAttempted ? "再刷一轮" : "重新生成候选"}</span>
          </button>
        </section>
      );
    }

    if (!current) return null;

    const question = current.question;
    const qid = String(question.question_id);
    const badge = POOL_BADGE[current.pool];
    const tags = questionTags[String(question._hash)]?.[1] ?? [];
    const currentAttempt = derived.currentByQid.get(qid);
    const schedule = derived.scheduleByQid.get(qid);
    const baseXp = bandFor(question.rating).xp;

    const handleRecorded = (event: AttemptEvent) => {
      setShowRecord(false);
      consume(qid);

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
            {Math.floor((now - currentAttempt.at) / DAY_MS)} 天前
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
          已解决 {derived.totals.solved} 道
          {derived.totals.solved >= 3 && plan
            ? ` · 当前目标 ≈${plan.target}`
            : ""}
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
