import React from "react";

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function heatColor(t) {
  // white -> YlGnBu-ish
  const a = [255, 255, 255];
  const b = [30, 64, 175];
  const u = clamp01(t);
  const c = a.map((av, i) => Math.round(av + (b[i] - av) * u));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export default function MatrixView({ matrix, selectedCell, onSelectCell, weightMode, selectedPair, onSelectPair }) {
  const [sortBy, setSortBy] = React.useState("senderSum");

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
  const cellSize = 46;
  const isPair = (s, r) => selectedPair?.sender === s && selectedPair?.receiver === r;

  return (
    <div className="viz-view">
      <div className="row split" style={{ marginBottom: 10 }}>
        <div className="pill">heatmap: weight ({weightMode === "commu_score" ? "Commu_Score" : weightMode === "norm_commu_score" ? "Norm_Commu_Score" : "-log10(FDR)"})</div>
        <div className="row" style={{ gap: 8 }}>
          <span className="muted" style={{ fontSize: 12 }}>
            排序
          </span>
          <select className="select" style={{ width: 180 }} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="senderSum">按 sender 总强度</option>
            <option value="receiverSum">按 receiver 总强度</option>
            <option value="none">不排序</option>
          </select>
        </div>
      </div>

      <div className="scroll">
        <div
          className="grid-matrix"
          style={{
            gridTemplateColumns: `240px repeat(${receivers.length}, ${cellSize}px)`,
            minWidth: 240 + receivers.length * cellSize,
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
              <div style={{ maxWidth: cellSize - 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                const v = matrix.pairs.get(`${s}\t${r}`)?.weight ?? 0;
                const bg = v ? heatColor(clamp01(v / maxW)) : "white";
                const fg = v / maxW > 0.55 ? "rgba(255,255,255,0.92)" : "rgba(15,23,42,0.78)";
                return (
                  <div
                    key={`${s}\t${r}`}
                    className={`cell heat ${isPair(s, r) ? "selected-pair" : ""}`}
                    title={`${s} → ${r}\nweight=${v.toFixed(3)}`}
                    style={{ background: bg, color: fg, justifyContent: "center", cursor: v ? "pointer" : "default" }}
                    onClick={() => (v && typeof onSelectPair === "function" ? onSelectPair({ sender: s, receiver: r }) : null)}
                  >
                    {v ? v.toFixed(2) : ""}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
