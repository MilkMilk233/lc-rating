"use client";

// Post-attempt recording panel.
//
// Two stages: outcome (solved / gave up), then a mandatory band or reason.
// The panel is presentation-only: it calls `logAttempt` and hands the event to
// the parent, which owns the undo toast and navigation.

import { useProgressStore } from "@hooks/useProgressStore";
import {
  EFFORT_BANDS,
  GAVEUP_REASONS,
  INDEPENDENCE_OPTIONS,
} from "@hooks/useProgressStore/bands";
import type {
  AttemptEvent,
  AttemptSource,
  EffortBand,
  GaveUpReason,
  Independence,
} from "@hooks/useProgressStore/types";
import { useEffect, useState } from "react";

type Stage = "outcome" | "solved" | "gaveup";

export interface ProgressRecordPanelProps {
  qid: string;
  questionTitle?: string;
  /** Problem difficulty, snapshotted into the event for pace judgement. */
  rating?: number;
  source?: AttemptSource;
  onRecorded?: (event: AttemptEvent) => void;
  onCancel?: () => void;
  className?: string;
}

export default function ProgressRecordPanel({
  qid,
  questionTitle,
  rating,
  source = "recommend",
  onRecorded,
  onCancel,
  className,
}: ProgressRecordPanelProps) {
  const { logAttempt } = useProgressStore();
  const [stage, setStage] = useState<Stage>("outcome");
  const [independence, setIndependence] = useState<Independence>("solo");
  const [drill, setDrill] = useState(false);

  const recordSolved = (band: EffortBand) => {
    onRecorded?.(
      logAttempt({
        qid,
        outcome: "solved",
        band,
        independence,
        revisit: drill,
        rating,
        src: source,
      }),
    );
  };

  const recordGaveUp = (reason: GaveUpReason) => {
    onRecorded?.(
      logAttempt({ qid, outcome: "gaveup", reason, rating, src: source }),
    );
  };

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

      if (event.key === "Escape") {
        if (stage === "outcome") onCancel?.();
        else setStage("outcome");
        return;
      }

      if (stage === "outcome") {
        if (event.key === "1") setStage("solved");
        else if (event.key === "0") setStage("gaveup");
        return;
      }

      if (stage === "solved") {
        const index = Number(event.key) - 1;
        if (index >= 0 && index < EFFORT_BANDS.length) {
          recordSolved(EFFORT_BANDS[index].key);
        } else if (event.key.toLowerCase() === "s") {
          setIndependence((prev) => (prev === "solo" ? "solution" : "solo"));
        } else if (event.key.toLowerCase() === "d") {
          setDrill((prev) => !prev);
        }
        return;
      }

      if (stage === "gaveup") {
        const index = Number(event.key) - 1;
        if (index >= 0 && index < GAVEUP_REASONS.length) {
          recordGaveUp(GAVEUP_REASONS[index].key);
        }
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [stage, independence, drill, onCancel, qid, source]);

  return (
    <section
      className={`prp${className ? ` ${className}` : ""}`}
      aria-label="记录这次练习"
    >
      <header className="prp-head">
        <span className="prp-kicker">记录这次练习</span>
        {questionTitle && <span className="prp-title">{questionTitle}</span>}
      </header>

      {stage === "outcome" && (
        <>
          <p className="prp-question">这次做得怎么样？</p>
          <div className="prp-row">
            <button
              type="button"
              className="prp-choice primary"
              onClick={() => setStage("solved")}
            >
              <span>做出来了</span>
              <kbd>1</kbd>
            </button>
            <button
              type="button"
              className="prp-choice"
              onClick={() => setStage("gaveup")}
            >
              <span>没做出来</span>
              <kbd>0</kbd>
            </button>
          </div>
        </>
      )}

      {stage === "solved" && (
        <>
          <p className="prp-question">
            用了多久？<span className="prp-required">必选</span>
          </p>
          <div className="prp-bands">
            {EFFORT_BANDS.map((band, index) => (
              <button
                key={band.key}
                type="button"
                className="prp-band"
                onClick={() => recordSolved(band.key)}
              >
                <span className="prp-band-label">{band.label}</span>
                <span className="prp-band-hint">{band.hint}</span>
                <kbd>{index + 1}</kbd>
              </button>
            ))}
          </div>
          <div className="prp-independence" role="group" aria-label="完成方式">
            {INDEPENDENCE_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`prp-toggle${
                  independence === option.key ? " active" : ""
                }`}
                aria-pressed={independence === option.key}
                onClick={() => setIndependence(option.key)}
              >
                {option.label}
              </button>
            ))}
            <kbd>S</kbd>
          </div>
          <div className="prp-independence" role="group" aria-label="强化复习">
            <button
              type="button"
              className={`prp-toggle${drill ? " active" : ""}`}
              aria-pressed={drill}
              onClick={() => setDrill((prev) => !prev)}
            >
              值得再复习
            </button>
            <kbd>D</kbd>
            <span className="prp-hint">模板、API 用法这类要背下来的东西</span>
          </div>
        </>
      )}

      {stage === "gaveup" && (
        <>
          <p className="prp-question">
            卡在哪？<span className="prp-required">必选</span>
          </p>
          <div className="prp-row column">
            {GAVEUP_REASONS.map((reason, index) => (
              <button
                key={reason.key}
                type="button"
                className="prp-choice"
                onClick={() => recordGaveUp(reason.key)}
              >
                <span>{reason.label}</span>
                <kbd>{index + 1}</kbd>
              </button>
            ))}
          </div>
        </>
      )}

      <footer className="prp-foot">
        <button
          type="button"
          className="prp-back"
          onClick={() =>
            stage === "outcome" ? onCancel?.() : setStage("outcome")
          }
        >
          {stage === "outcome" ? "取消" : "返回"}
        </button>
        <span className="prp-note">
          {stage === "outcome" ? "1 / 0 选择 · Esc 取消" : "点击即保存 · Esc 返回"}
        </span>
      </footer>
    </section>
  );
}
