"use client";

// Post-attempt recording panel.
//
// Layout notes:
//   - the outcome is a 2x2 grid, not four full-width rows: the four options are
//     one ladder, and a grid groups them the way the user thinks about them
//     (top row "my own algorithm", bottom row "not mine") while halving the
//     height
//   - the duration pairs a slider with a number field, and the two have
//     different jobs: dragging lands exactly on a stop, while typing keeps the
//     exact value and only moves the slider to the nearest stop
//   - the slider's stops are geometric, so 1-30 minutes get half the travel
//
// The panel is presentation-only: it calls `logAttempt` and hands the event to
// the parent, which owns the undo toast and navigation.

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

// Reading order matches the 2x2 grid: the top row is "my own algorithm", the
// bottom row is "not mine", and 3 and 4 are the same observation to the model.
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

/**
 * Slider stops, roughly geometric.
 *
 * A linear 0-180 track would spend most of its travel on values nobody picks.
 * Eleven of these twenty stops sit below half an hour, which is where real
 * solve times live; the rest stretch to the three-hour cap that matches the
 * tracker's own plausibility window.
 */
export const MINUTE_STOPS = [
  1, 2, 3, 4, 5, 7, 9, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 120, 150, 180,
] as const;
export const SLIDER_CAP = MINUTE_STOPS[MINUTE_STOPS.length - 1];

/** Ticks worth labelling; labelling all twenty would crowd the track. */
const LABELLED = [5, 15, 30, 60, 180];

/** Nearest stop in log space, so 37 lands on 40 rather than 30. */
export function nearestStopIndex(value: number): number {
  const target = Math.log(Math.max(1, value));
  let best = 0;
  let bestDistance = Infinity;
  MINUTE_STOPS.forEach((stop, index) => {
    const distance = Math.abs(target - Math.log(stop));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}

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
      return Math.round(typed);
    }
    return suggestedMinutes ?? null;
  }, [minutesText, suggestedMinutes]);

  const sliderValue =
    minutes == null
      ? nearestStopIndex(suggestedMinutes ?? 1)
      : nearestStopIndex(minutes);
  const overCap = minutes != null && minutes > SLIDER_CAP;

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

      // Focus sits in the minutes field, so digits belong to the input and only
      // the surrounding controls are handled here.
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
      <div
        className="prp-grid"
        role="group"
        aria-label={t("record.prompt.outcome")}
      >
        {VERDICTS.map((item, index) => (
          <button
            key={item.key}
            type="button"
            className={`prp-option${verdict?.key === item.key ? " active" : ""}`}
            aria-pressed={verdict?.key === item.key}
            onClick={() => setVerdict(item)}
          >
            <kbd>{index + 1}</kbd>
            <span>{t(item.labelKey)}</span>
          </button>
        ))}
      </div>

      {verdict && (
        <>
          <p className="prp-question">
            {t("record.prompt.minutes")}
            {timed && (
              <span className="prp-timed">
                {t("record.timed", {
                  time: `${tracked} ${t("record.minutesSuffix")}`,
                })}
              </span>
            )}
          </p>

          <div className="prp-time">
            <input
              type="range"
              className={`prp-slider${overCap ? " over" : ""}`}
              min={0}
              max={MINUTE_STOPS.length - 1}
              step={1}
              value={sliderValue}
              aria-label={t("record.prompt.minutes")}
              aria-valuetext={`${minutes ?? ""} ${t("record.minutesSuffix")}`}
              onChange={(event) =>
                setMinutesText(String(MINUTE_STOPS[Number(event.target.value)]))
              }
            />
            <div className="prp-ticks" aria-hidden>
              {LABELLED.map((stop) => {
                const index = MINUTE_STOPS.indexOf(stop as never);
                return (
                  <span
                    key={stop}
                    className="prp-tick"
                    style={{
                      left: `${(index / (MINUTE_STOPS.length - 1)) * 100}%`,
                    }}
                  >
                    {stop}
                  </span>
                );
              })}
            </div>
          </div>

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
            {overCap && (
              <span className="prp-over-cap">
                {t("record.overCap", { cap: SLIDER_CAP })}
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
