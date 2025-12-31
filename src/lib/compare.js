function keyPair(sender, receiver) {
  return `${sender}\t${receiver}`;
}

export function aggregatePairs(events) {
  const pairs = new Map();
  const senders = new Set();
  const receivers = new Set();
  for (const e of events) {
    senders.add(e.sender);
    receivers.add(e.receiver);
    const k = keyPair(e.sender, e.receiver);
    const prev = pairs.get(k);
    if (prev) {
      prev.weight += e.weight;
      prev.count += 1;
    } else {
      pairs.set(k, { sender: e.sender, receiver: e.receiver, weight: e.weight, count: 1 });
    }
  }
  return { pairs, senders: [...senders], receivers: [...receivers] };
}

export function computePairDiff(aggA, aggB, eps = 1e-6) {
  const keys = new Set([...aggA.pairs.keys(), ...aggB.pairs.keys()]);
  const rows = [];

  for (const k of keys) {
    const a = aggA.pairs.get(k);
    const b = aggB.pairs.get(k);
    const sender = a?.sender ?? b?.sender ?? "";
    const receiver = a?.receiver ?? b?.receiver ?? "";
    const weightA = a?.weight ?? 0;
    const weightB = b?.weight ?? 0;
    const countA = a?.count ?? 0;
    const countB = b?.count ?? 0;
    const delta = weightB - weightA;
    const log2fc = Math.log2((weightB + eps) / (weightA + eps));

    let status = "shared";
    if (weightA === 0 && weightB > 0) status = "gained";
    if (weightB === 0 && weightA > 0) status = "lost";

    rows.push({
      sender,
      receiver,
      weightA,
      weightB,
      countA,
      countB,
      delta,
      absDelta: Math.abs(delta),
      log2fc,
      status,
    });
  }

  rows.sort((x, y) => y.absDelta - x.absDelta);
  return rows;
}

export function buildDeltaMatrix(diffRows) {
  const senders = new Set();
  const receivers = new Set();
  const pairs = new Map();
  for (const r of diffRows) {
    if (!r.sender || !r.receiver) continue;
    senders.add(r.sender);
    receivers.add(r.receiver);
    pairs.set(keyPair(r.sender, r.receiver), r);
  }
  return { senders: [...senders], receivers: [...receivers], pairs };
}

export function aggregateCategory(events, keyFn) {
  const m = new Map();
  for (const e of events) {
    const key = keyFn(e) || "NA";
    const prev = m.get(key);
    if (prev) {
      prev.weight += e.weight;
      prev.count += 1;
    } else {
      m.set(key, { key, weight: e.weight, count: 1 });
    }
  }
  return m;
}

export function computeCategoryDiff(eventsA, eventsB, keyFn) {
  const a = aggregateCategory(eventsA, keyFn);
  const b = aggregateCategory(eventsB, keyFn);
  const keys = new Set([...a.keys(), ...b.keys()]);
  const rows = [];
  for (const k of keys) {
    const ra = a.get(k);
    const rb = b.get(k);
    const weightA = ra?.weight ?? 0;
    const weightB = rb?.weight ?? 0;
    rows.push({
      key: k,
      weightA,
      weightB,
      countA: ra?.count ?? 0,
      countB: rb?.count ?? 0,
      delta: weightB - weightA,
      absDelta: Math.abs(weightB - weightA),
    });
  }
  rows.sort((x, y) => y.absDelta - x.absDelta);
  return rows;
}
