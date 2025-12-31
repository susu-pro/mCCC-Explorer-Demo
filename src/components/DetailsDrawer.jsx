import React from "react";

function fmt(x) {
  if (typeof x !== "number" || !Number.isFinite(x)) return "—";
  return x >= 1000 ? x.toFixed(0) : x.toFixed(2);
}

export default function DetailsDrawer({
  open,
  selectedCell,
  details,
  focusCell,
  focusMode,
  onClose,
  onApplyFocus,
  onClearFocus,
}) {
  const [tab, setTab] = React.useState("partners");
  React.useEffect(() => setTab("partners"), [selectedCell]);

  if (!open || !selectedCell || !details) return null;

  const isFocused = focusCell === selectedCell;

  return (
    <div className="drawer" role="dialog" aria-label="cell details">
      <div className="drawer-inner">
        <div className="drawer-head">
          <div>
            <div className="card-title">{selectedCell}</div>
            <div className="card-sub">点击下方按钮可“一键聚焦该 cell”的子网络。</div>
          </div>
          <button className="btn small" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="drawer-body">
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn small" onClick={() => onApplyFocus(selectedCell, "any")}>
              聚焦 Any
            </button>
            <button className="btn small" onClick={() => onApplyFocus(selectedCell, "outgoing")}>
              聚焦 Out
            </button>
            <button className="btn small" onClick={() => onApplyFocus(selectedCell, "incoming")}>
              聚焦 In
            </button>
            {isFocused ? (
              <button className="btn danger small" onClick={onClearFocus}>
                清除聚焦
              </button>
            ) : null}
            {isFocused ? <span className="pill">当前已聚焦（{focusMode ?? "any"}）</span> : null}
          </div>

          <div className="metric">
            <div>
              <div className="k">Total weight</div>
              <div className="v">{fmt(details.totalWeight)}</div>
            </div>
            <div>
              <div className="k">Total edges</div>
              <div className="v">{(details.inCount ?? 0) + (details.outCount ?? 0)}</div>
            </div>
            <div>
              <div className="k">Outgoing weight</div>
              <div className="v">{fmt(details.outWeight)}</div>
            </div>
            <div>
              <div className="k">Incoming weight</div>
              <div className="v">{fmt(details.inWeight)}</div>
            </div>
          </div>

          <div className="divider" />

          <div className="row" style={{ gap: 8 }}>
            {[
              ["partners", "Partners"],
              ["metabolites", "Metabolites"],
              ["sensors", "Sensors"],
            ].map(([k, label]) => (
              <button key={k} className={`btn small ${tab === k ? "primary" : ""}`} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </div>

          <div style={{ height: 8 }} />

          {tab === "partners" ? (
            <>
              <div className="list">
                <h4>Top outgoing partners</h4>
                {details.extra?.outgoingPartners?.length ? (
                  details.extra.outgoingPartners.map((p) => (
                    <div key={`out-${p.key}`} className="item">
                      <div className="name">{p.key}</div>
                      <div className="meta">
                        w={fmt(p.weight)} · n={p.count}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                    —
                  </div>
                )}
              </div>

              <div className="list">
                <h4>Top incoming partners</h4>
                {details.extra?.incomingPartners?.length ? (
                  details.extra.incomingPartners.map((p) => (
                    <div key={`in-${p.key}`} className="item">
                      <div className="name">{p.key}</div>
                      <div className="meta">
                        w={fmt(p.weight)} · n={p.count}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                    —
                  </div>
                )}
              </div>
            </>
          ) : tab === "metabolites" ? (
            <div className="list">
              <h4>Top metabolites (involved)</h4>
              {details.extra?.metabolites?.length ? (
                details.extra.metabolites.map((p) => (
                  <div key={`m-${p.key}`} className="item">
                    <div className="name">{p.key}</div>
                    <div className="meta">
                      w={fmt(p.weight)} · n={p.count}
                    </div>
                  </div>
                ))
              ) : (
                <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  —
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="list">
                <h4>Top sensors (involved)</h4>
                {details.extra?.sensors?.length ? (
                  details.extra.sensors.map((p) => (
                    <div key={`s-${p.key}`} className="item">
                      <div className="name">{p.key}</div>
                      <div className="meta">
                        w={fmt(p.weight)} · n={p.count}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                    —
                  </div>
                )}
              </div>

              <div className="list">
                <h4>Top annotations</h4>
                {details.extra?.annotations?.length ? (
                  details.extra.annotations.map((p) => (
                    <div key={`a-${p.key}`} className="item">
                      <div className="name">{p.key}</div>
                      <div className="meta">
                        w={fmt(p.weight)} · n={p.count}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                    —
                  </div>
                )}
              </div>

              <div className="list">
                <h4>Flux_PASS composition</h4>
                {details.extra?.fluxPass?.length ? (
                  details.extra.fluxPass.map((p) => (
                    <div key={`f-${p.key}`} className="item">
                      <div className="name">{p.key}</div>
                      <div className="meta">
                        w={fmt(p.weight)} · n={p.count}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                    —
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
