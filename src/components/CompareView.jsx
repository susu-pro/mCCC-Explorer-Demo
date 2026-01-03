import React from "react";
import { aggregatePairs, buildDeltaMatrix, computeCategoryDiff, computePairDiff } from "../lib/compare";
import { buildCompareInsights } from "../lib/intelligence";
import DeltaMatrixView from "./DeltaMatrixView";
import DeltaTableView from "./DeltaTableView";
import DeltaNetworkView from "./DeltaNetworkView";
import InsightsPanel from "./InsightsPanel";

function fmt(n, d = 2) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  return n.toFixed(d);
}

function SmallTable({ title, rows }) {
  return (
    <div className="card pad" style={{ boxShadow: "var(--shadow-soft)" }}>
      <div className="row split" style={{ gap: 10 }}>
        <div className="card-title">{title}</div>
        <div className="pill">Top {Math.min(8, rows.length)}</div>
      </div>
      <div style={{ height: 10 }} />
      <div className="scroll" style={{ borderRadius: 12 }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
          <thead>
            <tr style={{ background: "rgba(248,250,252,0.94)" }}>
              {["Key", "A", "B", "Δ(B-A)"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "10px 10px",
                    fontSize: 12,
                    borderBottom: "1px solid rgba(15,23,42,0.10)",
                    color: "rgba(15,23,42,0.72)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((r, idx) => (
              <tr key={`${r.key}-${idx}`} style={{ background: idx % 2 ? "white" : "rgba(248,250,252,0.55)" }}>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                  {r.key}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                  {fmt(r.weightA)}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                  {fmt(r.weightB)}
                </td>
                <td
                  style={{
                    padding: "8px 10px",
                    fontSize: 12,
                    borderBottom: "1px solid rgba(15,23,42,0.06)",
                    fontWeight: 800,
                    color: r.delta > 0 ? "#9f1239" : r.delta < 0 ? "#1d4ed8" : "rgba(15,23,42,0.72)",
                  }}
                >
                  {fmt(r.delta)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="viz-note" style={{ marginTop: 8 }}>
        Δ(B-A) &gt; 0 means this stratum is stronger in B.
      </div>
    </div>
  );
}

export default function CompareView({ eventsA, eventsB, weightMode, filters, onApplyRecommendations, selectedCell, onSelectCell }) {
  const [tab, setTab] = React.useState("delta_table");
  const [netMode, setNetMode] = React.useState("gained_lost");
  const [netTop, setNetTop] = React.useState(200);
  const [netMinAbs, setNetMinAbs] = React.useState(0);
  const [netTopNodes, setNetTopNodes] = React.useState(0);

  const diff = React.useMemo(() => {
    const aggA = aggregatePairs(eventsA);
    const aggB = aggregatePairs(eventsB);
    const rows = computePairDiff(aggA, aggB, 1e-6);
    const matrix = buildDeltaMatrix(rows);
    return { rows, matrix };
  }, [eventsA, eventsB]);

  const strat = React.useMemo(() => {
    const ann = computeCategoryDiff(eventsA, eventsB, (e) => e.annotation || "NA");
    const flux = computeCategoryDiff(eventsA, eventsB, (e) => (e.fluxPass ?? "").toUpperCase() || "NA");
    return { ann, flux };
  }, [eventsA, eventsB]);

  const insights = React.useMemo(() => {
    return buildCompareInsights({
      eventsA,
      eventsB,
      diffRows: diff.rows,
      annDiffRows: strat.ann,
      fluxDiffRows: strat.flux,
      filters: filters ?? null,
      weightMode,
    });
  }, [diff.rows, eventsA, eventsB, filters, strat.ann, strat.flux, weightMode]);

  const counts = React.useMemo(() => {
    const gained = diff.rows.filter((r) => r.status === "gained").length;
    const lost = diff.rows.filter((r) => r.status === "lost").length;
    const shared = diff.rows.length - gained - lost;
    return { gained, lost, shared, total: diff.rows.length };
  }, [diff.rows]);

  return (
    <div>
      <div className="row" style={{ gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <SmallTable title="Annotation Δ summary" rows={strat.ann} />
        <SmallTable title="Flux_PASS Δ summary" rows={strat.flux} />
      </div>

      <div className="row split" style={{ marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
        <div className="pill">
          Δ(B-A) compare · weight mode:{" "}
          {weightMode === "commu_score" ? "Commu_Score" : weightMode === "norm_commu_score" ? "Norm_Commu_Score" : "-log10(FDR)"}
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="pill">total {counts.total}</span>
          <span className="pill">gained {counts.gained}</span>
          <span className="pill">lost {counts.lost}</span>
          <span className="pill">shared {counts.shared}</span>
        </div>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <button className={`btn small ${tab === "delta_table" ? "primary" : ""}`} onClick={() => setTab("delta_table")}>
          ΔTable
        </button>
        <button className={`btn small ${tab === "delta_matrix" ? "primary" : ""}`} onClick={() => setTab("delta_matrix")}>
          ΔMatrix
        </button>
        <button
          className={`btn small ${tab === "delta_network" ? "primary" : ""}`}
          onClick={() => setTab("delta_network")}
        >
          ΔNetwork
        </button>
        <button className={`btn small ${tab === "insights" ? "primary" : ""}`} onClick={() => setTab("insights")}>
          Insights
        </button>
      </div>

      {tab === "insights" ? (
        <InsightsPanel
          title="Compare auto summary / QC"
          fileLabel="compare-insights"
          insights={insights}
          onApplyRecommendations={onApplyRecommendations}
        />
      ) : tab === "delta_network" ? (
        <>
          <div className="row split" style={{ marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <select className="select" style={{ width: 180 }} value={netMode} onChange={(e) => setNetMode(e.target.value)}>
                <option value="gained_lost">Gained + Lost</option>
                <option value="gained">Gained only</option>
                <option value="lost">Lost only</option>
                <option value="all">All Δ≠0</option>
              </select>
              <select className="select" style={{ width: 160 }} value={String(netTop)} onChange={(e) => setNetTop(Number(e.target.value))}>
                <option value="50">Top 50</option>
                <option value="100">Top 100</option>
                <option value="200">Top 200</option>
                <option value="500">Top 500</option>
              </select>
              <select
                className="select"
                style={{ width: 170 }}
                value={String(netTopNodes)}
                onChange={(e) => setNetTopNodes(Number(e.target.value))}
                title="Show only the Top N most changed nodes (by Σ|Δ|)"
              >
                <option value="0">All nodes</option>
                <option value="20">Top 20 nodes</option>
                <option value="30">Top 30 nodes</option>
                <option value="40">Top 40 nodes</option>
                <option value="60">Top 60 nodes</option>
              </select>
              <input
                className="input"
                style={{ width: 180 }}
                inputMode="decimal"
                placeholder="min |Δ| (optional)"
                value={netMinAbs ? String(netMinAbs) : ""}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  const n = v ? Number(v) : 0;
                  setNetMinAbs(Number.isFinite(n) ? n : 0);
                }}
              />
            </div>
            <div className="pill">Tip: narrow the scope with left-side filters first</div>
          </div>
          <DeltaNetworkView
            diffRows={diff.rows}
            mode={netMode}
            minAbsDelta={netMinAbs}
            topEdges={netTop}
            topNodes={netTopNodes}
            selectedCell={selectedCell}
            onSelectCell={onSelectCell}
          />
        </>
      ) : tab === "delta_matrix" ? (
        <DeltaMatrixView matrix={diff.matrix} selectedCell={selectedCell} onSelectCell={onSelectCell} />
      ) : (
        <DeltaTableView rows={diff.rows} />
      )}
    </div>
  );
}
