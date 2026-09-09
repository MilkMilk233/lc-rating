import { useProgressStore } from "@hooks/useProgressStore";
import { useMemo, useState } from "react";
import { Alert, Button, Form } from "react-bootstrap";

type Status =
  | { kind: "idle" }
  | { kind: "ok"; text: string }
  | { kind: "error"; text: string };

export default function LocalProgress() {
  const { store, exportData, importData } = useProgressStore();
  const [inputData, setInputData] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const summary = useMemo(() => {
    const solved = store.events.filter(
      (event) => event.type === "attempt" && event.outcome === "solved",
    ).length;
    const gaveup = store.events.filter(
      (event) => event.type === "attempt" && event.outcome === "gaveup",
    ).length;
    return `共 ${store.events.length} 条记录（做出来 ${solved} · 没做出来 ${gaveup}）`;
  }, [store]);

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
      setStatus({ kind: "error", text: result.error ?? "导入失败" });
      return;
    }
    const parts = [`新增 ${result.imported} 条`];
    if (result.duplicates > 0) parts.push(`跳过重复 ${result.duplicates} 条`);
    if (result.invalid > 0) parts.push(`忽略无效 ${result.invalid} 条`);
    setStatus({ kind: "ok", text: `导入完成：${parts.join("，")}` });
  };

  return (
    <div>
      <p className="text-muted mb-3" style={{ fontSize: ".9rem" }}>
        {summary}
      </p>

      <div className="d-flex flex-wrap gap-2">
        <Button onClick={onExport}>导出到文本框</Button>
        <Button variant="outline-secondary" onClick={onDownload}>
          下载 JSON 文件
        </Button>
        <Button
          variant="outline-secondary"
          onClick={onCopy}
          disabled={!inputData}
        >
          复制到剪贴板
        </Button>
      </div>

      <Form.Group className="mt-3 position-relative">
        <Form.Label>进度数据（可复制到另一台设备）</Form.Label>
        <Form.Control
          as="textarea"
          rows={10}
          value={inputData}
          onChange={(event) => setInputData(event.target.value)}
          placeholder="点击上方按钮导出，或粘贴另一台设备导出的 JSON 后点「导入」"
        />
      </Form.Group>

      <Button onClick={onImport} className="mt-2" disabled={!inputData.trim()}>
        导入
      </Button>

      {status.kind === "ok" && (
        <Alert variant="success" className="mt-2">
          {status.text}
        </Alert>
      )}
      {status.kind === "error" && (
        <Alert variant="danger" className="mt-2">
          {status.text}
        </Alert>
      )}
    </div>
  );
}
