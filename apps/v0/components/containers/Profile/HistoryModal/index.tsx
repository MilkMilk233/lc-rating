"use client";

// Record manager: browse every logged attempt, filter it, and delete mistakes.
// Read-only otherwise — events are immutable, so fixing a wrong band means
// deleting the row and recording again.

import { useI18n } from "@hooks/useI18n";
import { useQuestionTitle } from "@hooks/useQuestionTitles";
import { useProgressStore } from "@hooks/useProgressStore";
import {
  EFFORT_BANDS,
  attemptLabel,
  bandHintKey,
  bandLabelKey,
} from "@hooks/useProgressStore/bands";
import type {
  AttemptEvent,
  EffortBand,
} from "@hooks/useProgressStore/types";
import { useMemo, useState } from "react";
import { Button, Form, Modal } from "react-bootstrap";

interface HistoryModalProps {
  show: boolean;
  onHide: () => void;
  /** qid -> { title, rating }, joined from the frozen question pool. */
  questionById: Map<string, { title: string; rating: number }>;
}

type OutcomeFilter = "" | "solved" | "gaveup";

const formatTime = (ts: number) => {
  const date = new Date(ts);
  const pad = (value: number) => `${value}`.padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function HistoryModal({
  show,
  onHide,
  questionById,
}: HistoryModalProps) {
  const { derived, removeAttempts } = useProgressStore();
  const { t } = useI18n();
  const titleOf = useQuestionTitle();
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<OutcomeFilter>("");
  const [band, setBand] = useState<"" | EffortBand>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rows = useMemo<AttemptEvent[]>(() => {
    const needle = query.trim().toLowerCase();
    const newestFirst = [...derived.events].reverse();

    return newestFirst.filter((event): event is AttemptEvent => {
      if (event.type !== "attempt") return false;
      if (outcome && event.outcome !== outcome) return false;
      if (band && (event.outcome !== "solved" || event.band !== band)) {
        return false;
      }
      if (needle) {
        const info = questionById.get(event.qid);
        const title = info ? titleOf(event.qid, info.title) : "";
        const haystack = `${event.qid} ${title}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [derived, outcome, band, query, questionById]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(Array.from(prev));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)));
  };

  const onDelete = () => {
    if (selected.size === 0) return;
    const confirmed =
      typeof window === "undefined" ||
      window.confirm(t("history.confirm", { count: selected.size }));
    if (!confirmed) return;
    removeAttempts(Array.from(selected));
    setSelected(new Set());
  };

  return (
    <Modal
      show={show}
      onHide={onHide}
      size="xl"
      centered
      contentClassName="duo-modal"
    >
      <Modal.Header closeButton>
        <Modal.Title>{t("history.title")}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="history-toolbar">
          <Form.Control
            className="history-search"
            placeholder={t("history.search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Form.Select
            className="history-select"
            value={outcome}
            onChange={(event) =>
              setOutcome(event.target.value as OutcomeFilter)
            }
          >
            <option value="">{t("history.allOutcomes")}</option>
            <option value="solved">{t("zen.outcome.solved")}</option>
            <option value="gaveup">{t("zen.outcome.gaveup")}</option>
          </Form.Select>
          <Form.Select
            className="history-select"
            value={band}
            onChange={(event) =>
              setBand(event.target.value as "" | EffortBand)
            }
          >
            <option value="">{t("history.allBands")}</option>
            {EFFORT_BANDS.map((item) => (
              <option key={item.key} value={item.key}>
                {t(bandLabelKey(item.key))} {t(bandHintKey(item.key))}
              </option>
            ))}
          </Form.Select>
          <Form.Check
            className="history-all"
            checked={allSelected}
            onChange={toggleAll}
            label={t("history.selectAll")}
            disabled={rows.length === 0}
          />
        </div>

        <div className="history-list">
          {rows.map((event) => {
            const info = questionById.get(event.qid);
            return (
              <div
                className={`history-row${
                  selected.has(event.id) ? " selected" : ""
                }`}
                key={event.id}
              >
                <Form.Check
                  checked={selected.has(event.id)}
                  onChange={() => toggle(event.id)}
                  aria-label={t("history.selectRow")}
                />
                <span className="history-time">{formatTime(event.at)}</span>
                <span className="history-qid">{event.qid}</span>
                <span className="history-title">
                  {titleOf(event.qid, info?.title ?? t("history.gone"))}
                </span>
                <span className="history-state">{attemptLabel(event, t)}</span>
                <span className="history-src">{event.src}</span>
              </div>
            );
          })}
          {rows.length === 0 && (
            <div className="duo-teaser">{t("history.noMatch")}</div>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <span className="history-count">
            {t("history.count", { count: rows.length })}
          </span>
        <Button variant="secondary" onClick={onHide}>
          {t("common.close")}
        </Button>
        <Button
          variant="danger"
          disabled={selected.size === 0}
          onClick={onDelete}
        >
          {t("history.delete", { count: selected.size })}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
