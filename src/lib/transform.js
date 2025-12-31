import { normalizeLabel, toNumber } from "./parse.js";

const MAX_NEG_LOG_FDR = 50;

export function buildEvents(rows, mapping) {
  const report = {
    totalRows: rows.length,
    keptRows: 0,
    droppedMissingSenderReceiver: 0,
    nonNumericFdr: 0,
    nonNumericScore: 0,
    nonPositiveFdr: 0,
    zeroFdr: 0,
    fdrOver1: 0,
    fluxPassMissing: 0,
  };

  const events = [];
  for (const raw of rows) {
    const sender = normalizeLabel(raw[mapping.sender]);
    const receiver = normalizeLabel(raw[mapping.receiver]);
    if (!sender || !receiver) {
      report.droppedMissingSenderReceiver += 1;
      continue;
    }

    const metabolite = mapping.metabolite ? normalizeLabel(raw[mapping.metabolite]) : "";
    const sensor = mapping.sensor ? normalizeLabel(raw[mapping.sensor]) : "";
    const fluxPass = mapping.fluxPass ? normalizeLabel(raw[mapping.fluxPass]) : "";
    const annotation = mapping.annotation ? normalizeLabel(raw[mapping.annotation]) : "";

    const fdrRaw = mapping.fdr ? raw[mapping.fdr] : undefined;
    const scoreRaw = mapping.score ? raw[mapping.score] : undefined;
    let fdr = mapping.fdr ? toNumber(fdrRaw) : undefined;
    const score = mapping.score ? toNumber(scoreRaw) : undefined;

    if (mapping.fdr && fdrRaw !== undefined && fdr === undefined) report.nonNumericFdr += 1;
    if (mapping.score && scoreRaw !== undefined && score === undefined) report.nonNumericScore += 1;

    if (typeof fdr === "number") {
      if (fdr < 0) {
        report.nonPositiveFdr += 1;
        fdr = undefined;
      } else if (fdr === 0) {
        // 常见于有限次 permutation：显示为 0，实际应理解为极小值
        report.zeroFdr += 1;
        fdr = 1e-300;
      } else if (fdr > 1) {
        report.fdrOver1 += 1;
        fdr = undefined;
      }
    }

    let weight = 1;
    if (typeof fdr === "number" && fdr > 0) weight = Math.min(MAX_NEG_LOG_FDR, -Math.log10(fdr));
    else if (typeof score === "number") weight = score;

    if (mapping.fluxPass && !fluxPass) report.fluxPassMissing += 1;

    events.push({
      sender,
      receiver,
      metabolite: metabolite || undefined,
      sensor: sensor || undefined,
      fdr,
      score,
      weight,
      fluxPass: fluxPass || undefined,
      annotation: annotation || undefined,
      raw,
    });
    report.keptRows += 1;
  }

  return { events, report };
}

export function summarizeWarnings(report, mapping) {
  const warnings = [];
  if (!mapping.fdr && !mapping.score) warnings.push("未映射 FDR/Score：可视化权重会回退为 1（建议至少提供其一）。");
  if (mapping.fdr && report.zeroFdr) warnings.push(`发现 ${report.zeroFdr} 条 FDR=0（已按 1e-300 处理以便计算 -log10(FDR)）。`);
  if (mapping.fdr && report.nonPositiveFdr) warnings.push(`发现 ${report.nonPositiveFdr} 条 FDR<0（已当作缺失处理）。`);
  if (mapping.fdr && report.fdrOver1) warnings.push(`发现 ${report.fdrOver1} 条 FDR>1（已当作缺失处理；请确认列是否真的是 FDR）。`);
  if (mapping.fdr && report.zeroFdr) warnings.push("如果 FDR=0 很多，建议提高 MEBOCOST 的 n_shuffle（例如 1000）以获得更稳定的 FDR。");
  if (report.droppedMissingSenderReceiver)
    warnings.push(`有 ${report.droppedMissingSenderReceiver} 行缺少 Sender/Receiver（已跳过）。`);
  if (mapping.fdr && report.nonNumericFdr)
    warnings.push(`有 ${report.nonNumericFdr} 行 FDR 不是数值（已当作缺失处理）。`);
  if (mapping.score && report.nonNumericScore)
    warnings.push(`有 ${report.nonNumericScore} 行 Score 不是数值（已当作缺失处理）。`);
  if (mapping.fluxPass && report.fluxPassMissing)
    warnings.push(`有 ${report.fluxPassMissing} 行 Flux_PASS 为空（不会被 “PASS-only” 过滤命中）。`);
  return warnings;
}

export function filterEvents(events, filters) {
  const mq = (filters.metaboliteQuery ?? "").trim().toLowerCase();
  const sq = (filters.sensorQuery ?? "").trim().toLowerCase();
  const focus = filters.focusCell?.trim();
  const flux = filters.fluxPass ?? "all";
  const ann = (filters.annotationQuery ?? "").trim().toLowerCase();

  let out = events.filter((e) => {
    if (!filters.includeSelfLoops && e.sender === e.receiver) return false;

    if (focus) {
      if (filters.focusMode === "outgoing" && e.sender !== focus) return false;
      if (filters.focusMode === "incoming" && e.receiver !== focus) return false;
      if ((!filters.focusMode || filters.focusMode === "any") && e.sender !== focus && e.receiver !== focus) return false;
    }

    if (typeof filters.fdrMax === "number" && typeof e.fdr === "number" && e.fdr > filters.fdrMax) return false;
    if (mq && !(e.metabolite ?? "").toLowerCase().includes(mq)) return false;
    if (sq && !(e.sensor ?? "").toLowerCase().includes(sq)) return false;
    if (ann && !(e.annotation ?? "").toLowerCase().includes(ann)) return false;
    const fp = (e.fluxPass ?? "").toUpperCase();
    // If dataset doesn't have Flux_PASS (empty), do not drop by flux filter.
    if (fp) {
      if (flux === "pass" && fp !== "PASS") return false;
      if (flux === "unpass" && fp === "PASS") return false;
    }
    return true;
  });

  if (typeof filters.topEdges === "number" && filters.topEdges > 0) {
    out = [...out].sort((a, b) => b.weight - a.weight).slice(0, filters.topEdges);
  }

  return out;
}

export function computeSelectionSummary(events) {
  const nodeMap = new Map();
  const linkMap = new Map();
  const pairMap = new Map(); // key sender\treceiver -> {weight,count}

  const ensureNode = (id) => {
    const prev = nodeMap.get(id);
    if (prev) return prev;
    const node = { id, weight: 0, in: 0, out: 0, inCount: 0, outCount: 0 };
    nodeMap.set(id, node);
    return node;
  };

  for (const e of events) {
    const sender = ensureNode(e.sender);
    const receiver = ensureNode(e.receiver);
    sender.weight += e.weight;
    receiver.weight += e.weight;
    sender.out += e.weight;
    receiver.in += e.weight;
    sender.outCount += 1;
    receiver.inCount += 1;

    const lk = `${e.sender}→${e.receiver}`;
    const prevLink = linkMap.get(lk);
    if (prevLink) {
      prevLink.weight += e.weight;
      prevLink.count += 1;
    } else {
      linkMap.set(lk, { source: e.sender, target: e.receiver, weight: e.weight, count: 1 });
    }

    const pk = `${e.sender}\t${e.receiver}`;
    const prevPair = pairMap.get(pk);
    if (prevPair) {
      prevPair.weight += e.weight;
      prevPair.count += 1;
    } else {
      pairMap.set(pk, { weight: e.weight, count: 1 });
    }
  }

  const nodes = [...nodeMap.values()].sort((a, b) => b.weight - a.weight);
  const links = [...linkMap.values()].sort((a, b) => b.weight - a.weight);

  const senders = new Set();
  const receivers = new Set();
  for (const l of links) {
    senders.add(l.source);
    receivers.add(l.target);
  }

  const matrix = {
    senders: [...senders],
    receivers: [...receivers],
    pairs: pairMap,
  };

  // per-cell details
  const byCell = new Map();
  for (const n of nodes) {
    byCell.set(n.id, {
      id: n.id,
      totalWeight: n.weight,
      inWeight: n.in,
      outWeight: n.out,
      inCount: n.inCount,
      outCount: n.outCount,
    });
  }

  return { nodes, links, matrix, byCell };
}

export function computeDetailsForCell(events, cellId) {
  const outgoingPartners = new Map();
  const incomingPartners = new Map();
  const metaboliteAgg = new Map();
  const sensorAgg = new Map();
  const annotationAgg = new Map();
  const fluxAgg = new Map();

  const bump = (map, key, weight) => {
    if (!key) return;
    const prev = map.get(key);
    if (prev) {
      prev.weight += weight;
      prev.count += 1;
    } else {
      map.set(key, { key, weight, count: 1 });
    }
  };

  for (const e of events) {
    if (e.sender === cellId) {
      bump(outgoingPartners, e.receiver, e.weight);
      bump(metaboliteAgg, e.metabolite, e.weight);
      bump(sensorAgg, e.sensor, e.weight);
      bump(annotationAgg, e.annotation, e.weight);
      bump(fluxAgg, e.fluxPass, e.weight);
    }
    if (e.receiver === cellId) {
      bump(incomingPartners, e.sender, e.weight);
      bump(metaboliteAgg, e.metabolite, e.weight);
      bump(sensorAgg, e.sensor, e.weight);
      bump(annotationAgg, e.annotation, e.weight);
      bump(fluxAgg, e.fluxPass, e.weight);
    }
  }

  const top = (map) =>
    [...map.values()].sort((a, b) => b.weight - a.weight).slice(0, 12);

  return {
    outgoingPartners: top(outgoingPartners),
    incomingPartners: top(incomingPartners),
    metabolites: top(metaboliteAgg),
    sensors: top(sensorAgg),
    annotations: top(annotationAgg),
    fluxPass: top(fluxAgg),
  };
}
