import React from "react";
import CytoscapeComponent from "react-cytoscapejs";

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function edgeColor(t) {
  // print-friendly blue ramp
  const a = [191, 219, 254];
  const b = [37, 99, 235];
  const u = clamp01(t);
  const c = a.map((av, i) => Math.round(av + (b[i] - av) * u));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export default function NetworkView({ nodes, links, selectedCell, onSelectCell, weightMode, selectedPair, onSelectPair }) {
  const cyRef = React.useRef(null);
  const weightLabel =
    weightMode === "commu_score" ? "Commu_Score" : weightMode === "norm_commu_score" ? "Norm_Commu_Score" : "-log10(FDR)";

  const maxNode = Math.max(1, ...nodes.map((n) => n.weight));
  const maxEdge = Math.max(1, ...links.map((l) => l.weight));

  const elements = React.useMemo(() => {
    const els = [];
    for (const n of nodes) {
      els.push({
        data: {
          id: n.id,
          label: n.id,
          weight: n.weight,
        },
      });
    }
    for (const l of links) {
      els.push({
        data: {
          id: `${l.source}→${l.target}`,
          source: l.source,
          target: l.target,
          weight: l.weight,
          count: l.count,
        },
      });
    }
    return els;
  }, [nodes, links]);

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
          "background-color": (ele) => {
            const w = ele.data("weight") ?? 0;
            const t = clamp01(w / maxNode);
            return edgeColor(0.12 + 0.78 * t);
          },
          width: (ele) => {
            const w = ele.data("weight") ?? 0;
            return 18 + 26 * clamp01(Math.sqrt(w / maxNode));
          },
          height: (ele) => {
            const w = ele.data("weight") ?? 0;
            return 18 + 26 * clamp01(Math.sqrt(w / maxNode));
          },
          "border-color": "rgba(17,24,39,0.18)",
          "border-width": 1,
        },
      },
      {
        selector: "edge",
        style: {
          width: (ele) => 1 + 7 * clamp01((ele.data("weight") ?? 0) / maxEdge),
          "line-color": (ele) => edgeColor(clamp01((ele.data("weight") ?? 0) / maxEdge)),
          "target-arrow-color": (ele) => edgeColor(clamp01((ele.data("weight") ?? 0) / maxEdge)),
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          opacity: 0.65,
        },
      },
      {
        selector: "node:selected",
        style: {
          "border-width": 3,
          "border-color": "rgba(17,24,39,0.90)",
        },
      },
      {
        selector: "edge:selected",
        style: {
          opacity: 0.95,
          width: (ele) => 2 + 9 * clamp01((ele.data("weight") ?? 0) / maxEdge),
          "line-color": "rgba(30,64,175,0.96)",
          "target-arrow-color": "rgba(30,64,175,0.96)",
        },
      },
    ],
    [maxNode, maxEdge],
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

  React.useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const s = selectedPair?.sender;
    const r = selectedPair?.receiver;
    cy.edges().unselect();
    if (!s || !r) return;
    const id = `${s}→${r}`;
    const e = cy.getElementById(id);
    if (e) e.select();
  }, [selectedPair?.sender, selectedPair?.receiver]);

  const exportPng = () => {
    const cy = cyRef.current;
    if (!cy) return;
    const png64 = cy.png({ full: true, bg: "#ffffff", scale: 2 });
    const a = document.createElement("a");
    a.href = png64;
    a.download = "mebocost-network.png";
    a.click();
  };

  return (
    <div className="viz-view">
      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 10 }}>
        <button className="btn small" onClick={exportPng}>
          导出 PNG
        </button>
      </div>

      <div
        className="scroll"
        style={{
          background:
            "radial-gradient(900px 520px at 18% 0%, rgba(37,99,235,0.10), rgba(255,255,255,0) 60%), rgba(255,255,255,0.96)",
        }}
      >
        <CytoscapeComponent
          elements={elements}
          cy={(cy) => {
            cyRef.current = cy;
            cy.on("tap", "node", (evt) => (typeof onSelectCell === "function" ? onSelectCell(evt.target.id()) : null));
            cy.on("tap", "edge", (evt) => {
              const data = evt.target.data();
              if (typeof onSelectPair === "function") onSelectPair({ sender: data.source, receiver: data.target });
            });
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
        边宽/颜色按权重（当前：{weightLabel}）；点击节点在右侧查看 Top partners/metabolites/sensors，并可一键聚焦子网络。
      </div>
    </div>
  );
}
