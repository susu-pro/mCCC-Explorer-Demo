import React from "react";
import CytoscapeComponent from "react-cytoscapejs";

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function mix(a, b, t) {
  const u = clamp01(t);
  const c = a.map((av, i) => Math.round(av + (b[i] - av) * u));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function diverge(u) {
  // u in [-1,1] -> blue/white/red
  const neg = [37, 99, 235];
  const pos = [225, 29, 72];
  const mid = [255, 255, 255];
  if (u < 0) return mix(mid, neg, -u);
  return mix(mid, pos, u);
}

export default function DeltaNetworkView({ diffRows, mode, minAbsDelta, topEdges, topNodes, selectedCell, onSelectCell }) {
  const cyRef = React.useRef(null);

  const filtered = React.useMemo(() => {
    let rows = diffRows.filter((r) => r.delta !== 0);
    if (mode === "gained") rows = rows.filter((r) => r.status === "gained");
    if (mode === "lost") rows = rows.filter((r) => r.status === "lost");
    if (mode === "gained_lost") rows = rows.filter((r) => r.status === "gained" || r.status === "lost");
    if (typeof minAbsDelta === "number" && Number.isFinite(minAbsDelta) && minAbsDelta > 0) {
      rows = rows.filter((r) => Math.abs(r.delta) >= minAbsDelta);
    }
    rows = [...rows].sort((a, b) => b.absDelta - a.absDelta);
    if (typeof topEdges === "number" && Number.isFinite(topEdges) && topEdges > 0) rows = rows.slice(0, topEdges);
    return rows;
  }, [diffRows, mode, minAbsDelta, topEdges]);

  const { nodes, edges, maxAbsDelta, maxNodeAbs } = React.useMemo(() => {
    const nodeAbs = new Map();
    const nodeSet = new Set();
    let maxAbs = 1;

    for (const r of filtered) {
      nodeSet.add(r.sender);
      nodeSet.add(r.receiver);
      nodeAbs.set(r.sender, (nodeAbs.get(r.sender) ?? 0) + Math.abs(r.delta));
      nodeAbs.set(r.receiver, (nodeAbs.get(r.receiver) ?? 0) + Math.abs(r.delta));
      maxAbs = Math.max(maxAbs, Math.abs(r.delta));
    }

    let ns = [...nodeSet].map((id) => ({ id, abs: nodeAbs.get(id) ?? 0 }));
    ns.sort((a, b) => b.abs - a.abs);

    let keep = null;
    if (typeof topNodes === "number" && Number.isFinite(topNodes) && topNodes > 0 && ns.length > topNodes) {
      keep = new Set(ns.slice(0, topNodes).map((n) => n.id));
      ns = ns.slice(0, topNodes);
    }

    let es = filtered.map((r) => ({
      id: `${r.sender}→${r.receiver}`,
      source: r.sender,
      target: r.receiver,
      delta: r.delta,
      absDelta: r.absDelta,
      status: r.status,
      weightA: r.weightA,
      weightB: r.weightB,
    }));

    if (keep) {
      es = es.filter((e) => keep.has(e.source) && keep.has(e.target));
      // recompute maxAbs if edges reduced
      maxAbs = Math.max(1, ...es.map((e) => Math.abs(e.delta)));
    }

    const maxNode = Math.max(1, ...ns.map((n) => n.abs));
    return { nodes: ns, edges: es, maxAbsDelta: maxAbs, maxNodeAbs: maxNode };
  }, [filtered]);

  const elements = React.useMemo(() => {
    const els = [];
    for (const n of nodes) {
      els.push({ data: { id: n.id, label: n.id, abs: n.abs } });
    }
    for (const e of edges) {
      els.push({ data: { ...e } });
    }
    return els;
  }, [nodes, edges]);

  const stylesheet = React.useMemo(
    () => [
      {
        selector: "node",
        style: {
          label: "data(label)",
          "font-size": 10,
          "text-wrap": "wrap",
          "text-max-width": 110,
          "text-valign": "bottom",
          "text-halign": "center",
          "text-margin-y": 8,
          color: "rgba(17,24,39,0.92)",
          "text-outline-width": 2,
          "text-outline-color": "rgba(255,255,255,0.92)",
          "background-color": "rgba(148,163,184,0.85)",
          width: (ele) => 18 + 28 * clamp01(Math.sqrt((ele.data("abs") ?? 0) / maxNodeAbs)),
          height: (ele) => 18 + 28 * clamp01(Math.sqrt((ele.data("abs") ?? 0) / maxNodeAbs)),
          "border-color": "rgba(17,24,39,0.18)",
          "border-width": 1,
        },
      },
      {
        selector: "edge",
        style: {
          width: (ele) => 1 + 7 * clamp01((ele.data("absDelta") ?? 0) / maxAbsDelta),
          "line-color": (ele) => diverge((ele.data("delta") ?? 0) / maxAbsDelta),
          "target-arrow-color": (ele) => diverge((ele.data("delta") ?? 0) / maxAbsDelta),
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          opacity: 0.7,
        },
      },
      {
        selector: "node:selected",
        style: {
          "border-width": 3,
          "border-color": "rgba(17,24,39,0.90)",
        },
      },
    ],
    [maxAbsDelta, maxNodeAbs],
  );

  React.useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (!selectedCell) {
      cy.nodes().unselect();
      return;
    }
    cy.nodes().unselect();
    const n = cy.getElementById(selectedCell);
    if (n) n.select();
  }, [selectedCell]);

  const exportPng = () => {
    const cy = cyRef.current;
    if (!cy) return;
    const png64 = cy.png({ full: true, bg: "#ffffff", scale: 2 });
    const a = document.createElement("a");
    a.href = png64;
    a.download = "mebocost-delta-network.png";
    a.click();
  };

  return (
    <div>
      <div className="row split" style={{ marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
        <div className="pill">edge color: Δ(B-A) (red ↑ / blue ↓) · edge width: |Δ| · node size: Σ|Δ|</div>
        <button className="btn small" onClick={exportPng}>
          Export PNG
        </button>
      </div>

      <div
        className="scroll"
        style={{
          background:
            "radial-gradient(900px 520px at 18% 0%, rgba(37,99,235,0.10), rgba(255,255,255,0) 60%), rgba(255,255,255,0.96)",
          height: 560,
        }}
      >
        <CytoscapeComponent
          elements={elements}
          cy={(cy) => {
            cyRef.current = cy;
            cy.on("tap", "node", (evt) => onSelectCell(evt.target.id()));
          }}
          style={{ width: "100%", height: "100%" }}
          layout={{
            name: "cose",
            animate: false,
            fit: true,
            padding: 40,
            randomize: false,
            nodeRepulsion: 9000,
            idealEdgeLength: 120,
          }}
          stylesheet={stylesheet}
        />
      </div>

      <div className="viz-note" style={{ marginTop: 10 }}>
        Showing {edges.length} delta edges. Consider filtering first (FDR / Flux_PASS / Top edges) to avoid an overly dense network.
      </div>
    </div>
  );
}
