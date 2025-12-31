import React from "react";
import { readQueryState, writeQueryState } from "./lib/queryState";
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
import { downloadHtml, generateCompareReport, generateSingleReport, summarizeDataset } from "./lib/report";
import { aggregatePairs, computeCategoryDiff, computePairDiff } from "./lib/compare";
import { buildCompareInsights, buildSingleInsights } from "./lib/intelligence";
import { computeNullControl, computeRobustness } from "./lib/robustness";

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

export default function App() {
  const initial = React.useMemo(() => readQueryState(window.location.search), []);
  const [view, setView] = React.useState(initial.view ?? "network");
  const [filters, setFilters] = React.useState(() => ({ ...defaultFilters(), ...(initial.filters ?? {}) }));

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

  React.useEffect(() => {
    const qs = writeQueryState({ view, filters });
    const sp = new URLSearchParams(qs.startsWith("?") ? qs.slice(1) : qs);
    if (weightMode) sp.set("w", weightMode);
    else sp.delete("w");
    const next = `?${sp.toString()}`;
    window.history.replaceState({}, "", next);
  }, [view, filters, weightMode]);

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

  const details = React.useMemo(() => {
    if (!filtered || !selectedCell) return null;
    const base = selectionSummary?.byCell?.get(selectedCell) ? selectionSummary.byCell.get(selectedCell) : null;
    if (!base) return null;
    return { ...base, extra: computeDetailsForCell(filtered, selectedCell) };
  }, [filtered, selectedCell, selectionSummary]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      // eslint-disable-next-line no-alert
      alert("已复制可复现链接");
    } catch {
      // eslint-disable-next-line no-alert
      alert("复制失败（浏览器限制），可手动复制地址栏链接");
    }
  };

  const exportReport = () => {
    try {
      const wm = weightMode;
      if (view === "compare") {
        if (!filteredA || !filteredB) {
          // eslint-disable-next-line no-alert
          alert("请先在 Compare 模式导入两份数据（A 与 B）");
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
        return;
      }

      if (!filtered || !selectionSummary) {
        // eslint-disable-next-line no-alert
        alert("请先导入数据并开始分析");
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
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert("导出报告失败");
    }
  };

  return (
    <div className="app">
      <div className="header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-title">MEBOCOST mCCC Explorer</div>
            <div className="brand-sub">导入结果表 → 复现 Figure 风格图 → 筛选 → 导出/分享</div>
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
            <button className="btn" onClick={share}>
              分享链接
            </button>
            <button className="btn" onClick={exportReport}>
              导出报告
            </button>
          </div>
        </div>
      </div>

      <div className="container">
        <div className="layout">
          <div className="left">
            <div className="card pad">
              <div className="row split">
                <div>
                  <div className="card-title">{view === "compare" ? "导入（Compare）" : "导入"}</div>
                  <div className="card-sub">
                    {view === "compare" ? "分别导入 Dataset A 与 Dataset B，用同一套过滤条件进行对比。" : "CSV/TSV 均可；先导入，再做列映射。"}
                  </div>
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
                      setCmpA({
                          fileName: fileName || "A",
                          rows: rawRows,
                          mapping: columnMapping,
                          events: ev,
                          warnings: summarizeWarnings(report, columnMapping),
                      });
                    }}
                    onError={(msg) => setError(msg)}
                  />
                    {cmpA.warnings?.length ? (
                      <div className="notice" style={{ marginTop: 10 }}>
                        <div style={{ fontWeight: 700 }}>A 数据提示</div>
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
                        setCmpB({
                          fileName: fileName || "B",
                          rows: rawRows,
                          mapping: columnMapping,
                          events: ev,
                          warnings: summarizeWarnings(report, columnMapping),
                        });
                      }}
                      onError={(msg) => setError(msg)}
                    />
                    {cmpB.warnings?.length ? (
                      <div className="notice" style={{ marginTop: 10 }}>
                        <div style={{ fontWeight: 700 }}>B 数据提示</div>
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
                  onLoaded={({ rawRows, columnMapping }) => {
                    setError(null);
                    setSelectedCell(null);
                    const { events: ev, report } = buildEvents(rawRows, columnMapping);
                    setRows(rawRows);
                    setMapping(columnMapping);
                    setEvents(ev);
                    setImportWarnings(summarizeWarnings(report, columnMapping));
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
                />
              )}
              {error ? (
                <div className="warning" style={{ marginTop: 12 }}>
                  {error}
                </div>
              ) : null}
              {view !== "compare" && importWarnings.length ? (
                <div className="notice" style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 700 }}>数据提示</div>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {importWarnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="card pad">
              <div className="row split">
                <div>
                  <div className="card-title">筛选</div>
                  <div className="card-sub">Figure 风格：先收敛规模，再精筛。</div>
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
                      <span className="muted">未加载</span>
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
                    <span className="muted">未加载</span>
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
                      ? "同一套过滤条件下，对比 A/B 的差异网络与分层摘要。"
                      : view === "insights"
                        ? "自动摘要 + QC + 推荐设置，可导出为 MD/JSON。"
                        : view === "llm"
                          ? "可选：调用 RunPod DeepSeek 生成文字分析（示例 prompt 可直接测试连通性）。"
                        : "点击 cell type 查看右侧详情；在详情里一键“聚焦该 cell”的子网络。"}
                  </div>
                </div>
                <div className="row">
                  <select
                    className="select"
                    style={{ width: 240 }}
                    value={weightMode}
                    onChange={(e) => setWeightMode(e.target.value)}
                    title="控制 Network/Matrix/DotPlot 使用的权重口径"
                  >
                    <option value="neglog10_fdr">Weight: -log10(FDR)（推荐）</option>
                    <option value="commu_score">Weight: Commu_Score</option>
                    <option value="norm_commu_score">Weight: Norm_Commu_Score</option>
                  </select>
                  {filters.focusCell ? (
                    <button className="btn danger small" onClick={() => setFilters({ ...filters, focusCell: undefined })}>
                      清除聚焦
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="viz-body">
                {view === "compare" ? (
                  !filteredA || !filteredB ? (
                    <div className="viz-scroll">
                      <div className="notice">Compare 模式需要导入 Dataset A 与 Dataset B。</div>
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
                      <div className="notice">先在左侧导入文件并完成列映射。</div>
                    </div>
                  ) : (
                    <div className="viz-scroll">
                      <InsightsPanel
                        title="单样本自动摘要 / QC"
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
                    <LlmPanel />
                  </div>
                ) : !events || !filtered || !selectionSummary ? (
                  <div className="viz-scroll">
                    <div className="notice">先在左侧导入文件并完成列映射。</div>
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
