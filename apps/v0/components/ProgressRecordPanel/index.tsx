"use client";

// Post-attempt recording panel.
//
// Two stages: how it went (a single four-step ladder), then how long it took.
// The panel is presentation-only: it calls `logAttempt` and hands the event to
// the parent, which owns the undo toast and navigation.
//
// The outcome ladder is ordered by whose idea the solution was, because that is
// the only distinction the scheduler and the difficulty estimate consume:
//
//   1 solo        algorithm mine, finished
//   2 syntax      algorithm mine, looked up an API  (duration includes reading)
//   3 sawSolution read the editorial
//   4 noIdea      out of ideas
//
// 3 and 4 are the same observation to both consumers — the user did not produce
// the algorithm within the time they spent — so they are kept apart only for the
// record. "Had the idea but could not be bothered to write it" is deliberately
// absent: it carries no monotone signal about ability, and it is now expressed
// by dismissing a problem before starting it.

import { useI18n } from "@hooks/useI18n";
import { useProgressStore } from "@hooks/useProgressStore";
import {
  clearAttemptStart,
  trackedMinutes as trackedMinutesFor,
  useActiveProblem,
} from "@hooks/useAttemptTimer";
import type {
  AttemptSource,
  GaveUpReason,
  Independence,
} from "@hooks/useProgressStore/types";
import type { MessageKey } from "@hooks/useI18n";
import React, { useEffect, useMemo, useRef, useState } from "react";

interface Verdict {
  key: string;
  labelKey: MessageKey;
  /** Solved with the user's own algorithm. */
  solved: boolean;
  independence?: Independence;
  reason?: GaveUpReason;
}

export const VERDICTS: readonly Verdict[] = [
  {
    key: "solo",
    labelKey: "record.outcome.solo",
    solved: true,
    independence: "solo",
  },
  {
    key: "syntax",
    labelKey: "record.outcome.syntax",
    solved: true,
    independence: "syntax",
  },
  {
    key: "sawSolution",
    labelKey: "record.outcome.sawSolution",
    solved: false,
    reason: "saw_solution",
  },
  {
    key: "noIdea",
    labelKey: "record.outcome.noIdea",
    solved: false,
    reason: "no_idea",
  },
];

export interface ProgressRecordPanelProps {
  qid: string;
  questionTitle?: string;
  rating?: number;
  source?: AttemptSource;
  /**
   * Duration measured by the tracker, if the user started from this site.
   * Prefilled and trusted unless the user changes it.
   */
  timedMinutes?: number;
  /** Rough expectation shown as a placeholder so an empty field is answerable. */
  suggestedMinutes?: number;
  onRecorded?: (event: unknown) => void;
  onCancel?: () => void;
  className?: string;
}

export default function ProgressRecordPanel({
  qid,
  questionTitle,
  rating,
  source = "recommend",
  timedMinutes,
  suggestedMinutes,
  onRecorded,
  onCancel,
  className,
}: ProgressRecordPanelProps) {
  const { logAttempt } = useProgressStore();
  const { t } = useI18n();
  const activeProblem = useActiveProblem();
  // The panel reads the tracker itself so every entry point gets it for free.
  const tracked = timedMinutes ?? trackedMinutesFor(activeProblem, qid);

  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [minutesText, setMinutesText] = useState(
    tracked != null ? String(tracked) : "",
  );
  const [drill, setDrill] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // An empty field falls back to the placeholder, so the record is always
  // saved with a duration. Accepting an expectation is a guess, and `timed`
  // stays false so the estimator knows to trust it less.
  const minutes = useMemo(() => {
    const typed = Number(minutesText);
    if (minutesText.trim() !== "" && Number.isFinite(typed) && typed >= 0) {
      return typed;
    }
    return suggestedMinutes ?? null;
  }, [minutesText, suggestedMinutes]);

  const timed =
    tracked != null &&
    minutesText.trim() !== "" &&
    Number(minutesText) === tracked;

  const save = () => {
    if (!verdict || minutes == null) return;
    clearAttemptStart();
    onRecorded?.(
      verdict.solved
        ? logAttempt({
            qid,
            outcome: "solved",
            minutes,
            timed,
            independence: verdict.independence ?? "solo",
            revisit: drill,
            rating,
            src: source,
          })
        : logAttempt({
            qid,
            outcome: "gaveup",
            minutes,
            timed,
            reason: verdict.reason ?? "no_idea",
            rating,
            src: source,
          }),
    );
  };

  useEffect(() => {
    if (verdict) inputRef.current?.focus();
  }, [verdict]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (!verdict) {
        if (event.key === "Escape") {
          onCancel?.();
          return;
        }
        const index = Number(event.key) - 1;
        if (index >= 0 && index < VERDICTS.length) {
          event.preventDefault();
          setVerdict(VERDICTS[index]);
        }
        return;
      }

      // Focus sits in the minutes field, so only the surrounding controls are
      // handled here; digits belong to the input.
      if (event.key === "Escape") {
        setVerdict(null);
      } else if (event.key === "Enter") {
        event.preventDefault();
        save();
      } else if (event.key.toLowerCase() === "d" && verdict.solved) {
        event.preventDefault();
        setDrill((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdict, minutes, timed, drill, onCancel, qid, source, rating]);

  return (
    <section
      className={`prp${className ? ` ${className}` : ""}`}
      aria-label={t("record.title")}
    >
      <header className="prp-head">
        <span className="prp-kicker">{t("record.title")}</span>
        {questionTitle && <span className="prp-title">{questionTitle}</span>}
      </header>

      <p className="prp-question">{t("record.prompt.outcome")}</p>
      <div className="prp-row column">
        {VERDICTS.map((item, index) => (
          <button
            key={item.key}
            type="button"
            className={`prp-choice${verdict?.key === item.key ? " active" : ""}`}
            aria-pressed={verdict?.key === item.key}
            onClick={() => setVerdict(item)}
          >
            <span>{t(item.labelKey)}</span>
            <kbd>{index + 1}</kbd>
          </button>
        ))}
      </div>

      {verdict && (
        <>
          <p className="prp-question">{t("record.prompt.minutes")}</p>
          <div className="prp-minutes">
            <input
              ref={inputRef}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              className="prp-minutes-input"
              value={minutesText}
              placeholder={
                suggestedMinutes != null
                  ? t("record.suggested", { minutes: suggestedMinutes })
                  : ""
              }
              onChange={(event) => setMinutesText(event.target.value)}
            />
            <span className="prp-minutes-unit">
              {t("record.minutesSuffix")}
            </span>
            {timed && (
              <span className="prp-timed">
                {t("record.timed", {
                  time: `${tracked} ${t("record.minutesSuffix")}`,
                })}
              </span>
            )}
          </div>

          {verdict.solved && (
            <div
              className="prp-independence"
              role="group"
              aria-label={t("record.group.drill")}
            >
              <button
                type="button"
                className={`prp-toggle${drill ? " active" : ""}`}
                aria-pressed={drill}
                onClick={() => setDrill((prev) => !prev)}
              >
                {t("record.drill.toggle")}
              </button>
              <kbd>D</kbd>
              <span className="prp-hint">{t("record.drill.hint")}</span>
            </div>
          )}
        </>
      )}

      <footer className="prp-foot">
        <button
          type="button"
          className="prp-back"
          onClick={() => (verdict ? setVerdict(null) : onCancel?.())}
        >
          {verdict ? t("common.back") : t("common.cancel")}
        </button>
        <span className="prp-note">
          {verdict ? t("record.footer.steps") : t("record.footer.outcome")}
        </span>
        {verdict && (
          <button
            type="button"
            className="prp-save"
            onClick={save}
            disabled={minutes == null}
          >
            {t("record.save")}
            <kbd>Enter</kbd>
          </button>
        )}
      </footer>
    </section>
  );
}
