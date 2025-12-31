import React from "react";

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function divergeColor(t) {
  // t in [-1,1]; negative blue, positive red
  const u = Math.max(-1, Math.min(1, t));
  const neg = [37, 99, 235]; // blue
  const pos = [225, 29, 72]; // rose
  const mid = [255, 255, 255];
  const mix = (a, b, p) => a.map((av, i) => Math.round(av + (b[i] - av) * p));
  if (u < 0) {
    const c = mix(mid, neg, clamp01(-u));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  const c = mix(mid, pos, clamp01(u));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export default function DeltaMatrixView({ matrix, selectedCell, onSelectCell }) {
  const [sortBy, setSortBy] = React.useState("absDeltaSum");

  const senderSum = new Map();
  const receiverSum = new Map();
  for (const s of matrix.senders) senderSum.set(s, 0);
  for (const r of matrix.receivers) receiverSum.set(r, 0);
  for (const r of matrix.pairs.values()) {
    senderSum.set(r.sender, (senderSum.get(r.sender) ?? 0) + Math.abs(r.delta));
    receiverSum.set(r.receiver, (receiverSum.get(r.receiver) ?? 0) + Math.abs(r.delta));
  }

  const senders = [...matrix.senders];
  const receivers = [...matrix.receivers];
  if (sortBy === "senderAbs") senders.sort((a, b) => (senderSum.get(b) ?? 0) - (senderSum.get(a) ?? 0));
  if (sortBy === "receiverAbs") receivers.sort((a, b) => (receiverSum.get(b) ?? 0) - (receiverSum.get(a) ?? 0));

  const maxAbs = Math.max(1, ...[...matrix.pairs.values()].map((r) => Math.abs(r.delta)));
  const cellSize = 46;

  return (
    <div>
      <div className="row split" style={{ marginBottom: 10 }}>
        <div className="pill">heatmap: Δ(B-A)</div>
        <div className="row" style={{ gap: 8 }}>
          <span className="muted" style={{ fontSize: 12 }}>
            排序
          </span>
          <select className="select" style={{ width: 220 }} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="senderAbs">按 sender |Δ| 总和</option>
            <option value="receiverAbs">按 receiver |Δ| 总和</option>
            <option value="absDeltaSum">不排序</option>
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
              className="cell head sticky-top"
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
                const row = matrix.pairs.get(`${s}\t${r}`);
                const delta = row?.delta ?? 0;
                const t = delta / maxAbs;
                const bg = delta ? divergeColor(t) : "white";
                const fg = Math.abs(t) > 0.55 ? "rgba(255,255,255,0.92)" : "rgba(15,23,42,0.78)";
                return (
                  <div
                    key={`${s}\t${r}`}
                    className="cell heat"
                    title={`${s} → ${r}\nΔ=${delta.toFixed(3)}\nA=${(row?.weightA ?? 0).toFixed(3)} B=${(row?.weightB ?? 0).toFixed(3)}`}
                    style={{ background: bg, color: fg, justifyContent: "center" }}
                  >
                    {delta ? delta.toFixed(2) : ""}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="viz-note" style={{ marginTop: 10 }}>
        红=在 B 增强，蓝=在 B 减弱（相对 A）。
      </div>
    </div>
  );
}

