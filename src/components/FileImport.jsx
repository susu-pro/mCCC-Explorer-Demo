import React from "react";
import { useDropzone } from "react-dropzone";
import { parseDelimitedFile, parseDelimitedText, guessMapping } from "../lib/parse";

function headersFromRows(rows) {
  const set = new Set();
  for (const r of rows) Object.keys(r ?? {}).forEach((k) => set.add(k));
  return [...set];
}

function SelectRow({ label, value, options, required, onChange }) {
  return (
    <div className="field">
      <div className="label">
        {label}
        {required ? <span style={{ color: "var(--danger)" }}> *</span> : null}
      </div>
      <select className="select" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">（未选择）</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function applyMebocostPreset(headers, mapping) {
  const has = (name) => headers.includes(name);
  const next = { ...mapping };
  if (has("Sender")) next.sender = "Sender";
  if (has("Receiver")) next.receiver = "Receiver";
  if (has("Metabolite_Name")) next.metabolite = "Metabolite_Name";
  else if (has("Metabolite")) next.metabolite = "Metabolite";
  if (has("Sensor")) next.sensor = "Sensor";
  if (has("permutation_test_fdr")) next.fdr = "permutation_test_fdr";
  else if (has("ttest_fdr")) next.fdr = "ttest_fdr";
  if (has("Commu_Score")) next.score = "Commu_Score";
  else if (has("Norm_Commu_Score")) next.score = "Norm_Commu_Score";
  if (has("Flux_PASS")) next.fluxPass = "Flux_PASS";
  if (has("Annotation")) next.annotation = "Annotation";
  return next;
}

export default function FileImport({ onLoaded, onError }) {
  const [fileName, setFileName] = React.useState("");
  const [rows, setRows] = React.useState(null);
  const [headers, setHeaders] = React.useState([]);
  const [mapping, setMapping] = React.useState({ sender: "", receiver: "" });
  const [busy, setBusy] = React.useState(false);

  const loadRows = async (name, getRows) => {
    setBusy(true);
    try {
      const parsed = await getRows();
      const hs = headersFromRows(parsed);
      const guess = guessMapping(hs);
      setFileName(name);
      setRows(parsed);
      setHeaders(hs);
      setMapping({
        sender: guess.sender,
        receiver: guess.receiver,
        metabolite: guess.metabolite,
        sensor: guess.sensor,
        score: guess.score,
        fdr: guess.fdr,
        fluxPass: guess.fluxPass,
        annotation: guess.annotation,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : "导入失败");
    } finally {
      setBusy(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false,
    accept: {
      "text/csv": [".csv"],
      "text/tab-separated-values": [".tsv"],
      "text/plain": [".txt"],
    },
    onDrop: async (files) => {
      const f = files?.[0];
      if (!f) return;
      await loadRows(f.name, () => parseDelimitedFile(f));
    },
  });

  const canStart = !!rows?.length && !!mapping.sender && !!mapping.receiver;

  return (
    <div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button
          className="btn small"
          disabled={busy}
          onClick={() =>
            loadRows("mebocost_example.csv", async () => {
              const res = await fetch("/sample/mebocost_example.csv");
              if (!res.ok) throw new Error("加载示例失败");
              return parseDelimitedText(await res.text());
            })
          }
        >
          加载示例
        </button>

        <div
          {...getRootProps()}
          className="btn small"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            background: isDragActive ? "rgba(14, 165, 233, 0.10)" : "white",
          }}
        >
          <input {...getInputProps()} />
          {isDragActive ? "松开导入…" : "拖拽文件 / 点击选择"}
        </div>

        {headers?.length ? (
          <button
            className="btn small"
            disabled={busy}
            onClick={() => setMapping((m) => applyMebocostPreset(headers, m))}
            title="对 MEBOCOST 默认输出列（Sender/Receiver/Metabolite_Name/Sensor/permutation_test_fdr/Commu_Score）一键映射"
          >
            MEBOCOST 预设
          </button>
        ) : null}
      </div>

      <div style={{ marginTop: 10 }} className="muted">
        <span style={{ fontSize: 12 }}>
          当前文件：{" "}
          <span style={{ fontWeight: 700, color: "var(--text)" }}>{fileName ? fileName : "未选择"}</span>
          {rows ? `（${rows.length} 行）` : ""}
        </span>
      </div>

      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        <SelectRow
          label="Sender"
          required
          options={headers}
          value={mapping.sender}
          onChange={(v) => setMapping((m) => ({ ...m, sender: v }))}
        />
        <SelectRow
          label="Receiver"
          required
          options={headers}
          value={mapping.receiver}
          onChange={(v) => setMapping((m) => ({ ...m, receiver: v }))}
        />
        <SelectRow
          label="Metabolite"
          options={headers}
          value={mapping.metabolite}
          onChange={(v) => setMapping((m) => ({ ...m, metabolite: v || undefined }))}
        />
        <SelectRow
          label="Sensor"
          options={headers}
          value={mapping.sensor}
          onChange={(v) => setMapping((m) => ({ ...m, sensor: v || undefined }))}
        />
        <SelectRow
          label="FDR"
          options={headers}
          value={mapping.fdr}
          onChange={(v) => setMapping((m) => ({ ...m, fdr: v || undefined }))}
        />
        <SelectRow
          label="Score"
          options={headers}
          value={mapping.score}
          onChange={(v) => setMapping((m) => ({ ...m, score: v || undefined }))}
        />
        <SelectRow
          label="Flux_PASS"
          options={headers}
          value={mapping.fluxPass}
          onChange={(v) => setMapping((m) => ({ ...m, fluxPass: v || undefined }))}
        />
        <SelectRow
          label="Annotation"
          options={headers}
          value={mapping.annotation}
          onChange={(v) => setMapping((m) => ({ ...m, annotation: v || undefined }))}
        />
      </div>

      <div className="row split" style={{ marginTop: 12 }}>
        <div className="muted" style={{ fontSize: 12 }}>
          {busy ? "处理中…" : canStart ? "可以开始分析" : "请至少映射 Sender/Receiver"}
        </div>
        <button
          className={`btn ${canStart ? "primary" : ""}`}
          disabled={!canStart || busy}
          onClick={() => onLoaded({ rawRows: rows, columnMapping: mapping, fileName })}
        >
          开始
        </button>
      </div>
    </div>
  );
}
