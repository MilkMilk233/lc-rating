"use client";

// Post-attempt recording panel.
//
// Two stages: outcome (solved / gave up), then a mandatory band or reason.
// The panel is presentation-only: it calls `logAttempt` and hands the event to
// the parent, which owns the undo toast and navigation.

import { useI18n } from "@hooks/useI18n";
import { useProgressStore } from "@hooks/useProgressStore";
import {
  EFFORT_BANDS,
  GAVEUP_REASONS,
  INDEPENDENCE_OPTIONS,
  bandHintKey,
  bandLabelKey,
  gaveUpReasonKey,
  independenceKey,
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
  const { t } = useI18n();
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
      aria-label={t("record.title")}
    >
      <header className="prp-head">
        <span className="prp-kicker">{t("record.title")}</span>
        {questionTitle && <span className="prp-title">{questionTitle}</span>}
      </header>

      {stage === "outcome" && (
        <>
          <p className="prp-question">{t("record.prompt.outcome")}</p>
          <div className="prp-row">
            <button
              type="button"
              className="prp-choice primary"
              onClick={() => setStage("solved")}
            >
              <span>{t("record.outcome.solved")}</span>
              <kbd>1</kbd>
            </button>
            <button
              type="button"
              className="prp-choice"
              onClick={() => setStage("gaveup")}
            >
              <span>{t("record.outcome.gaveup")}</span>
              <kbd>0</kbd>
            </button>
          </div>
        </>
      )}

      {stage === "solved" && (
        <>
          <p className="prp-question">
            {t("record.prompt.band")}<span className="prp-required">{t("record.required")}</span>
          </p>
          <div className="prp-bands">
            {EFFORT_BANDS.map((band, index) => (
              <button
                key={band.key}
                type="button"
                className="prp-band"
                onClick={() => recordSolved(band.key)}
              >
                <span className="prp-band-label">{t(bandLabelKey(band.key))}</span>
                <span className="prp-band-hint">{t(bandHintKey(band.key))}</span>
                <kbd>{index + 1}</kbd>
              </button>
            ))}
          </div>
          <div className="prp-independence" role="group" aria-label={t("record.group.independence")}>
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
                {t(independenceKey(option.key))}
              </button>
            ))}
            <kbd>S</kbd>
          </div>
          <div className="prp-independence" role="group" aria-label={t("record.group.drill")}>
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
        </>
      )}

      {stage === "gaveup" && (
        <>
          <p className="prp-question">
            {t("record.prompt.reason")}<span className="prp-required">{t("record.required")}</span>
          </p>
          <div className="prp-row column">
            {GAVEUP_REASONS.map((reason, index) => (
              <button
                key={reason.key}
                type="button"
                className="prp-choice"
                onClick={() => recordGaveUp(reason.key)}
              >
                <span>{t(gaveUpReasonKey(reason.key))}</span>
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
          {stage === "outcome" ? t("common.cancel") : t("common.back")}
        </button>
        <span className="prp-note">
          {stage === "outcome" ? t("record.footer.outcome") : t("record.footer.steps")}
        </span>
      </footer>
    </section>
  );
}
