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
    "你是生物信息学分析助手。你必须严格基于下面这份 CSV 数据进行解读（不要泛泛科普）。\n" +
    "\n" +
    "【硬性要求】\n" +
    "1) 在回答中至少点名 3 个出现在 CSV 的 Metabolite（代谢物）名称；若 CSV 的 Metabolite 为空/缺失，请明确说明“当前表缺少代谢物列/为空，无法点名具体代谢物”。\n" +
    "2) 输出必须包含两部分：REPORT_MD（Markdown）+ PAYLOAD_JSON（JSON）。除这两部分外不要输出任何多余文字。\n" +
    "3) REPORT_MD：使用 Markdown（支持 ### 标题、**加粗**、列表），结构为“标题 + 3-6 条要点 + 1 段总结”。\n" +
    "4) PAYLOAD_JSON：必须是合法 JSON，对象结构如下：\n" +
    '   {"claims":[{"id":"C1","title":"","confidence":"high|medium|low","statement_md":"","evidence_row_ids":[1,2,3],"caveats":["..."]}],"entities":{"senders":[],"receivers":[],"metabolites":[],"pairs":[{"sender":"","receiver":""}]},"filterPatch":{},"evidence":{"metabolites":[],"pairs":[]}}\n' +
    "   - entities.metabolites/pairs：从 CSV 中挑选你认为最关键的（用于前端点击跳转/筛选）。\n" +
    "   - filterPatch：如果你建议聚焦某个 sender/receiver 或代谢物，请给出前端可直接应用的过滤 patch（例如 focusCell/metaboliteQuery/fdrMax/topEdges/fluxPass）。\n" +
    "   - evidence：列出你在 REPORT_MD 中点名的代谢物/细胞对（用于前端展示证据）。\n" +
    "   - claims：每条 claim 必须引用 evidence_row_ids（来自 CSV 的 RowId 列），并给出 confidence 与 caveats。\n" +
    "\n" +
    "【当前上下文】\n" +
    `当前权重口径：${wm}\n` +
    "当前筛选条件（JSON）：\n" +
    filterText +
    "\n\n" +
    `当前表（Top ${maxRows} rows by weight，CSV）：\n` +
    csv +
    "\n\n" +
    "【输出格式（必须严格遵守）】\n" +
    "[REPORT_MD]\n" +
    "（在这里输出 Markdown 报告）\n" +
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
