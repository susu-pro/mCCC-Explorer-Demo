import { filterEvents } from "./transform";

function num(v) {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : undefined;
}

export function applyWeightMode(events, weightMode) {
  const mode = weightMode ?? "neglog10_fdr";
  return (events ?? []).map((e) => {
    let weight = e.weight;
    if (mode === "commu_score") {
      const v = num(e.raw?.Commu_Score);
      weight = typeof v === "number" ? v : typeof e.score === "number" ? e.score : e.weight;
    }
    if (mode === "norm_commu_score") {
      const v = num(e.raw?.Norm_Commu_Score);
      weight = typeof v === "number" ? v : typeof e.score === "number" ? e.score : e.weight;
    }
    if (mode === "neglog10_fdr") weight = e.weight;
    return { ...e, weight };
  });
}

function aggregatePairs(events) {
  const m = new Map();
  let total = 0;
  for (const e of events) {
    const k = `${e.sender}\t${e.receiver}`;
    const prev = m.get(k);
    if (prev) {
      prev.weight += e.weight;
      prev.count += 1;
    } else {
      m.set(k, { sender: e.sender, receiver: e.receiver, weight: e.weight, count: 1 });
    }
    total += e.weight;
  }
  const rows = [...m.values()].sort((a, b) => b.weight - a.weight);
  return { rows, totalWeight: total };
}

function aggregateMetabolites(events) {
  const m = new Map();
  for (const e of events) {
    const k = (e.metabolite ?? "").toString().trim();
    if (!k) continue;
    const prev = m.get(k);
    if (prev) {
      prev.weight += e.weight;
      prev.count += 1;
    } else {
      m.set(k, { metabolite: k, weight: e.weight, count: 1 });
    }
  }
  return [...m.values()].sort((a, b) => b.weight - a.weight);
}

function variantGrid(baseFilters) {
  const fdr = [0.01, 0.05, 0.1].filter((x) => typeof x === "number");
  const top = [100, 300, 500].filter((x) => typeof x === "number");
  const flux = baseFilters?.fluxPass === "pass" ? ["pass", "all"] : ["all", "pass"];
  const out = [];
  for (const fdrMax of fdr) {
    for (const topEdges of top) {
      for (const fluxPass of flux) {
        out.push({
          ...baseFilters,
          fdrMax,
          topEdges,
          fluxPass,
        });
      }
    }
  }
  // de-dup by JSON
  const uniq = new Map();
  for (const v of out) uniq.set(JSON.stringify(v), v);
  return [...uniq.values()].slice(0, 12);
}

function stabilityForBaseline(baselineKeys, variantTopKeys) {
  const counts = new Map();
  const rankSum = new Map();
  for (const [vi, keys] of variantTopKeys.entries()) {
    for (let r = 0; r < keys.length; r += 1) {
      const k = keys[r];
      counts.set(k, (counts.get(k) ?? 0) + 1);
      rankSum.set(k, (rankSum.get(k) ?? 0) + (r + 1));
    }
  }
  const totalVariants = variantTopKeys.length || 1;
  return baselineKeys.map((k) => {
    const c = counts.get(k) ?? 0;
    const rs = rankSum.get(k) ?? 0;
    return {
      key: k,
      support: c / totalVariants,
      avgRank: c ? rs / c : Infinity,
    };
  });
}

export function computeRobustness({ eventsAll, baseFilters, weightMode, topK = 10 }) {
  const variants = variantGrid(baseFilters ?? {});
  const variantResults = [];

  for (const v of variants) {
    const filtered = applyWeightMode(filterEvents(eventsAll ?? [], v), weightMode);
    const pairs = aggregatePairs(filtered).rows.slice(0, topK);
    const mets = aggregateMetabolites(filtered).slice(0, topK);
    variantResults.push({
      filters: v,
      topPairs: pairs.map((p) => `${p.sender}\t${p.receiver}`),
      topMets: mets.map((m) => m.metabolite),
    });
  }

  // baseline = current filters (closest to UI)
  const baselineFiltered = applyWeightMode(filterEvents(eventsAll ?? [], baseFilters ?? {}), weightMode);
  const baselinePairs = aggregatePairs(baselineFiltered).rows.slice(0, topK);
  const baselineMets = aggregateMetabolites(baselineFiltered).slice(0, topK);
  const baselinePairKeys = baselinePairs.map((p) => `${p.sender}\t${p.receiver}`);
  const baselineMetKeys = baselineMets.map((m) => m.metabolite);

  const pairStability = stabilityForBaseline(
    baselinePairKeys,
    variantResults.map((r) => r.topPairs),
  )
    .map((x) => ({ ...x, sender: x.key.split("\t")[0], receiver: x.key.split("\t")[1] }))
    .sort((a, b) => b.support - a.support);

  const metStability = stabilityForBaseline(
    baselineMetKeys,
    variantResults.map((r) => r.topMets),
  )
    .map((x) => ({ ...x, metabolite: x.key }))
    .sort((a, b) => b.support - a.support);

  const warnings = [];
  const weakPairs = pairStability.filter((x) => x.support < 0.5).length;
  if (weakPairs >= Math.ceil(topK / 2)) warnings.push("Top pairs 对过滤参数较敏感：≥一半的 baseline Top 边在多数 variant 中不稳定。");
  const weakMets = metStability.filter((x) => x.support < 0.5).length;
  if (weakMets >= Math.ceil(topK / 2)) warnings.push("Top metabolites 对过滤参数较敏感：≥一半的 baseline Top 代谢物在多数 variant 中不稳定。");

  return {
    kind: "robustness",
    topK,
    variants: variants.length,
    warnings,
    baseline: {
      pairs: baselinePairs.map((p) => ({ sender: p.sender, receiver: p.receiver, weight: p.weight, count: p.count })),
      metabolites: baselineMets.map((m) => ({ metabolite: m.metabolite, weight: m.weight, count: m.count })),
    },
    stability: {
      pairs: pairStability,
      metabolites: metStability,
    },
  };
}

// --- Null control (receiver shuffle) ---

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function shuffleInPlace(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function topEdgeShare(events) {
  const { rows, totalWeight } = aggregatePairs(events);
  const top = rows[0]?.weight ?? 0;
  const denom = totalWeight || 1;
  return top / denom;
}

export function computeNullControl({ eventsAll, baseFilters, weightMode, n = 60, seed = 42 }) {
  const base = applyWeightMode(filterEvents(eventsAll ?? [], baseFilters ?? {}), weightMode);
  const observed = topEdgeShare(base);

  const receivers = base.map((e) => e.receiver);
  const rnd = lcg(seed);
  const samples = [];
  let ge = 0;

  for (let i = 0; i < n; i += 1) {
    const perm = [...receivers];
    shuffleInPlace(perm, rnd);
    const shuffled = base.map((e, idx) => ({ ...e, receiver: perm[idx] }));
    const v = topEdgeShare(shuffled);
    samples.push(v);
    if (v >= observed) ge += 1;
  }

  const mean = samples.reduce((a, b) => a + b, 0) / (samples.length || 1);
  const sd = Math.sqrt(samples.reduce((a, b) => a + (b - mean) ** 2, 0) / (samples.length || 1));
  const p = (ge + 1) / (samples.length + 1);

  return {
    kind: "null_control",
    metric: "top_edge_share",
    observed,
    mean,
    sd,
    n,
    pValue: p,
    note: "Null: shuffle receivers across events (preserve sender distribution + weights). Metric: max edge weight share of total.",
  };
}
