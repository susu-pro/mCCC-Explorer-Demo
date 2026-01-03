import React from "react";
import { downloadTsv } from "../lib/report";

function fmt(n, d = 2) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  return n.toFixed(d);
}

export default function DeltaTableView({ rows }) {
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [top, setTop] = React.useState(200);

  const query = q.trim().toLowerCase();
  const filtered = React.useMemo(() => {
    let out = rows;
    if (status !== "all") out = out.filter((r) => r.status === status);
    if (query) out = out.filter((r) => `${r.sender} ${r.receiver}`.toLowerCase().includes(query));
    return out.slice(0, top);
  }, [rows, status, query, top]);

  return (
    <div>
        <div className="row split" style={{ marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input className="input" style={{ width: 260 }} placeholder="Search sender/receiver" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select" style={{ width: 160 }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="gained">Gained</option>
            <option value="lost">Lost</option>
            <option value="shared">Shared</option>
          </select>
          <select className="select" style={{ width: 160 }} value={String(top)} onChange={(e) => setTop(Number(e.target.value))}>
            <option value="50">Top 50</option>
            <option value="100">Top 100</option>
            <option value="200">Top 200</option>
            <option value="500">Top 500</option>
          </select>
        </div>
        <button
          className="btn small"
          onClick={() =>
            downloadTsv(
              "mccc_diff.tsv",
              filtered.map((r) => ({
                sender: r.sender,
                receiver: r.receiver,
                weightA: r.weightA,
                weightB: r.weightB,
                delta: r.delta,
                log2fc: r.log2fc,
                status: r.status,
                countA: r.countA,
                countB: r.countB,
              })),
              ["sender", "receiver", "weightA", "weightB", "delta", "log2fc", "status", "countA", "countB"],
            )
          }
        >
          Export Δ TSV
        </button>
      </div>

      <div className="scroll">
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 920 }}>
          <thead>
            <tr style={{ background: "rgba(248,250,252,0.94)" }}>
              {["Sender", "Receiver", "A", "B", "Δ(B-A)", "log2FC", "status"].map((h) => (
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
            {filtered.map((r, idx) => (
              <tr key={`${r.sender}-${r.receiver}-${idx}`} style={{ background: idx % 2 ? "white" : "rgba(248,250,252,0.55)" }}>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                  {r.sender}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                  {r.receiver}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                  {fmt(r.weightA)}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                  {fmt(r.weightB)}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)", fontWeight: 700 }}>
                  {fmt(r.delta)}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                  {fmt(r.log2fc)}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                  {r.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="viz-note" style={{ marginTop: 10 }}>
        Rows are sorted by |Δ| by default (Top edges is controlled by the left-side filter).
      </div>
    </div>
  );
}
