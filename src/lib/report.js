function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmt(n, digits = 3) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function countBy(arr, fn) {
  const m = new Map();
  for (const x of arr) {
    const k = fn(x);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function summarizeDataset(events) {
  const senders = new Set(events.map((e) => e.sender));
  const receivers = new Set(events.map((e) => e.receiver));
  const flux = countBy(events, (e) => (e.fluxPass ?? "").toUpperCase() || "NA");
  const ann = countBy(events, (e) => (e.annotation ?? "") || "NA");
  return {
    rows: events.length,
    senders: senders.size,
    receivers: receivers.size,
    flux,
    ann,
  };
}

function tableFromRows(rows, headers, rowFn) {
  const th = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const trs = rows.map((r) => `<tr>${rowFn(r).map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("");
  return `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

function listFromLines(lines) {
  if (!lines?.length) return "<div class='k'>—</div>";
  return `<ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`;
}

function renderQc(qc) {
  if (!qc?.length) return "<div class='k'>No significant issues detected</div>";
  const items = qc
    .map((q) => {
      const tone = q.level === "warn" ? "rgba(153,27,27,.96)" : "rgba(30,64,175,.96)";
      const bg = q.level === "warn" ? "rgba(220,38,38,.05)" : "rgba(37,99,235,.05)";
      const bd = q.level === "warn" ? "rgba(220,38,38,.18)" : "rgba(37,99,235,.18)";
      return `<div style="border:1px solid ${bd}; background:${bg}; border-radius: 12px; padding: 10px 12px; margin-top: 10px;">
        <div style="font-weight: 800; color:${tone}">[${escapeHtml(q.level)}] ${escapeHtml(q.title)}</div>
        <div style="margin-top: 6px; color: rgba(15,23,42,.86);">${escapeHtml(q.detail)}</div>
      </div>`;
    })
    .join("");
  return items;
}

function renderInsights(insights) {
  if (!insights) return "";
  const rec = insights.recommendations && Object.keys(insights.recommendations).length ? JSON.stringify(insights.recommendations, null, 2) : "";
  return `<div class="section card">
    <div class="k">Auto summary & QC</div>
    <div style="margin-top: 8px;">
      <div class="k" style="margin-bottom: 6px;">Summary</div>
      ${listFromLines(insights.summaryLines)}
    </div>
    <div style="margin-top: 12px;">
      <div class="k">QC</div>
      ${renderQc(insights.qc)}
    </div>
    ${
      rec
        ? `<div style="margin-top: 12px;">
        <div class="k">Recommendations</div>
        <pre>${escapeHtml(rec)}</pre>
      </div>`
        : ""
    }
  </div>`;
}

function renderRobustness(robustness) {
  if (!robustness) return "";
  const warnings = (robustness.warnings ?? []).map((w) => `<li>${escapeHtml(w)}</li>`).join("");
  const pairRows = (robustness.stability?.pairs ?? []).slice(0, 10);
  const metRows = (robustness.stability?.metabolites ?? []).slice(0, 10);

  const pairTable = tableFromRows(pairRows, ["Sender", "Receiver", "Support", "avgRank"], (r) => [
    r.sender,
    r.receiver,
    `${Math.round((r.support ?? 0) * 100)}%`,
    typeof r.avgRank === "number" && Number.isFinite(r.avgRank) ? r.avgRank.toFixed(1) : "—",
  ]);
  const metTable = tableFromRows(metRows, ["Metabolite", "Support", "avgRank"], (r) => [
    r.metabolite,
    `${Math.round((r.support ?? 0) * 100)}%`,
    typeof r.avgRank === "number" && Number.isFinite(r.avgRank) ? r.avgRank.toFixed(1) : "—",
  ]);

  return `<div class="section card">
    <div class="k">Robustness appendix</div>
    <div style="margin-top: 6px; color: rgba(15,23,42,.86); font-weight: 800;">
      variants=${escapeHtml(String(robustness.variants ?? "NA"))} · TopK=${escapeHtml(String(robustness.topK ?? "NA"))}
    </div>
    ${
      warnings
        ? `<div style="margin-top: 10px; border:1px solid rgba(220,38,38,.18); background: rgba(220,38,38,.05); border-radius: 12px; padding: 10px 12px;">
        <div style="font-weight: 800; color: rgba(153,27,27,.96);">Warnings</div>
        <ul style="margin: 6px 0 0; padding-left: 18px;">${warnings}</ul>
      </div>`
        : `<div style="margin-top: 10px; border:1px solid rgba(37,99,235,.18); background: rgba(37,99,235,.05); border-radius: 12px; padding: 10px 12px; color: rgba(30,64,175,.96);">No obvious instability detected (still recommended to cross-check with biological priors).</div>`
      }
    <div class="two section">
      <div class="card"><div class="k">Baseline top pairs stability</div>${pairTable}</div>
      <div class="card"><div class="k">Baseline top metabolites stability</div>${metTable}</div>
    </div>
  </div>`;
}

function renderNullControl(nullControl) {
  if (!nullControl) return "";
  const p = typeof nullControl.pValue === "number" ? nullControl.pValue : NaN;
  const verdict = Number.isFinite(p) && p < 0.05 ? "significant (non-random)" : "not significant (be cautious)";
  return `<div class="section card">
    <div class="k">Null control appendix</div>
    <pre>${escapeHtml(
      JSON.stringify(
        {
          metric: nullControl.metric,
          observed: nullControl.observed,
          mean: nullControl.mean,
          sd: nullControl.sd,
          n: nullControl.n,
          pValue: nullControl.pValue,
          verdict,
        },
        null,
        2,
      ),
    )}</pre>
    <div class="k">${escapeHtml(nullControl.note ?? "")}</div>
  </div>`;
}

export function generateSingleReport({ fileName, filters, weightMode, summary, topNodes, topLinks, insights, robustness, nullControl }) {
  const now = new Date().toISOString();
  const wm = weightMode === "commu_score" ? "Commu_Score" : weightMode === "norm_commu_score" ? "Norm_Commu_Score" : "-log10(FDR)";

  const fluxTable = tableFromRows(summary.flux.slice(0, 8), ["Flux_PASS", "Count"], ([k, v]) => [k, String(v)]);
  const annTable = tableFromRows(summary.ann.slice(0, 8), ["Annotation", "Count"], ([k, v]) => [k, String(v)]);

  const nodeTable = tableFromRows(topNodes.slice(0, 12), ["Cell", "TotalWeight"], (n) => [n.id, fmt(n.weight, 2)]);
  const linkTable = tableFromRows(topLinks.slice(0, 12), ["Sender", "Receiver", "Weight", "Count"], (l) => [
    l.source,
    l.target,
    fmt(l.weight, 2),
    String(l.count),
  ]);
  const insightsHtml = renderInsights(insights);
  const robustnessHtml = renderRobustness(robustness);
  const nullHtml = renderNullControl(nullControl);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MEBOCOST Report</title>
  <style>
    :root { --fg:#0f172a; --muted:#64748b; --bd:rgba(15,23,42,.14); --bg:#f6f8fc; --card:#fff; }
    body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; background:var(--bg); color:var(--fg); }
    .wrap { max-width: 980px; margin: 0 auto; padding: 20px; }
    h1 { font-size: 18px; margin: 0; }
    .sub { color: var(--muted); font-size: 12px; margin-top: 4px; }
    .grid { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
    .card { background: var(--card); border:1px solid var(--bd); border-radius: 14px; padding: 12px; }
    .k { color: var(--muted); font-size: 12px; }
    .v { font-weight: 700; margin-top: 4px; }
    pre { white-space: pre-wrap; font-size: 12px; color: var(--muted); margin: 0; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { text-align: left; border-bottom: 1px solid var(--bd); padding: 8px 8px; }
    th { color: rgba(15,23,42,.72); font-weight: 700; background: rgba(248,250,252,.9); }
    .section { margin-top: 14px; }
    .two { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>MEBOCOST mCCC Explorer Report (Single)</h1>
    <div class="sub">${escapeHtml(fileName ?? "Untitled")} · ${escapeHtml(now)} · weight=${escapeHtml(wm)}</div>

    <div class="grid">
      <div class="card"><div class="k">Rows</div><div class="v">${summary.rows}</div></div>
      <div class="card"><div class="k">Unique senders/receivers</div><div class="v">${summary.senders} / ${summary.receivers}</div></div>
    </div>

    <div class="section card">
      <div class="k">Filters (shareable)</div>
      <pre>${escapeHtml(JSON.stringify(filters, null, 2))}</pre>
    </div>

    ${insightsHtml}
    ${robustnessHtml}
    ${nullHtml}

    <div class="section two">
      <div class="card">
        <div class="k">Flux_PASS distribution</div>
        ${fluxTable}
      </div>
      <div class="card">
        <div class="k">Annotation distribution</div>
        ${annTable}
      </div>
    </div>

    <div class="section two">
      <div class="card">
        <div class="k">Top nodes (total weight)</div>
        ${nodeTable}
      </div>
      <div class="card">
        <div class="k">Top edges (aggregated)</div>
        ${linkTable}
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function generateCompareReport({ fileA, fileB, filters, weightMode, summaryA, summaryB, diffRows, insights }) {
  const now = new Date().toISOString();
  const wm = weightMode === "commu_score" ? "Commu_Score" : weightMode === "norm_commu_score" ? "Norm_Commu_Score" : "-log10(FDR)";
  const top = diffRows.slice(0, 20);
  const diffTable = tableFromRows(top, ["Sender", "Receiver", "A", "B", "Δ(B-A)", "log2FC", "status"], (r) => [
    r.sender,
    r.receiver,
    fmt(r.weightA, 2),
    fmt(r.weightB, 2),
    fmt(r.delta, 2),
    fmt(r.log2fc, 2),
    r.status,
  ]);

  const annTable = summaryA.annDiffRows
    ? tableFromRows(summaryA.annDiffRows.slice(0, 10), ["Annotation", "A", "B", "Δ(B-A)"], (r) => [
        r.key,
        fmt(r.weightA, 2),
        fmt(r.weightB, 2),
        fmt(r.delta, 2),
      ])
    : "";
  const fluxTable = summaryA.fluxDiffRows
    ? tableFromRows(summaryA.fluxDiffRows.slice(0, 10), ["Flux_PASS", "A", "B", "Δ(B-A)"], (r) => [
        r.key,
        fmt(r.weightA, 2),
        fmt(r.weightB, 2),
        fmt(r.delta, 2),
      ])
    : "";
  const insightsHtml = renderInsights(insights);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MEBOCOST Compare Report</title>
  <style>
    :root { --fg:#0f172a; --muted:#64748b; --bd:rgba(15,23,42,.14); --bg:#f6f8fc; --card:#fff; }
    body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; background:var(--bg); color:var(--fg); }
    .wrap { max-width: 980px; margin: 0 auto; padding: 20px; }
    h1 { font-size: 18px; margin: 0; }
    .sub { color: var(--muted); font-size: 12px; margin-top: 4px; }
    .grid { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; }
    .card { background: var(--card); border:1px solid var(--bd); border-radius: 14px; padding: 12px; }
    .k { color: var(--muted); font-size: 12px; }
    .v { font-weight: 700; margin-top: 4px; }
    pre { white-space: pre-wrap; font-size: 12px; color: var(--muted); margin: 0; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { text-align: left; border-bottom: 1px solid var(--bd); padding: 8px 8px; }
    th { color: rgba(15,23,42,.72); font-weight: 700; background: rgba(248,250,252,.9); }
    .section { margin-top: 14px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>MEBOCOST mCCC Explorer Report (Compare)</h1>
    <div class="sub">${escapeHtml(fileA ?? "A")} vs ${escapeHtml(fileB ?? "B")} · ${escapeHtml(now)} · weight=${escapeHtml(wm)}</div>

    <div class="grid">
      <div class="card">
        <div class="k">Dataset A</div>
        <div class="v">${summaryA.rows} rows · ${summaryA.senders}/${summaryA.receivers} send/recv</div>
      </div>
      <div class="card">
        <div class="k">Dataset B</div>
        <div class="v">${summaryB.rows} rows · ${summaryB.senders}/${summaryB.receivers} send/recv</div>
      </div>
    </div>

    <div class="section card">
      <div class="k">Filters (shareable)</div>
      <pre>${escapeHtml(JSON.stringify(filters, null, 2))}</pre>
    </div>

    ${insightsHtml}

    <div class="section card">
      <div class="k">Stratified Δ summary</div>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px;">
        <div>
          <div class="k">By Annotation</div>
          ${annTable || "<div class='k'>—</div>"}
        </div>
        <div>
          <div class="k">By Flux_PASS</div>
          ${fluxTable || "<div class='k'>—</div>"}
        </div>
      </div>
    </div>

    <div class="section card">
      <div class="k">Top Δ edges (by |Δ|)</div>
      ${diffTable}
    </div>
  </div>
</body>
</html>`;
}

export function downloadHtml(filename, html) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadText(filename, text, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename, obj) {
  downloadText(filename, JSON.stringify(obj, null, 2), "application/json;charset=utf-8");
}

export function downloadTsv(filename, rows, headers) {
  const lines = [headers.join("\t")];
  for (const r of rows) lines.push(headers.map((h) => String(r[h] ?? "")).join("\t"));
  const blob = new Blob([lines.join("\n")], { type: "text/tab-separated-values;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
