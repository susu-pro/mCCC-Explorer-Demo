import React from "react";

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

const DENSITY_KEY = "mccc_explorer_dotplot_density_v1";

function loadDensity() {
  try {
    const v = localStorage.getItem(DENSITY_KEY);
    if (v === "fit" || v === "normal" || v === "compact") return v;
  } catch {
    // ignore
  }
  return "fit";
}

function saveDensity(v) {
  try {
    localStorage.setItem(DENSITY_KEY, v);
  } catch {
    // ignore
  }
}

function dotColor(t) {
  // light gray -> cyan/blue
  const a = [226, 232, 240];
  const b = [37, 99, 235];
  const u = clamp01(t);
  const c = a.map((av, i) => Math.round(av + (b[i] - av) * u));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export default function DotPlotView({ matrix, selectedCell, onSelectCell, weightMode, selectedPair, onSelectPair }) {
  const [sortBy, setSortBy] = React.useState("senderSum");
  const scrollRef = React.useRef(null);
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  const [density, setDensity] = React.useState(() => loadDensity());
  const [zoom, setZoom] = React.useState(1);
  const dragRef = React.useRef({ active: false, x: 0, y: 0, left: 0, top: 0, pid: null });
  const [spaceDown, setSpaceDown] = React.useState(false);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;

    const update = () => {
      const r = el.getBoundingClientRect();
      setBox({ w: Math.max(0, Math.round(r.width)), h: Math.max(0, Math.round(r.height)) });
    };

    update();

    if (typeof ResizeObserver !== "undefined") {
      const obs = new ResizeObserver(() => update());
      obs.observe(el);
      return () => obs.disconnect();
    }

    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);

  React.useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code !== "Space") return;
      const tag = String(e.target?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      setSpaceDown(true);
    };
    const onKeyUp = (e) => {
      if (e.code !== "Space") return;
      setSpaceDown(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const setDensityAndPersist = (v) => {
    setDensity(v);
    saveDensity(v);
  };

  const clampZoom = (v) => clamp(v, 0.6, 2.4);

  const zoomBy = (delta, anchor) => {
    const el = scrollRef.current;
    if (!el) {
      setZoom((z) => clampZoom(z + delta));
      return;
    }
    const before = clampZoom(zoom);
    const after = clampZoom(before + delta);
    if (after === before) return;

    const rect = el.getBoundingClientRect();
    const ax = typeof anchor?.x === "number" ? anchor.x : rect.width / 2;
    const ay = typeof anchor?.y === "number" ? anchor.y : rect.height / 2;
    const x = el.scrollLeft + ax;
    const y = el.scrollTop + ay;

    const ratio = after / before;
    setZoom(after);

    requestAnimationFrame(() => {
      el.scrollLeft = x * ratio - ax;
      el.scrollTop = y * ratio - ay;
    });
  };

  const resetView = () => {
    const el = scrollRef.current;
    setZoom(1);
    if (el) {
      el.scrollLeft = 0;
      el.scrollTop = 0;
    }
  };

  const onWheel = (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.12 : 0.12;
    zoomBy(delta, { x: e.clientX - e.currentTarget.getBoundingClientRect().left, y: e.clientY - e.currentTarget.getBoundingClientRect().top });
  };

  const onPointerDown = (e) => {
    if (!spaceDown) return;
    if (e.button !== 0) return;
    const el = scrollRef.current;
    if (!el) return;
    dragRef.current = { active: true, x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, pid: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const el = scrollRef.current;
    const d = dragRef.current;
    if (!el || !d.active) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    el.scrollLeft = d.left - dx;
    el.scrollTop = d.top - dy;
  };

  const onPointerUp = (e) => {
    const d = dragRef.current;
    if (d.active && d.pid === e.pointerId) dragRef.current.active = false;
  };

  const senderSum = new Map();
  const receiverSum = new Map();
  for (const s of matrix.senders) senderSum.set(s, 0);
  for (const r of matrix.receivers) receiverSum.set(r, 0);
  for (const [k, v] of matrix.pairs.entries()) {
    const [s, r] = k.split("\t");
    senderSum.set(s, (senderSum.get(s) ?? 0) + v.weight);
    receiverSum.set(r, (receiverSum.get(r) ?? 0) + v.weight);
  }

  const senders = [...matrix.senders];
  const receivers = [...matrix.receivers];
  if (sortBy === "senderSum") senders.sort((a, b) => (senderSum.get(b) ?? 0) - (senderSum.get(a) ?? 0));
  if (sortBy === "receiverSum") receivers.sort((a, b) => (receiverSum.get(b) ?? 0) - (receiverSum.get(a) ?? 0));

  const maxW = Math.max(1, ...[...matrix.pairs.values()].map((x) => x.weight));
  const maxC = Math.max(1, ...[...matrix.pairs.values()].map((x) => x.count));
  const containerW = box.w || (typeof window !== "undefined" ? window.innerWidth : 1200);
  const containerH = box.h || 640;
  const densityCfg =
    density === "compact"
      ? { labelRatio: 0.20, cellMin: 22, rowMin: 22, rowMax: 88 }
      : density === "normal"
        ? { labelRatio: 0.26, cellMin: 32, rowMin: 28, rowMax: 120 }
        : { labelRatio: 0.24, cellMin: 28, rowMin: 26, rowMax: 120 };

  const z = clampZoom(zoom);
  const labelW = clamp(Math.round(containerW * densityCfg.labelRatio), 140, 280);
  const cellMin = Math.max(18, Math.round((containerW < 720 ? densityCfg.cellMin - 2 : densityCfg.cellMin) * z));
  const cellW = clamp(Math.floor((containerW - labelW) / Math.max(1, receivers.length)), cellMin, 220);
  const rowCount = senders.length + 1;
  const rowH = clamp(Math.floor((containerH / Math.max(1, rowCount)) * z), densityCfg.rowMin, densityCfg.rowMax);
  const minGridW = labelW + receivers.length * cellMin;

  const dotSize = (count) => {
    const t = clamp01(Math.sqrt(count / maxC));
    const maxDot = Math.max(10, Math.min(42, Math.floor(Math.min(cellW, rowH) * 0.65)));
    const minDot = Math.max(3, Math.min(10, Math.floor(maxDot * 0.28)));
    return Math.round(minDot + (maxDot - minDot) * t);
  };
  const isPair = (s, r) => selectedPair?.sender === s && selectedPair?.receiver === r;

  return (
    <div className="viz-view">
      <div className="row split" style={{ marginBottom: 10 }}>
        <div className="pill">
          dot size: count · dot color: weight ({weightMode === "commu_score" ? "Commu_Score" : weightMode === "norm_commu_score" ? "Norm_Commu_Score" : "-log10(FDR)"})
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <select
            className="select"
            style={{ width: 160 }}
            value={density}
            onChange={(e) => setDensityAndPersist(e.target.value)}
            title="Density: controls minimum cell size and row height"
          >
            <option value="fit">Density: Fit</option>
            <option value="normal">Density: Normal</option>
            <option value="compact">Density: Compact</option>
          </select>

          <button className="btn small" type="button" onClick={() => zoomBy(-0.12)} title="Zoom out (Ctrl/⌘ + wheel)">
            −
          </button>
          <span className="pill" title="Zoom level">
            {Math.round(z * 100)}%
          </span>
          <button className="btn small" type="button" onClick={() => zoomBy(0.12)} title="Zoom in (Ctrl/⌘ + wheel)">
            +
          </button>
          <button className="btn small" type="button" onClick={resetView} title="Reset zoom and viewport">
            Reset
          </button>

          <span className="pill" title="Hold Space and drag to pan">
            {spaceDown ? "Pan: ON" : "Pan: hold Space"}
          </span>

          <span className="muted" style={{ fontSize: 12 }}>
            Sort
          </span>
          <select className="select" style={{ width: 180 }} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="senderSum">By sender total weight</option>
            <option value="receiverSum">By receiver total weight</option>
            <option value="none">No sorting</option>
          </select>
        </div>
      </div>

      <div
        className="scroll chart-scroll"
        ref={scrollRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ cursor: spaceDown ? "grab" : undefined }}
      >
        <div
          className="grid-matrix"
          style={{
            width: "100%",
            minWidth: minGridW,
            minHeight: "100%",
            gridAutoRows: `${rowH}px`,
            gridTemplateColumns: `${labelW}px repeat(${receivers.length}, minmax(${cellMin}px, 1fr))`,
          }}
        >
          <div className="cell head sticky-top sticky-left">Sender \\ Receiver</div>
          {receivers.map((r) => (
            <div
              key={r}
              className={`cell head sticky-top ${r === selectedCell ? "selected" : ""}`}
              title={r}
              style={{ justifyContent: "center", cursor: "pointer" }}
              onClick={() => onSelectCell(r)}
            >
              <div style={{ maxWidth: cellW - 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r}
              </div>
            </div>
          ))}

          {senders.map((s) => (
            <React.Fragment key={s}>
              <div
                className="cell sticky-left label"
                title={s}
                style={{
                  fontWeight: s === selectedCell ? 800 : 650,
                  color: s === selectedCell ? "var(--primary-strong)" : "var(--text)",
                }}
                onClick={() => onSelectCell(s)}
              >
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s}</div>
              </div>

              {receivers.map((r) => {
                const v = matrix.pairs.get(`${s}\t${r}`) ?? { weight: 0, count: 0 };
                const size = dotSize(v.count);
                const color = v.weight ? dotColor(v.weight / maxW) : "transparent";
                const outline = v.weight ? "rgba(37,99,235,0.22)" : "transparent";
                return (
                  <div
                    key={`${s}\t${r}`}
                    className={`cell heat ${isPair(s, r) ? "selected-pair" : ""}`}
                    title={`${s} → ${r}\ncount=${v.count}\nweight=${v.weight.toFixed(3)}`}
                    style={{ justifyContent: "center", cursor: v.count ? "pointer" : "default" }}
                    onClick={() => (v.count && typeof onSelectPair === "function" ? onSelectPair({ sender: s, receiver: r }) : null)}
                  >
                    {v.count ? (
                      <div
                        style={{
                          width: size,
                          height: size,
                          borderRadius: 999,
                          background: color,
                          boxShadow: `0 0 0 4px ${outline}`,
                        }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="viz-note" style={{ marginTop: 10 }}>
        This view matches the MEBOCOST paper “dot plot” style: dot size ≈ number of significant mCCC rows; dot color ≈ total aggregated weight.
      </div>
    </div>
  );
}
