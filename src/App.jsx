import React from "react";
import { readQueryState, writeQueryStateTo } from "./lib/queryState";
import { buildEvents, computeDetailsForCell, computeSelectionSummary, filterEvents, summarizeWarnings } from "./lib/transform";
import FileImport from "./components/FileImport";
import FiltersPanel from "./components/FiltersPanel";
import NetworkView from "./components/NetworkView";
import MatrixView from "./components/MatrixView";
import DotPlotView from "./components/DotPlotView";
import TableView from "./components/TableView";
import DetailsDrawer from "./components/DetailsDrawer";
import Legend from "./components/Legend";
import CompareView from "./components/CompareView";
import InsightsPanel from "./components/InsightsPanel";
import LlmPanel from "./components/LlmPanel";
import ErrorBoundary from "./components/ErrorBoundary";
import { downloadHtml, downloadJson, downloadText, downloadTsv, generateCompareReport, generateSingleReport, summarizeDataset } from "./lib/report";
import { aggregatePairs, computeCategoryDiff, computePairDiff } from "./lib/compare";
import { buildCompareInsights, buildSingleInsights, toMarkdown } from "./lib/intelligence";
import { computeNullControl, computeRobustness } from "./lib/robustness";
import { guessMapping, parseDelimitedText } from "./lib/parse";

function defaultFilters() {
  return {
    fdrMax: 0.05,
    includeSelfLoops: false,
    topEdges: 300,
    metaboliteQuery: "",
    sensorQuery: "",
    annotationQuery: "",
    fluxPass: "all",
    focusCell: undefined,
    focusMode: "any",
  };
}

function headersFromRows(rows) {
  const set = new Set();
  for (const r of rows ?? []) Object.keys(r ?? {}).forEach((k) => set.add(k));
  return [...set];
}

export default function App() {
  const initial = React.useMemo(() => readQueryState(window.location.search), []);
  const [view, setView] = React.useState(initial.view ?? "network");
  const [filters, setFilters] = React.useState(() => ({ ...defaultFilters(), ...(initial.filters ?? {}) }));

  const [sampleId, setSampleId] = React.useState(() => new URLSearchParams(window.location.search).get("sample") ?? "");
  const [cmpSampleAId, setCmpSampleAId] = React.useState(() => new URLSearchParams(window.location.search).get("sampleA") ?? "");
  const [cmpSampleBId, setCmpSampleBId] = React.useState(() => new URLSearchParams(window.location.search).get("sampleB") ?? "");
  const [datasetName, setDatasetName] = React.useState("");
  const [rows, setRows] = React.useState(null);
  const [mapping, setMapping] = React.useState(null);
  const [events, setEvents] = React.useState(null);
  const [importWarnings, setImportWarnings] = React.useState([]);
  const [error, setError] = React.useState(null);

  const [cmpA, setCmpA] = React.useState({ fileName: "", rows: null, mapping: null, events: null, warnings: [] });
  const [cmpB, setCmpB] = React.useState({ fileName: "", rows: null, mapping: null, events: null, warnings: [] });

  const [selectedCell, setSelectedCell] = React.useState(null);
  const [selectedPair, setSelectedPair] = React.useState(null); // {sender, receiver}
  const [weightMode, setWeightMode] = React.useState(() => {
    const w = initial.weightMode;
    if (w === "commu_score" || w === "norm_commu_score" || w === "neglog10_fdr") return w;
    return "neglog10_fdr";
  });

  const selectCell = React.useCallback((cellId) => {
    setSelectedPair(null);
    setSelectedCell(cellId);
  }, []);

  const selectPair = React.useCallback((pair) => {
    if (!pair || typeof pair !== "object") return;
    const sender = typeof pair.sender === "string" ? pair.sender : "";
    const receiver = typeof pair.receiver === "string" ? pair.receiver : "";
    if (!sender || !receiver) return;
    setSelectedCell(null);
    setSelectedPair({ sender, receiver });
  }, []);

  const autoloadRef = React.useRef(false);
  React.useEffect(() => {
    if (autoloadRef.current) return;
    const sp = new URLSearchParams(window.location.search);
    const sample = sp.get("sample");
    if (!sample) return;
    autoloadRef.current = true;

    const url = sample.startsWith("/") ? sample : `/sample/${sample}`;
    (async () => {
      try {
        setError(null);
        const res = await fetch(url);
        if (!res.ok) throw new Error("Auto-load sample failed");
        const parsed = parseDelimitedText(await res.text());
        const hs = headersFromRows(parsed);
        const m = guessMapping(hs);
        if (!m.sender || !m.receiver) throw new Error("Auto-load sample failed: missing Sender/Receiver columns");

        setSelectedCell(null);
        setSelectedPair(null);
        const { events: ev, report } = buildEvents(parsed, m);
        setRows(parsed);
        setMapping(m);
        setEvents(ev);
        setImportWarnings(summarizeWarnings(report, m));
        const id = sample.split("/").pop() || sample;
        setSampleId(id);
        setDatasetName(id);
        setFilters((prev) => {
          const base = { ...defaultFilters(), ...(initial.filters ?? {}) };
          const inferredFluxDefault = m?.fluxPass ? "pass" : "all";
          return {
            ...base,
            includeSelfLoops: prev.includeSelfLoops,
            fluxPass: (initial.filters?.fluxPass ?? inferredFluxDefault) || inferredFluxDefault,
          };
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Auto-load sample failed");
      }
    })();
  }, [initial]);

  const autoloadCompareRef = React.useRef(false);
  React.useEffect(() => {
    if (autoloadCompareRef.current) return;
    const sp = new URLSearchParams(window.location.search);
    const v = sp.get("view");
    const sampleA = sp.get("sampleA");
    const sampleB = sp.get("sampleB");
    if (v !== "compare") return;
    if (!sampleA && !sampleB) return;
    autoloadCompareRef.current = true;

    const loadOne = async (sample) => {
      const url = sample.startsWith("/") ? sample : `/sample/${sample}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Auto-load compare sample failed: ${sample}`);
      const parsed = parseDelimitedText(await res.text());
      const hs = headersFromRows(parsed);
      const m = guessMapping(hs);
      if (!m.sender || !m.receiver) throw new Error(`Auto-load compare sample failed: missing Sender/Receiver columns (${sample})`);
      const { events: ev, report } = buildEvents(parsed, m);
      const id = sample.split("/").pop() || sample;
      return { fileName: id, rows: parsed, mapping: m, events: ev, warnings: summarizeWarnings(report, m), id };
    };

    (async () => {
      try {
        setError(null);
        if (sampleA) {
          const a = await loadOne(sampleA);
          setCmpA({ fileName: a.fileName, rows: a.rows, mapping: a.mapping, events: a.events, warnings: a.warnings });
          setCmpSampleAId(a.id);
        }
        if (sampleB) {
          const b = await loadOne(sampleB);
          setCmpB({ fileName: b.fileName, rows: b.rows, mapping: b.mapping, events: b.events, warnings: b.warnings });
          setCmpSampleBId(b.id);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Auto-load compare samples failed");
      }
    })();
  }, []);

  React.useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    writeQueryStateTo(sp, { view, filters });
    if (weightMode) sp.set("w", weightMode);
    else sp.delete("w");
    if (view === "compare") {
      sp.delete("sample");
      if (cmpSampleAId) sp.set("sampleA", cmpSampleAId);
      else sp.delete("sampleA");
      if (cmpSampleBId) sp.set("sampleB", cmpSampleBId);
      else sp.delete("sampleB");
    } else {
      if (sampleId) sp.set("sample", sampleId);
      else sp.delete("sample");
      sp.delete("sampleA");
      sp.delete("sampleB");
    }
    const next = `?${sp.toString()}`;
    window.history.replaceState({}, "", next);
  }, [view, filters, weightMode, sampleId, cmpSampleAId, cmpSampleBId]);

  const num = (v) => {
    if (v === null || v === undefined) return undefined;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const n = Number(String(v).trim());
    return Number.isFinite(n) ? n : undefined;
  };

  const filtered = React.useMemo(() => {
    if (!events) return null;
    const base = filterEvents(events, filters);
    // apply weight mode at view-time
    return base.map((e) => {
      let weight = e.weight;
      if (weightMode === "commu_score") {
        const v = num(e.raw?.Commu_Score);
        weight = typeof v === "number" ? v : typeof e.score === "number" ? e.score : e.weight;
      }
      if (weightMode === "norm_commu_score") {
        const v = num(e.raw?.Norm_Commu_Score);
        weight = typeof v === "number" ? v : typeof e.score === "number" ? e.score : e.weight;
      }
      if (weightMode === "neglog10_fdr") weight = e.weight;
      return { ...e, weight };
    });
  }, [events, filters, weightMode]);

  const applyWeightMode = React.useCallback(
    (evs) =>
      evs.map((e) => {
        let weight = e.weight;
        if (weightMode === "commu_score") {
          const v = num(e.raw?.Commu_Score);
          weight = typeof v === "number" ? v : typeof e.score === "number" ? e.score : e.weight;
        }
        if (weightMode === "norm_commu_score") {
          const v = num(e.raw?.Norm_Commu_Score);
          weight = typeof v === "number" ? v : typeof e.score === "number" ? e.score : e.weight;
        }
        if (weightMode === "neglog10_fdr") weight = e.weight;
        return { ...e, weight };
      }),
    [num, weightMode],
  );

  const filteredA = React.useMemo(() => {
    if (!cmpA.events) return null;
    return applyWeightMode(filterEvents(cmpA.events, filters));
  }, [cmpA.events, filters, applyWeightMode]);

  const filteredB = React.useMemo(() => {
    if (!cmpB.events) return null;
    return applyWeightMode(filterEvents(cmpB.events, filters));
  }, [cmpB.events, filters, applyWeightMode]);

  const compareInsights = React.useMemo(() => {
    if (!filteredA || !filteredB) return null;
    const aggA = aggregatePairs(filteredA);
    const aggB = aggregatePairs(filteredB);
    const diffRows = computePairDiff(aggA, aggB, 1e-6);
    const annDiffRows = computeCategoryDiff(filteredA, filteredB, (e) => e.annotation || "NA");
    const fluxDiffRows = computeCategoryDiff(filteredA, filteredB, (e) => (e.fluxPass ?? "").toUpperCase() || "NA");
    return buildCompareInsights({
      eventsA: filteredA,
      eventsB: filteredB,
      diffRows,
      annDiffRows,
      fluxDiffRows,
      filters,
      weightMode,
    });
  }, [filteredA, filteredB, filters, weightMode]);

  const selectionSummary = React.useMemo(() => {
    if (!filtered) return null;
    return computeSelectionSummary(filtered);
  }, [filtered]);

  const singleInsights = React.useMemo(() => {
    if (!filtered || !mapping) return null;
    return buildSingleInsights({ events: filtered, mapping, filters, weightMode });
  }, [filtered, mapping, filters, weightMode]);

  const applyFilterPatch = React.useCallback((patch) => {
    if (!patch || typeof patch !== "object") return;
    setFilters((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) continue;
        next[k] = v;
      }
      return next;
    });
  }, []);

  const importPrefill = React.useMemo(() => {
    const name = datasetName || sampleId || "";
    if (!name || !rows || !mapping) return null;
    return { fileName: name, rows, mapping };
  }, [datasetName, sampleId, rows, mapping]);

  const cmpImportPrefillA = React.useMemo(() => {
    const name = cmpA?.fileName || cmpSampleAId || "";
    if (!name || !cmpA?.rows || !cmpA?.mapping) return null;
    return { fileName: name, rows: cmpA.rows, mapping: cmpA.mapping };
  }, [cmpA, cmpSampleAId]);

  const cmpImportPrefillB = React.useMemo(() => {
    const name = cmpB?.fileName || cmpSampleBId || "";
    if (!name || !cmpB?.rows || !cmpB?.mapping) return null;
    return { fileName: name, rows: cmpB.rows, mapping: cmpB.mapping };
  }, [cmpB, cmpSampleBId]);

  const details = React.useMemo(() => {
    if (!filtered || !selectedCell) return null;
    const base = selectionSummary?.byCell?.get(selectedCell) ? selectionSummary.byCell.get(selectedCell) : null;
    if (!base) return null;
    return { ...base, extra: computeDetailsForCell(filtered, selectedCell) };
  }, [filtered, selectedCell, selectionSummary]);

  const [toast, setToast] = React.useState(null);
  const toastTimerRef = React.useRef(0);

  const showToast = React.useCallback((msg) => {
    if (!msg) return;
    setToast(String(msg));
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 1800);
  }, []);

  React.useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const copyText = React.useCallback(
    async (text, okMsg = "Copied") => {
      try {
        await navigator.clipboard.writeText(String(text ?? ""));
        showToast(okMsg);
        return true;
      } catch {
        showToast("Copy failed. Please manually copy from the address bar.");
        return false;
      }
    },
    [showToast],
  );

  const activeInsights = view === "compare" ? compareInsights : singleInsights;

  const exportReport = () => {
    try {
      const wm = weightMode;
      if (view === "compare") {
        if (!filteredA || !filteredB) {
          showToast("Compare mode: import both Dataset A and Dataset B first.");
          return;
        }
        const diff = computePairDiff(aggregatePairs(filteredA), aggregatePairs(filteredB), 1e-6);
        const annDiffRows = computeCategoryDiff(filteredA, filteredB, (e) => e.annotation || "NA");
        const fluxDiffRows = computeCategoryDiff(filteredA, filteredB, (e) => (e.fluxPass ?? "").toUpperCase() || "NA");
        const insights = buildCompareInsights({
          eventsA: filteredA,
          eventsB: filteredB,
          diffRows: diff,
          annDiffRows,
          fluxDiffRows,
          filters,
          weightMode: wm,
        });
        const html = generateCompareReport({
          fileA: cmpA.fileName,
          fileB: cmpB.fileName,
          filters,
          weightMode: wm,
          summaryA: { ...summarizeDataset(filteredA), annDiffRows, fluxDiffRows },
          summaryB: summarizeDataset(filteredB),
          diffRows: diff,
          insights,
        });
        downloadHtml("mebocost-compare-report.html", html);
        showToast("Exported report: mebocost-compare-report.html");
        return;
      }

      if (!filtered || !selectionSummary) {
        showToast("Import data first to export a report.");
        return;
      }
      const robustness = events
        ? computeRobustness({ eventsAll: events, baseFilters: filters, weightMode: wm, topK: 10 })
        : null;
      const nullControl = events ? computeNullControl({ eventsAll: events, baseFilters: filters, weightMode: wm, n: 60, seed: 42 }) : null;
      const html = generateSingleReport({
        fileName: "single",
        filters,
        weightMode: wm,
        summary: summarizeDataset(filtered),
        topNodes: selectionSummary.nodes,
        topLinks: selectionSummary.links,
        insights: singleInsights,
        robustness,
        nullControl,
      });
      downloadHtml("mebocost-report.html", html);
      showToast("Exported report: mebocost-report.html");
    } catch {
      showToast("Export failed.");
    }
  };

  const exportSummaryMd = () => {
    if (!activeInsights) {
      showToast("No insights available yet. Import data and apply filters first.");
      return;
    }
    const md = toMarkdown(activeInsights, activeInsights.kind === "compare" ? "MEBOCOST Compare Insights" : "MEBOCOST Insights");
    downloadText(activeInsights.kind === "compare" ? "mebocost-compare-insights.md" : "mebocost-insights.md", md, "text/markdown;charset=utf-8");
    showToast("Exported insights (MD).");
  };

  const exportSummaryJson = () => {
    if (!activeInsights) {
      showToast("No insights available yet. Import data and apply filters first.");
      return;
    }
    downloadJson(activeInsights.kind === "compare" ? "mebocost-compare-insights.json" : "mebocost-insights.json", activeInsights);
    showToast("Exported insights (JSON).");
  };

  const exportFilteredTsv = () => {
    if (!filtered?.length) {
      showToast("No filtered rows to export.");
      return;
    }
    const headers = ["sender", "receiver", "metabolite", "sensor", "annotation", "fluxPass", "fdr", "weight"];
    const rowsOut = filtered.map((e) => ({
      sender: e.sender ?? "",
      receiver: e.receiver ?? "",
      metabolite: e.metabolite ?? "",
      sensor: e.sensor ?? "",
      annotation: e.annotation ?? "",
      fluxPass: e.fluxPass ?? "",
      fdr: typeof e.fdr === "number" && Number.isFinite(e.fdr) ? e.fdr : "",
      weight: typeof e.weight === "number" && Number.isFinite(e.weight) ? e.weight : "",
    }));
    downloadTsv("mccc_filtered.tsv", rowsOut, headers);
    showToast("Exported filtered table (TSV).");
  };

  const [actionsOpen, setActionsOpen] = React.useState(false);
  const actionsRef = React.useRef(null);

  React.useEffect(() => {
    if (!actionsOpen) return;
    const onDown = (e) => {
      if (e.key === "Escape") setActionsOpen(false);
    };
    const onClick = (e) => {
      const root = actionsRef.current;
      if (!root) return;
      if (root.contains(e.target)) return;
      setActionsOpen(false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("mousedown", onClick);
    };
  }, [actionsOpen]);

  React.useEffect(() => {
    const onKey = (e) => {
      const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;

      if (!e.shiftKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setActionsOpen((v) => !v);
        return;
      }
      if (e.shiftKey && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        copyText(window.location.href, "Share URL copied");
        return;
      }
      if (e.shiftKey && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        exportReport();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [copyText, exportReport]);

  return (
    <div className="app">
      <div className="header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-title">
              <span className="brand-mark" aria-hidden="true" />
              <span>MEBOCOST mCCC Explorer</span>
            </div>
            <div className="brand-sub">
              <div className="workflow" aria-label="workflow">
                <span className="wf-step">
                  <span className="wf-dot">1</span>Data Ingestion
                </span>
                <span className="wf-sep" aria-hidden="true">
                  →
                </span>
                <span className="wf-step">
                  <span className="wf-dot">2</span>Figure-Grade Views
                </span>
                <span className="wf-sep" aria-hidden="true">
                  →
                </span>
                <span className="wf-step">
                  <span className="wf-dot">3</span>Precision Filters
                </span>
                <span className="wf-sep" aria-hidden="true">
                  →
                </span>
                <span className="wf-step">
                  <span className="wf-dot">4</span>Export & Share
                </span>
              </div>
            </div>
          </div>

	          <div className="row">
	            <div className="tabs" role="tablist" aria-label="views">
	              {[
                ["network", "Network"],
                ["matrix", "Matrix"],
                ["dotplot", "DotPlot"],
                ["table", "Table"],
                ["insights", "Insights"],
                ["compare", "Compare"],
                ["llm", "LLM"],
	              ].map(([k, label]) => (
	                <button key={k} className={`tab ${view === k ? "active" : ""}`} onClick={() => setView(k)}>
	                  {label}
	                </button>
	              ))}
	            </div>
	            <div className="actions" ref={actionsRef}>
	              <button className={`btn ${actionsOpen ? "primary" : ""}`} type="button" onClick={() => setActionsOpen((v) => !v)}>
	                Actions <span aria-hidden="true">▾</span>
	              </button>
	              {actionsOpen ? (
	                <div className="actions-menu" role="menu" aria-label="actions">
	                  <button
	                    className="actions-item"
	                    type="button"
	                    role="menuitem"
	                    onClick={() => {
	                      copyText(window.location.href, "Share URL copied");
	                      setActionsOpen(false);
	                    }}
	                  >
	                    <div className="actions-main">
	                      <div className="actions-title">Copy share URL</div>
	                      <div className="actions-sub">Reproducible link with filters + view state.</div>
	                    </div>
	                    <div className="actions-kbd" aria-hidden="true">
	                      <kbd>⌘/Ctrl</kbd> <kbd>⇧</kbd> <kbd>C</kbd>
	                    </div>
	                  </button>

	                  <div className="actions-sep" role="separator" />

	                  <button
	                    className="actions-item"
	                    type="button"
	                    role="menuitem"
	                    onClick={() => {
	                      exportReport();
	                      setActionsOpen(false);
	                    }}
	                  >
	                    <div className="actions-main">
	                      <div className="actions-title">Export report (HTML)</div>
	                      <div className="actions-sub">Single/compare report with QC, robustness, and null controls.</div>
	                    </div>
	                    <div className="actions-kbd" aria-hidden="true">
	                      <kbd>⌘/Ctrl</kbd> <kbd>⇧</kbd> <kbd>E</kbd>
	                    </div>
	                  </button>

	                  <button
	                    className="actions-item"
	                    type="button"
	                    role="menuitem"
	                    disabled={!activeInsights}
	                    onClick={() => {
	                      exportSummaryMd();
	                      setActionsOpen(false);
	                    }}
	                  >
	                    <div className="actions-main">
	                      <div className="actions-title">Export insights (MD)</div>
	                      <div className="actions-sub">Automated summary + QC in Markdown.</div>
	                    </div>
	                  </button>

	                  <button
	                    className="actions-item"
	                    type="button"
	                    role="menuitem"
	                    disabled={!activeInsights}
	                    onClick={() => {
	                      exportSummaryJson();
	                      setActionsOpen(false);
	                    }}
	                  >
	                    <div className="actions-main">
	                      <div className="actions-title">Export insights (JSON)</div>
	                      <div className="actions-sub">Structured payload for downstream workflows.</div>
	                    </div>
	                  </button>

	                  <button
	                    className="actions-item"
	                    type="button"
	                    role="menuitem"
	                    disabled={!filtered?.length || view === "compare"}
	                    onClick={() => {
	                      exportFilteredTsv();
	                      setActionsOpen(false);
	                    }}
	                  >
	                    <div className="actions-main">
	                      <div className="actions-title">Export filtered table (TSV)</div>
	                      <div className="actions-sub">Sender/Receiver/Metabolite/Sensor + derived weight.</div>
	                    </div>
	                  </button>

	                  <div className="actions-foot">
	                    <div className="actions-foot-left">
	                      <span className="muted">Tip</span>: Press <kbd>⌘/Ctrl</kbd> <kbd>K</kbd> to open this menu.
	                    </div>
	                  </div>
	                </div>
	              ) : null}
	            </div>
	          </div>
	        </div>
	      </div>

	      <div className="container">
	        {toast ? (
	          <div className="toast" role="status" aria-live="polite">
	            {toast}
	          </div>
	        ) : null}
	        <div className="layout">
	          <div className="left">
	            <div className="pipe-group" aria-label="pipeline">
	              <div className="pipe-item">
	                <div className="pipe-rail" aria-hidden="true">
	                  <div className="pipe-dot">1</div>
	                  <div className="pipe-line" />
	                </div>
	            <div className="card pad">
	              <div className="row split">
	                <div>
	                  <div className="card-title">{view === "compare" ? "Data Ingestion (Compare)" : "Data Ingestion"}</div>
                  <div className="card-sub">
                    {view === "compare"
                      ? "Ingest Dataset A and Dataset B separately, then compare them under identical filter settings."
                      : "CSV/TSV ingestion with explicit schema mapping. Load first, then map columns."}
                  </div>
                  {view !== "compare" ? (
                    <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                      Current dataset:{" "}
                      <span style={{ fontWeight: 700, color: "var(--text)" }}>
                        {datasetName || "(none)"}
                        {rows?.length ? ` (${rows.length} rows)` : ""}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="divider" />
              {view === "compare" ? (
                <div style={{ display: "grid", gap: 14 }}>
	                  <div>
	                    <div className="pill">Dataset A</div>
	                    <div style={{ height: 8 }} />
	                  <FileImport
	                    onLoaded={({ rawRows, columnMapping, fileName }) => {
	                      setError(null);
	                      const { events: ev, report } = buildEvents(rawRows, columnMapping);
	                      if (fileName === "communication_result.tsv" || fileName === "mebocost_example.csv") setCmpSampleAId(fileName);
	                      else setCmpSampleAId("");
	                      setCmpA({
	                          fileName: fileName || "A",
	                          rows: rawRows,
	                          mapping: columnMapping,
	                          events: ev,
	                          warnings: summarizeWarnings(report, columnMapping),
	                      });
	                    }}
	                    onError={(msg) => setError(msg)}
	                    prefill={cmpImportPrefillA}
	                  />
                    {cmpA.warnings?.length ? (
                      <div className="notice" style={{ marginTop: 10 }}>
                        <div style={{ fontWeight: 700 }}>Dataset A warnings</div>
                        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                          {cmpA.warnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <div className="pill">Dataset B</div>
                    <div style={{ height: 8 }} />
	                  <FileImport
	                      onLoaded={({ rawRows, columnMapping, fileName }) => {
	                        setError(null);
	                        const { events: ev, report } = buildEvents(rawRows, columnMapping);
	                        if (fileName === "communication_result.tsv" || fileName === "mebocost_example.csv") setCmpSampleBId(fileName);
	                        else setCmpSampleBId("");
	                        setCmpB({
	                          fileName: fileName || "B",
	                          rows: rawRows,
	                          mapping: columnMapping,
	                          events: ev,
	                          warnings: summarizeWarnings(report, columnMapping),
	                        });
	                      }}
	                      onError={(msg) => setError(msg)}
	                      prefill={cmpImportPrefillB}
	                    />
                    {cmpB.warnings?.length ? (
                      <div className="notice" style={{ marginTop: 10 }}>
                        <div style={{ fontWeight: 700 }}>Dataset B warnings</div>
                        <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                          {cmpB.warnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <FileImport
                  onLoaded={({ rawRows, columnMapping, fileName }) => {
                    setError(null);
                    setSelectedCell(null);
                    setSelectedPair(null);
                    const { events: ev, report } = buildEvents(rawRows, columnMapping);
                    setRows(rawRows);
                    setMapping(columnMapping);
                    setEvents(ev);
                    setImportWarnings(summarizeWarnings(report, columnMapping));
                    setDatasetName(fileName || "");
                    if (fileName === "communication_result.tsv" || fileName === "mebocost_example.csv") setSampleId(fileName);
                    else setSampleId("");
                    setFilters((prev) => {
                      const base = { ...defaultFilters(), ...(initial.filters ?? {}) };
                      const inferredFluxDefault = columnMapping?.fluxPass ? "pass" : "all";
                      return {
                        ...base,
                        includeSelfLoops: prev.includeSelfLoops,
                        fluxPass: (initial.filters?.fluxPass ?? inferredFluxDefault) || inferredFluxDefault,
                      };
                    });
                  }}
                  onError={(msg) => setError(msg)}
                  prefill={importPrefill}
                />
              )}
              {error ? (
                <div className="warning" style={{ marginTop: 12 }}>
                  {error}
                </div>
              ) : null}
	              {view !== "compare" && importWarnings.length ? (
	                <div className="notice" style={{ marginTop: 12 }}>
	                  <div style={{ fontWeight: 700 }}>Dataset warnings</div>
	                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
	                    {importWarnings.map((w) => (
	                      <li key={w}>{w}</li>
	                    ))}
	                  </ul>
	                </div>
	              ) : null}
	            </div>
	              </div>

	              <div className="pipe-item">
	                <div className="pipe-rail" aria-hidden="true">
	                  <div className="pipe-dot">2</div>
	                </div>
	            <div className="card pad">
	              <div className="row split">
	                <div>
	                  <div className="card-title">Precision Filters</div>
	                  <div className="card-sub">Reduce scale first, then tighten thresholds for stable figures.</div>
                </div>
                <div className="pill">
                  {view === "compare" ? (
                    filteredA && filteredB ? (
                      <>
                        <span>A {filteredA.length} rows</span>
                        <span>·</span>
                        <span>B {filteredB.length} rows</span>
                      </>
                    ) : (
                      <span className="muted">(not loaded)</span>
                    )
                  ) : filtered ? (
                    <>
                      <span>{filtered.length} rows</span>
                      <span>·</span>
                      <span>{selectionSummary?.links?.length ?? 0} edges</span>
                      <span>·</span>
                      <span>{selectionSummary?.nodes?.length ?? 0} nodes</span>
                    </>
                  ) : (
                    <span className="muted">(not loaded)</span>
                  )}
                </div>
              </div>
              <div className="divider" />
              <FiltersPanel
                disabled={view === "compare" ? !cmpA.events && !cmpB.events : !events}
                filters={filters}
	                setFilters={(next) => setFilters(next)}
	                onReset={() => setFilters(defaultFilters())}
	              />
	            </div>
	              </div>
	            </div>
	          </div>

          <div className="right">
            <div className="card viz-shell">
              <div className="viz-titlebar">
                <div>
                  <div className="card-title">
                    {view === "network"
                      ? "Network"
                      : view === "matrix"
                        ? "Matrix"
                        : view === "dotplot"
                          ? "DotPlot"
                          : view === "table"
                            ? "Table"
                            : view === "compare"
                              ? "Compare"
                              : view === "llm"
                                ? "LLM"
                                : "Insights"}
                  </div>
                  <div className="viz-note">
                    {view === "compare"
                      ? "Compare A/B differences and stratified summaries under the same filters."
                      : view === "insights"
                        ? "Automated summary + QC + recommended settings (export to MD/JSON)."
                        : view === "llm"
                          ? "Optional: call an LLM endpoint to generate narrative analysis."
                        : "Click a cell type to view details; use one-click focus to zoom into a subnetwork."}
                  </div>
                </div>
                <div className="row">
                  <select
                    className="select"
                    style={{ width: 240 }}
                    value={weightMode}
                    onChange={(e) => setWeightMode(e.target.value)}
                    title="Controls the weight definition used by Network/Matrix/DotPlot"
                  >
                    <option value="neglog10_fdr">Weight: -log10(FDR) (recommended)</option>
                    <option value="commu_score">Weight: Commu_Score</option>
                    <option value="norm_commu_score">Weight: Norm_Commu_Score</option>
                  </select>
                  {filters.focusCell ? (
                    <button className="btn danger small" onClick={() => setFilters({ ...filters, focusCell: undefined })}>
                      Clear focus
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="viz-body">
                <ErrorBoundary title="Visualization crashed (caught)" resetKey={view}>
                  {view === "compare" ? (
                    !filteredA || !filteredB ? (
                      <div className="viz-scroll">
                        <div className="notice">Compare mode requires importing Dataset A and Dataset B.</div>
                      </div>
                    ) : (
                      <div className="viz-scroll">
                        <CompareView
                          eventsA={filteredA}
                          eventsB={filteredB}
                          weightMode={weightMode}
                          filters={filters}
                          onApplyRecommendations={applyFilterPatch}
                          selectedCell={selectedCell}
                          onSelectCell={setSelectedCell}
                        />
                      </div>
                    )
                  ) : view === "insights" ? (
                    !events || !filtered ? (
                      <div className="viz-scroll">
                        <div className="notice">Import a file and complete column mapping on the left first.</div>
                      </div>
                    ) : (
                      <div className="viz-scroll">
                        <InsightsPanel
                          title="Single-sample summary / QC"
                          fileLabel="single-insights"
                          insights={singleInsights}
                          onApplyRecommendations={applyFilterPatch}
                          events={filtered}
                          eventsAll={events}
                          filters={filters}
                          weightMode={weightMode}
                          selectedPair={selectedPair}
                          onSelectPair={selectPair}
                          onNavigate={(nextView) => setView(nextView)}
                        />
                      </div>
                    )
                  ) : view === "llm" ? (
                    <div className="viz-scroll">
                      <ErrorBoundary title="LLM panel crashed (caught)" resetKey="llm">
                        <LlmPanel />
                      </ErrorBoundary>
                    </div>
                  ) : !events || !filtered || !selectionSummary ? (
                    <div className="viz-scroll">
                      <div className="notice">Import a file and complete column mapping on the left first.</div>
                    </div>
                  ) : view === "network" ? (
                    <div className="viz-stack">
                      <Legend mode="network" weightMode={weightMode} />
                      <NetworkView
                        nodes={selectionSummary.nodes}
                        links={selectionSummary.links}
                        selectedCell={selectedCell}
                        onSelectCell={selectCell}
                        weightMode={weightMode}
                        selectedPair={selectedPair}
                        onSelectPair={selectPair}
                      />
                    </div>
                  ) : view === "matrix" ? (
                    <div className="viz-stack">
                      <Legend mode="matrix" weightMode={weightMode} />
                      <MatrixView
                        matrix={selectionSummary.matrix}
                        selectedCell={selectedCell}
                        onSelectCell={selectCell}
                        weightMode={weightMode}
                        selectedPair={selectedPair}
                        onSelectPair={selectPair}
                      />
                    </div>
                  ) : view === "dotplot" ? (
                    <div className="viz-stack">
                      <Legend mode="dotplot" weightMode={weightMode} />
                      <DotPlotView
                        matrix={selectionSummary.matrix}
                        selectedCell={selectedCell}
                        onSelectCell={selectCell}
                        weightMode={weightMode}
                        selectedPair={selectedPair}
                        onSelectPair={selectPair}
                      />
                    </div>
                  ) : (
                    <TableView events={filtered} selectedPair={selectedPair} onSelectPair={selectPair} />
                  )}
                </ErrorBoundary>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DetailsDrawer
        open={(view === "network" || view === "matrix" || view === "dotplot") && !!selectedCell && !!details}
        selectedCell={selectedCell}
        details={details}
        focusCell={filters.focusCell}
        focusMode={filters.focusMode}
        onClose={() => setSelectedCell(null)}
        onApplyFocus={(cell, mode) => setFilters({ ...filters, focusCell: cell, focusMode: mode })}
        onClearFocus={() => setFilters({ ...filters, focusCell: undefined })}
      />
    </div>
  );
}
