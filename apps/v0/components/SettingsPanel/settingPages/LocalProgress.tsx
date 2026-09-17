import { useI18n } from "@hooks/useI18n";
import { useProgressStore } from "@hooks/useProgressStore";
import { useMemo, useState } from "react";
import { Alert, Button, Form } from "react-bootstrap";

import type { MessageKey, TranslateParams } from "@hooks/useI18n";

// Status holds a message key rather than a finished string: the text is built
// when it is rendered, in whatever locale is active then.
type Status =
  | { kind: "idle" }
  | { kind: "ok"; key: MessageKey; params?: TranslateParams }
  | { kind: "error"; key: MessageKey; params?: TranslateParams };

export default function LocalProgress() {
  const { store, exportData, importData } = useProgressStore();
  const { t } = useI18n();
  const [inputData, setInputData] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const summary = useMemo(() => {
    const solved = store.events.filter(
      (event) => event.type === "attempt" && event.outcome === "solved",
    ).length;
    const gaveup = store.events.filter(
      (event) => event.type === "attempt" && event.outcome === "gaveup",
    ).length;
    return t("settings.progress.summary", {
      total: store.events.length,
      solved,
      gaveup,
    });
  }, [store, t]);

  const onExport = () => {
    setInputData(exportData());
    setStatus({ kind: "idle" });
  };

  const onCopy = () => {
    navigator.clipboard.writeText(inputData || exportData());
  };

  const onDownload = () => {
    const blob = new Blob([exportData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lc-rating-progress-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const onImport = () => {
    const result = importData(inputData);
    if (!result.ok) {
      setStatus({
        kind: "error",
        key: result.errorKey ?? "settings.progress.importFailed",
      });
      return;
    }
    const parts = [t("settings.progress.added", { count: result.imported })];
    if (result.duplicates > 0) {
      parts.push(t("settings.progress.skipped", { count: result.duplicates }));
    }
    if (result.invalid > 0) {
      parts.push(t("settings.progress.ignored", { count: result.invalid }));
    }
    setStatus({
      kind: "ok",
      key: "settings.progress.imported",
      params: { parts: parts.join(" · ") },
    });
  };

  return (
    <div>
      <p className="text-muted mb-3" style={{ fontSize: ".9rem" }}>
        {summary}
      </p>

      <div className="d-flex flex-wrap gap-2">
        <Button onClick={onExport}>{t("settings.progress.export")}</Button>
        <Button variant="outline-secondary" onClick={onDownload}>
          {t("settings.progress.download")}
        </Button>
        <Button
          variant="outline-secondary"
          onClick={onCopy}
          disabled={!inputData}
        >
          {t("settings.progress.copy")}
        </Button>
      </div>

      <Form.Group className="mt-3 position-relative">
        <Form.Label>{t("settings.progress.label")}</Form.Label>
        <Form.Control
          as="textarea"
          rows={10}
          value={inputData}
          onChange={(event) => setInputData(event.target.value)}
          placeholder={t("settings.progress.placeholder")}
        />
      </Form.Group>

      <Button onClick={onImport} className="mt-2" disabled={!inputData.trim()}>
        {t("settings.progress.import")}
      </Button>

      {status.kind === "ok" && (
        <Alert variant="success" className="mt-2">
          {t(status.key, status.params)}
        </Alert>
      )}
      {status.kind === "error" && (
        <Alert variant="danger" className="mt-2">
          {t(status.key, status.params)}
        </Alert>
      )}
    </div>
  );
}
