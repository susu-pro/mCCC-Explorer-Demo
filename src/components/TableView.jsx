import React from "react";

export default function TableView({ events, selectedPair, onSelectPair }) {
  const [q, setQ] = React.useState("");
  const query = q.trim().toLowerCase();
  const hlRef = React.useRef(null);

  const rows = React.useMemo(() => {
    if (!query) return events;
    return events.filter((e) => {
      const text = [e.sender, e.receiver, e.metabolite ?? "", e.sensor ?? ""].join(" ").toLowerCase();
      return text.includes(query);
    });
  }, [events, query]);

  const isHl = React.useCallback(
    (e) => {
      const s = selectedPair?.sender;
      const r = selectedPair?.receiver;
      if (!s || !r) return false;
      return e.sender === s && e.receiver === r;
    },
    [selectedPair],
  );

  React.useEffect(() => {
    const el = hlRef.current;
    if (!el) return;
    // defer to allow table layout
    const t = setTimeout(() => {
      try {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch {
        el.scrollIntoView();
      }
    }, 50);
    return () => clearTimeout(t);
  }, [selectedPair?.sender, selectedPair?.receiver, query]);

  return (
    <div className="viz-view">
      <div className="row split" style={{ marginBottom: 10 }}>
        <div className="pill">Showing up to 2000 rows</div>
        <input
          className="input"
          style={{ width: 320 }}
          placeholder="Search sender/receiver/metabolite/sensor"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="scroll">
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 980 }}>
          <thead>
            <tr style={{ background: "rgba(248,250,252,0.94)" }}>
              {["Sender", "Receiver", "Metabolite", "Sensor", "FDR", "Score", "Weight"].map((h) => (
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
            {rows.slice(0, 2000).map((e, idx) => (
              <tr
                key={idx}
                ref={isHl(e) ? hlRef : null}
                className={isHl(e) ? "row-pair-hl" : ""}
                style={{ background: idx % 2 ? "white" : "rgba(248,250,252,0.55)", cursor: "pointer" }}
                title="Click to highlight and bind to Network/Matrix/DotPlot"
                onClick={() => (typeof onSelectPair === "function" ? onSelectPair({ sender: e.sender, receiver: e.receiver }) : null)}
              >
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                  {e.sender}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                  {e.receiver}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                  {e.metabolite ?? ""}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                  {e.sensor ?? ""}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                  {typeof e.fdr === "number" ? e.fdr : ""}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                  {typeof e.score === "number" ? e.score : ""}
                </td>
                <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                  {e.weight.toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
