import Papa from "papaparse";

function sniffDelimiter(text) {
  const head = text.slice(0, 4000);
  const comma = (head.match(/,/g) ?? []).length;
  const tab = (head.match(/\t/g) ?? []).length;
  return tab > comma ? "\t" : ",";
}

export function normalizeLabel(v) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\s+/g, " ").trim();
}

export function toNumber(v) {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function parseDelimitedText(text) {
  const delimiter = sniffDelimiter(text);
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    delimiter,
  });
  if (parsed.errors?.length) {
    const first = parsed.errors[0];
    throw new Error(`Parse failed: ${first.message}`);
  }
  return parsed.data ?? [];
}

export async function parseDelimitedFile(file) {
  const text = await file.text();
  return parseDelimitedText(text);
}

export function guessMapping(headers) {
  const lower = headers.map((h) => [h, normalizeLabel(h).toLowerCase()]);
  const find = (candidates) => {
    for (const c of candidates) {
      const exact = lower.find(([, v]) => v === c);
      if (exact) return exact[0];
    }
    for (const c of candidates) {
      const partial = lower.find(([, v]) => v.includes(c));
      if (partial) return partial[0];
    }
    return undefined;
  };

  const sender =
    find([
      "sender",
      "source",
      "from",
      "celltype_sender",
      "cell_type_sender",
      "sender_celltype",
      "sender_cell_type",
      "celltype1",
      "cell_type1",
    ]) ?? "";

  const receiver =
    find([
      "receiver",
      "target",
      "to",
      "celltype_receiver",
      "cell_type_receiver",
      "receiver_celltype",
      "receiver_cell_type",
      "celltype2",
      "cell_type2",
    ]) ?? "";

  return {
    sender,
    receiver,
    metabolite: find(["metabolite_name", "metabolite", "metab"]),
    sensor: find(["sensor", "receptor", "transporter"]),
    score: find(["commu_score", "norm_commu_score", "corrected_commu_score", "score", "strength", "communication_score", "comm_score", "weight"]),
    fdr: find([
      "permutation_test_fdr",
      "ranksum_test_fdr",
      "ttest_fdr",
      "zztest_fdr",
      "fdr",
      "qvalue",
      "q_value",
      "adj_p",
      "adjusted_p",
      "padj",
    ]),
    fluxPass: find(["flux_pass", "fluxpass", "flux_passed", "flux"]),
    annotation: find(["annotation", "sensor_type", "type"]),
  };
}
