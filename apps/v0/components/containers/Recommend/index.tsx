"use client";

import ProgressRecordPanel from "@components/ProgressRecordPanel";
import RatingCircle, { ColorRating } from "@components/RatingCircle";
import { useI18n } from "@hooks/useI18n";
import { useQuestionTitle } from "@hooks/useQuestionTitles";
import { contestName } from "@utils/contestName";
import type { Message, MessageKey } from "@hooks/useI18n";
import { useProgressStore } from "@hooks/useProgressStore";
import {
  WELCOME_BACK_DAYS,
  estimateAbility,
  targetAdjustment,
} from "@hooks/useProgressStore/ability";
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

const POOL_BADGE: Record<Pool, { label: MessageKey; tone: string }> = {
  review: { label: "rec.pool.review", tone: "orange" },
  revive: { label: "rec.pool.revive", tone: "purple" },
  revisit: { label: "rec.pool.revisit", tone: "gold" },
  prerequisite: { label: "rec.pool.prerequisite", tone: "blue" },
  sibling: { label: "rec.pool.sibling", tone: "blue" },
  new: { label: "rec.pool.new", tone: "blue" },
};

export default function Recommend() {
  const { zen } = useZen();
  const { tags: questionTags } = useQuestionTags(null);
  const { language, t, isEn } = useI18n();
  const titleOf = useQuestionTitle();
  const { derived } = useProgressStore();
  type ZenQuestion = (typeof zen)[number];
  type RecItem = { question: ZenQuestion; pool: Pool; reason: Message };
  interface Plan {
    items: RecItem[];
    target: number;
    offset: number;
    /** Days since the last recorded attempt. */
    gapDays: number;
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

    // Short-term form: returning after a break, on a bad streak, or on a roll.
    const adjustment = targetAdjustment(derived.events, ability, now);

    const items: RecItem[] = [];
    const plan = buildRecommendationQueue({
      candidates,
      byQid,
      derived,
      ability,
      adjustment,
      now,
    });
    for (const item of plan) {
      const question = questionByQid.get(item.qid);
      if (question) {
        items.push({ question, pool: item.pool, reason: item.reason });
      }
    }

    return {
      items,
      target: adjustment.effective,
      offset: adjustment.offset,
      gapDays: adjustment.gapDays,
    };
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

  // Card-level shortcuts: O 去做题 / R 记录结果 / N 换一道.
  // While the record panel is open its own keys (1-5, 0, S, D, Esc) take over.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (showRecord) {
        // The panel owns 1-5 / 0 / S / D / Esc while it is open. R mirrors the
        // "收起记录" button; handling Esc here too would make one press both
        // step back inside the panel and close it.
        if (event.key.toLowerCase() === "r") setShowRecord(false);
        return;
      }

      const question = plan?.items[0]?.question;
      if (!question) return;

      const key = event.key.toLowerCase();
      if (key === "o") {
        window.open(
          leetCodeProblemUrl(question.title_slug, language),
          "_blank",
          "noopener,noreferrer",
        );
      } else if (key === "r") {
        setShowRecord(true);
      } else if (key === "n") {
        consume(String(question.question_id));
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showRecord, plan, language, consume]);

  const renderBody = () => {
    if (zen.length === 0 || plan === null) {
      return (
        <section className="duo-card rec-placeholder">
          <p>{t("rec.loading")}</p>
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
          <h2>{t(allAttempted ? "rec.done.all" : "rec.done.round")}</h2>
          <p>
            {allAttempted
              ? t("rec.done.allHint")
              : t("rec.done.roundHint")}
          </p>
          <button type="button" className="duo-btn" onClick={restart}>
            <LuRotateCcw aria-hidden size={18} />
            <span>{t(allAttempted ? "rec.restart.all" : "rec.restart.round")}</span>
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
            ? t("rec.toast.revisit", {
                title: titleOf(question.question_id, question.title),
                xp,
                days,
              })
            : t("rec.toast.solved", {
                title: titleOf(question.question_id, question.title),
                days,
              }),
      });
    };

    return (
      <section className="duo-card rec-card" key={qid}>
        <div className="rec-kicker">
          <span className={`rec-badge ${badge.tone}`}>{t(badge.label)}</span>
          <span className="rec-xp">
            {t("rec.xpRange", { min: baseXp, max: Math.round(baseXp * 1.75) })}
          </span>
        </div>

        <a
          className="rec-title"
          href={leetCodeProblemUrl(question.title_slug, language)}
          target="_blank"
          rel="noreferrer"
        >
          {question.question_id}. {titleOf(question.question_id, question.title)}
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
          <span>{t(current.reason.key, current.reason.params)}</span>
        </div>

        {currentAttempt && (
          <div className="rec-last">
            {t("rec.last", {
              label: attemptLabel(currentAttempt, t),
              days: Math.floor((now - currentAttempt.at) / DAY_MS),
            })}
          </div>
        )}

        <div className="rec-actions">
          <a
            className="duo-btn"
            href={leetCodeProblemUrl(question.title_slug, language)}
            target="_blank"
            rel="noreferrer"
          >
            <span>{t("rec.open")}</span>
            <kbd className="kbd-hint">O</kbd>
            <LuArrowUpRight aria-hidden size={18} />
          </a>
          <button
            type="button"
            className="duo-btn-outline"
            onClick={() => setShowRecord((open) => !open)}
          >
            <span>{t(showRecord ? "rec.collapse" : "rec.record")}</span>
            <kbd className="kbd-hint">R</kbd>
          </button>
          <button type="button" className="duo-btn-ghost" onClick={handleSkip}>
            <LuShuffle aria-hidden size={17} />
            <span>{t("rec.swap")}</span>
            <kbd className="kbd-hint">N</kbd>
          </button>
        </div>

        {showRecord && (
          <div className="rec-record">
            <ProgressRecordPanel
              qid={qid}
              questionTitle={titleOf(question.question_id, question.title)}
              rating={question.rating}
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
        <h1>{t("rec.title")}</h1>
        <span className="meta">
          {t("rec.solvedCount", { count: derived.totals.solved })}
          {derived.totals.solved >= 3 && plan
            ? `${t("rec.target", { target: plan.target })}${
                plan.offset <= -100
                  ? t("rec.target.warmup")
                  : plan.offset >= 80
                    ? t("rec.target.strong")
                    : ""
              }`
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

      {plan && plan.gapDays >= WELCOME_BACK_DAYS && (
        <div className="rec-banner">
          <LuPartyPopper aria-hidden size={18} />
          <span>
            {t("rec.welcomeBack", { days: plan.gapDays })}
          </span>
        </div>
      )}

      {renderBody()}
    </Container>
  );
}
