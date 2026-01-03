function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export function buildTopRowsCsv(events, n = 20) {
  const headers = ["RowId", "Sender", "Receiver", "Metabolite", "FDR"];
  const rows = [];
  const top = [...(events ?? [])].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, n);
  for (let i = 0; i < top.length; i += 1) {
    const e = top[i];
    rows.push([
      csvCell(String(i + 1)),
      csvCell(e.sender ?? ""),
      csvCell(e.receiver ?? ""),
      csvCell(e.metabolite ?? ""),
      csvCell(typeof e.fdr === "number" ? e.fdr : ""),
    ]);
  }
  return `${headers.join(",")}\n${rows.map((r) => r.join(",")).join("\n")}`.trim();
}

export function buildMcccDataInterpretationPrompt({ events, filters, weightMode, maxRows = 20 }) {
  const csv = buildTopRowsCsv(events, maxRows);
  const wm = weightMode === "commu_score" ? "Commu_Score" : weightMode === "norm_commu_score" ? "Norm_Commu_Score" : "-log10(FDR)";
  const filterText = filters ? JSON.stringify(filters, null, 2) : "{}";

  return (
    "You are a bioinformatics analysis assistant. You must interpret the results strictly based on the CSV below (avoid generic explanations).\n" +
    "\n" +
    "[HARD REQUIREMENTS]\n" +
    "1) Mention at least 3 metabolite names that appear in the CSV 'Metabolite' column. If the Metabolite column is empty/missing, explicitly state that you cannot name specific metabolites from this table.\n" +
    "2) Output MUST contain exactly two parts: REPORT_MD (Markdown) + PAYLOAD_JSON (JSON). Do not output anything outside these two blocks.\n" +
    "3) REPORT_MD: use Markdown (### headings, **bold**, lists). Structure: a title + 3–6 bullet points + one short summary paragraph.\n" +
    "4) PAYLOAD_JSON: MUST be valid JSON with the following object schema:\n" +
    '   {"claims":[{"id":"C1","title":"","confidence":"high|medium|low","statement_md":"","evidence_row_ids":[1,2,3],"caveats":["..."]}],"entities":{"senders":[],"receivers":[],"metabolites":[],"pairs":[{"sender":"","receiver":""}]},"filterPatch":{},"evidence":{"metabolites":[],"pairs":[]}}\n' +
    "   - entities.metabolites/pairs: pick the most important ones from the CSV (used for clickable UI filters).\n" +
    "   - filterPatch: if you recommend focusing on a sender/receiver or a metabolite, provide an immediately-applicable patch for the UI (e.g., focusCell/metaboliteQuery/fdrMax/topEdges/fluxPass).\n" +
    "   - evidence: list the metabolites/pairs you explicitly mention in REPORT_MD (used to display evidence in the UI).\n" +
    "   - claims: each claim MUST reference evidence_row_ids (from the CSV RowId column) and provide confidence + caveats.\n" +
    "\n" +
    "[CONTEXT]\n" +
    `Weight mode: ${wm}\n` +
    "Current filters (JSON):\n" +
    filterText +
    "\n\n" +
    `Current table (Top ${maxRows} rows by weight, CSV):\n` +
    csv +
    "\n\n" +
    "[OUTPUT FORMAT (MUST FOLLOW EXACTLY)]\n" +
    "[REPORT_MD]\n" +
    "(Write the Markdown report here)\n" +
    "[/REPORT_MD]\n" +
    "[PAYLOAD_JSON]\n" +
    "```json\n" +
    "{\n" +
    '  "claims": [\n' +
    '    { "id": "C1", "title": "", "confidence": "medium", "statement_md": "", "evidence_row_ids": [1], "caveats": [] }\n' +
    "  ],\n" +
    '  "entities": { "senders": [], "receivers": [], "metabolites": [], "pairs": [] },\n' +
    '  "filterPatch": {},\n' +
    '  "evidence": { "metabolites": [], "pairs": [] }\n' +
    "}\n" +
    "```\n" +
    "[/PAYLOAD_JSON]"
  );
}
