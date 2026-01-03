import React from "react";

export default function FiltersPanel({ disabled, filters, setFilters, onReset }) {
  const updateNum = (key, raw) => {
    const s = raw.trim();
    if (!s) {
      setFilters({ ...filters, [key]: undefined });
      return;
    }
    const n = Number(s);
    setFilters({ ...filters, [key]: Number.isFinite(n) ? n : undefined });
  };

  return (
    <div style={{ opacity: disabled ? 0.55 : 1, pointerEvents: disabled ? "none" : "auto" }}>
      <div style={{ display: "grid", gap: 10 }}>
        <div className="field">
          <div className="label">FDR ≤</div>
          <input
            className="input"
            inputMode="decimal"
            placeholder="e.g., 0.05 (empty = no filter)"
            value={typeof filters.fdrMax === "number" ? String(filters.fdrMax) : ""}
            onChange={(e) => updateNum("fdrMax", e.target.value)}
          />
        </div>

        <div className="field">
          <div className="label">Top edges</div>
          <input
            className="input"
            inputMode="numeric"
            placeholder="e.g., 300 (empty = no limit)"
            value={typeof filters.topEdges === "number" ? String(filters.topEdges) : ""}
            onChange={(e) => updateNum("topEdges", e.target.value)}
          />
        </div>

        <div className="field">
          <div className="label">Metabolite</div>
          <input
            className="input"
            placeholder="Fuzzy match (e.g., glutamine)"
            value={filters.metaboliteQuery}
            onChange={(e) => setFilters({ ...filters, metaboliteQuery: e.target.value })}
          />
        </div>

        <div className="field">
          <div className="label">Sensor</div>
          <input
            className="input"
            placeholder="Fuzzy match (e.g., Slc1a5)"
            value={filters.sensorQuery}
            onChange={(e) => setFilters({ ...filters, sensorQuery: e.target.value })}
          />
        </div>

        <div className="field">
          <div className="label">Annotation</div>
          <input
            className="input"
            placeholder="e.g., Transporter / Receptor (empty = no filter)"
            value={filters.annotationQuery ?? ""}
            onChange={(e) => setFilters({ ...filters, annotationQuery: e.target.value })}
          />
        </div>

        <div className="field">
          <div className="label">Flux_PASS</div>
          <select
            className="select"
            value={filters.fluxPass ?? "all"}
            onChange={(e) => setFilters({ ...filters, fluxPass: e.target.value })}
          >
            <option value="all">All</option>
            <option value="pass">PASS only</option>
            <option value="unpass">UNPASS only</option>
          </select>
        </div>

        <label className="row" style={{ gap: 8, fontSize: 13, color: "var(--muted)" }}>
          <input
            type="checkbox"
            checked={filters.includeSelfLoops}
            onChange={(e) => setFilters({ ...filters, includeSelfLoops: e.target.checked })}
          />
          Include self-loops (sender == receiver)
        </label>

        {filters.focusCell ? (
          <div className="field">
            <div className="label">Focus mode</div>
            <select
              className="select"
              value={filters.focusMode ?? "any"}
              onChange={(e) => setFilters({ ...filters, focusMode: e.target.value })}
            >
              <option value="any">Any</option>
              <option value="outgoing">Outgoing</option>
              <option value="incoming">Incoming</option>
            </select>
          </div>
        ) : null}
      </div>

      <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
        <button className="btn small" onClick={onReset}>
          Reset
        </button>
      </div>
    </div>
  );
}
