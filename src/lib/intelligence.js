function toNum(v) {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : undefined;
}

function topAgg(events, keyFn, n = 8) {
  const m = new Map();
  for (const e of events) {
    const k = (keyFn(e) ?? "").toString().trim();
    if (!k) continue;
    const prev = m.get(k);
    if (prev) {
      prev.weight += e.weight;
      prev.count += 1;
    } else {
      m.set(k, { key: k, weight: e.weight, count: 1 });
    }
  }
  return [...m.values()].sort((a, b) => b.weight - a.weight).slice(0, n);
}

function aggByCell(events) {
  const m = new Map();
  const ensure = (id) => {
    const prev = m.get(id);
    if (prev) return prev;
    const row = { id, inWeight: 0, outWeight: 0, inCount: 0, outCount: 0, totalWeight: 0 };
    m.set(id, row);
    return row;
  };
  for (const e of events) {
    const s = ensure(e.sender);
    const r = ensure(e.receiver);
    s.outWeight += e.weight;
    s.outCount += 1;
    s.totalWeight += e.weight;
    r.inWeight += e.weight;
    r.inCount += 1;
    r.totalWeight += e.weight;
  }
  const rows = [...m.values()];
  return {
    topSenders: [...rows].sort((a, b) => b.outWeight - a.outWeight).slice(0, 8),
    topReceivers: [...rows].sort((a, b) => b.inWeight - a.inWeight).slice(0, 8),
    topCells: [...rows].sort((a, b) => b.totalWeight - a.totalWeight).slice(0, 8),
    cellCount: rows.length,
  };
}

function aggPairs(events) {
  const m = new Map();
  for (const e of events) {
    const k = `${e.sender}\t${e.receiver}`;
    const prev = m.get(k);
    if (prev) {
      prev.weight += e.weight;
      prev.count += 1;
    } else {
      m.set(k, { sender: e.sender, receiver: e.receiver, weight: e.weight, count: 1 });
    }
  }
  return [...m.values()].sort((a, b) => b.weight - a.weight);
}

function fluxStats(events) {
  const m = new Map();
  for (const e of events) {
    const k = (e.fluxPass ?? "").toUpperCase() || "NA";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  const rows = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }));
  const pass = m.get("PASS") ?? 0;
  return { rows, passRate: events.length ? pass / events.length : 0, hasAny: rows.some((r) => r.key !== "NA") };
}

function annotationStats(events) {
  const m = new Map();
  for (const e of events) {
    const k = (e.annotation ?? "").toString().trim() || "NA";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  const rows = [...m.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }));
  const top = rows[0]?.count ?? 0;
  return { rows, topShare: events.length ? top / events.length : 0, hasAny: rows.some((r) => r.key !== "NA") };
}

function fdrStats(events, mapping) {
  const fdrCol = mapping?.fdr;
  if (!fdrCol) return { has: false, zeroCount: 0, zeroRate: 0, min: undefined, max: undefined };
  let zeroCount = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const e of events) {
    const v = toNum(e.raw?.[fdrCol]);
    if (typeof v !== "number") continue;
    if (v === 0) zeroCount += 1;
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  const n = events.length || 1;
  return { has: true, zeroCount, zeroRate: zeroCount / n, min: Number.isFinite(min) ? min : undefined, max: Number.isFinite(max) ? max : undefined };
}

function densityStats(events) {
  const senders = new Set(events.map((e) => e.sender));
  const receivers = new Set(events.map((e) => e.receiver));
  const pairs = new Set(events.map((e) => `${e.sender}\t${e.receiver}`));
  const denom = Math.max(1, senders.size * receivers.size);
  return {
    rows: events.length,
    senders: senders.size,
    receivers: receivers.size,
    pairs: pairs.size,
    density: pairs.size / denom,
  };
}

export function buildSingleInsights({ events, mapping, filters, weightMode }) {
  const qc = [];
  const rec = {};
  const stats = {
    density: densityStats(events),
    flux: fluxStats(events),
    ann: annotationStats(events),
    fdr: fdrStats(events, mapping),
  };

  const weightLabel =
    weightMode === "commu_score" ? "Commu_Score" : weightMode === "norm_commu_score" ? "Norm_Commu_Score" : "-log10(FDR)";

  if (stats.fdr.has && stats.fdr.zeroRate > 0.3) {
    qc.push({
      level: "warn",
      title: "High FDR=0 rate",
      detail: `Under the current filters, FDR=0 accounts for ${(stats.fdr.zeroRate * 100).toFixed(1)}% (min=${stats.fdr.min ?? "NA"}). Consider increasing MEBOCOST n_shuffle (e.g., 5000/10000) or capping -log10(FDR) in reporting.`,
    });
  }
  if (stats.flux.hasAny && stats.flux.passRate < 0.35) {
    qc.push({
      level: "info",
      title: "Low PASS rate",
      detail: `Flux_PASS=PASS rate is ${(stats.flux.passRate * 100).toFixed(1)}%. Consider focusing on PASS-only first, and using UNPASS as a sensitivity check.`,
    });
  }
  if (stats.ann.hasAny && stats.ann.topShare > 0.8) {
    qc.push({
      level: "info",
      title: "Skewed annotation distribution",
      detail: `A single Annotation accounts for ${(stats.ann.topShare * 100).toFixed(1)}%. Consider stating that results are largely driven by ${stats.ann.rows[0]?.key}, or reviewing other annotation types separately.`,
    });
  }
  if (stats.density.senders > 120 || stats.density.receivers > 120) {
    qc.push({
      level: "info",
      title: "Many nodes: consider denoising",
      detail: `There are many senders/receivers (${stats.density.senders}/${stats.density.receivers}). Consider lowering Top edges or focusing on key cell groups.`,
    });
  }

  // Recommendations (minimal + actionable)
  if (mapping?.fluxPass) rec.fluxPass = "pass";
  if (typeof filters?.fdrMax === "number") rec.fdrMax = filters.fdrMax;
  rec.topEdges = stats.density.pairs > 800 ? 300 : 500;

  const cells = aggByCell(events);
  const topMet = topAgg(events, (e) => e.metabolite, 8);
  const topSens = topAgg(events, (e) => e.sensor, 8);
  const topAnn = topAgg(events, (e) => e.annotation, 6);
  const topEdges = aggPairs(events).slice(0, 8);

  const summaryLines = [
    `Current view: rows=${stats.density.rows}, pairs=${stats.density.pairs}, senders=${stats.density.senders}, receivers=${stats.density.receivers}, density=${stats.density.density.toFixed(3)}`,
    `Weight mode: ${weightLabel}`,
    stats.flux.hasAny ? `Flux_PASS: PASS ${(stats.flux.passRate * 100).toFixed(1)}%` : "Flux_PASS: NA (not provided)",
    stats.fdr.has
      ? `FDR: min=${stats.fdr.min ?? "NA"}, max=${stats.fdr.max ?? "NA"}, FDR=0 ${(stats.fdr.zeroRate * 100).toFixed(1)}%`
      : "FDR: NA (not mapped)",
  ];

  return {
    kind: "single",
    weightMode,
    summaryLines,
    qc,
    recommendations: rec,
    top: { ...cells, topMet, topSens, topAnn, topEdges },
    stats,
  };
}

export function buildCompareInsights({ eventsA, eventsB, diffRows, annDiffRows, fluxDiffRows, filters, weightMode }) {
  const qc = [];
  const rec = {};
  const densityA = densityStats(eventsA);
  const densityB = densityStats(eventsB);
  const gained = diffRows.filter((r) => r.status === "gained").length;
  const lost = diffRows.filter((r) => r.status === "lost").length;
  const shared = diffRows.length - gained - lost;
  const total = diffRows.length || 1;

  const weightLabel =
    weightMode === "commu_score" ? "Commu_Score" : weightMode === "norm_commu_score" ? "Norm_Commu_Score" : "-log10(FDR)";

  if (densityA.rows < 50 || densityB.rows < 50) {
    qc.push({
      level: "warn",
      title: "Small sample size for comparison",
      detail: `Rows are low on at least one side (A=${densityA.rows}, B=${densityB.rows}); the delta network may be unstable. Consider relaxing filters or verifying that you did not import a pre-filtered TSV.`,
    });
  }

  if ((gained + lost) / total > 0.85 && total >= 100) {
    qc.push({
      level: "info",
      title: "Few shared edges between A/B",
      detail: `Under the current filters, shared=${shared} (${((shared / total) * 100).toFixed(1)}%). This is common when A/B come from different projects or use different filtering. If they should be comparable, verify column mapping, FDR/Score definitions, and whether A/B were pre-filtered differently.`,
    });
  }

  const fluxA = fluxStats(eventsA);
  const fluxB = fluxStats(eventsB);
  const hasFlux = fluxA.hasAny || fluxB.hasAny;
  if (hasFlux && Math.abs(fluxA.passRate - fluxB.passRate) > 0.25) {
    qc.push({
      level: "info",
      title: "Large difference in Flux_PASS quality",
      detail: `PASS rate differs: A=${(fluxA.passRate * 100).toFixed(1)}%, B=${(fluxB.passRate * 100).toFixed(1)}%. Consider comparing PASS-only first, and using UNPASS as a sensitivity check.`,
    });
  }

  // Recommendations (minimal + actionable)
  if (typeof filters?.fdrMax === "number") rec.fdrMax = filters.fdrMax;
  if (hasFlux) rec.fluxPass = "pass";
  rec.topEdges = Math.max(densityA.pairs, densityB.pairs) > 800 ? 300 : 500;

  const summaryLines = [
    `A: rows=${densityA.rows}, pairs=${densityA.pairs}, senders=${densityA.senders}, receivers=${densityA.receivers}`,
    `B: rows=${densityB.rows}, pairs=${densityB.pairs}, senders=${densityB.senders}, receivers=${densityB.receivers}`,
    `Delta: total=${diffRows.length}, gained=${gained}, lost=${lost}`,
    `Weight mode: ${weightLabel}`,
  ];

  const topUp = [...diffRows].sort((a, b) => b.delta - a.delta).slice(0, 8);
  const topDown = [...diffRows].sort((a, b) => a.delta - b.delta).slice(0, 8);

  return {
    kind: "compare",
    weightMode,
    summaryLines,
    qc,
    recommendations: rec,
    top: { topUp, topDown, annDiffRows: annDiffRows?.slice(0, 8) ?? [], fluxDiffRows: fluxDiffRows?.slice(0, 8) ?? [] },
    stats: { densityA, densityB },
  };
}

export function toMarkdown(insights, title = "MEBOCOST Insights") {
  const lines = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push("## Summary");
  for (const l of insights.summaryLines ?? []) lines.push(`- ${l}`);
  lines.push("");
  lines.push("## QC");
  if (!insights.qc?.length) lines.push("- No significant issues detected");
  else for (const q of insights.qc) lines.push(`- [${q.level}] ${q.title}: ${q.detail}`);
  lines.push("");

  if (insights.kind === "single") {
    lines.push("## Top");
    const top = insights.top ?? {};
    const fmtRow = (r) => `- ${r.key} (w=${r.weight.toFixed(2)}, n=${r.count})`;
    lines.push("### Top senders");
    for (const r of top.topSenders ?? []) lines.push(`- ${r.id} (out=${r.outWeight.toFixed(2)}, n=${r.outCount})`);
    lines.push("### Top receivers");
    for (const r of top.topReceivers ?? []) lines.push(`- ${r.id} (in=${r.inWeight.toFixed(2)}, n=${r.inCount})`);
    lines.push("### Top metabolites");
    for (const r of top.topMet ?? []) lines.push(fmtRow(r));
    lines.push("### Top sensors");
    for (const r of top.topSens ?? []) lines.push(fmtRow(r));
    lines.push("### Top edges (aggregated)");
    for (const r of top.topEdges ?? []) lines.push(`- ${r.sender} → ${r.receiver} (w=${r.weight.toFixed(2)}, n=${r.count})`);
  } else {
    lines.push("## Compare Top Δ");
    lines.push("### Top increased (B-A)");
    for (const r of insights.top?.topUp ?? []) lines.push(`- ${r.sender} → ${r.receiver} (Δ=${r.delta.toFixed(2)})`);
    lines.push("### Top decreased (B-A)");
    for (const r of insights.top?.topDown ?? []) lines.push(`- ${r.sender} → ${r.receiver} (Δ=${r.delta.toFixed(2)})`);
    lines.push("### By Annotation");
    for (const r of insights.top?.annDiffRows ?? []) lines.push(`- ${r.key} (Δ=${r.delta.toFixed(2)})`);
    lines.push("### By Flux_PASS");
    for (const r of insights.top?.fluxDiffRows ?? []) lines.push(`- ${r.key} (Δ=${r.delta.toFixed(2)})`);
  }

  lines.push("");
  return lines.join("\n");
}
