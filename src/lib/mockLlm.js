function pickTop(items, n) {
  const out = [];
  const seen = new Set();
  for (const x of items) {
    const s = String(x ?? "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= n) break;
  }
  return out;
}

function parseInjectedCsvFromPrompt(prompt) {
  const text = String(prompt ?? "");
  const idx = text.indexOf("RowId,Sender,Receiver,Metabolite,FDR");
  if (idx === -1) return [];
  const lines = text.slice(idx).split("\n").slice(1);
  const rows = [];
  for (const line of lines) {
    const s = line.trim();
    if (!s) break;
    if (s.startsWith("[/")) break;
    // very simple CSV split (works for our injected csv which avoids commas in fields)
    const parts = s.split(",");
    if (parts.length < 5) continue;
    const rowId = Number(parts[0]);
    const sender = parts[1] ?? "";
    const receiver = parts[2] ?? "";
    const metabolite = parts[3] ?? "";
    const fdr = parts[4] ?? "";
    if (!Number.isFinite(rowId)) continue;
    rows.push({ rowId, sender, receiver, metabolite, fdr });
    if (rows.length >= 40) break;
  }
  return rows;
}

function buildDemoStructuredContent({ prompt, reason }) {
  const rows = parseInjectedCsvFromPrompt(prompt);
  const mets = pickTop(rows.map((r) => r.metabolite).filter(Boolean), 5);
  const pairs = pickTop(rows.map((r) => `${r.sender}\t${r.receiver}`), 5).map((k) => {
    const [sender, receiver] = k.split("\t");
    return { sender, receiver };
  });
  const senders = pickTop(rows.map((r) => r.sender), 4);
  const receivers = pickTop(rows.map((r) => r.receiver), 4);

  const m1 = mets[0] || "Deoxyuridine";
  const m2 = mets[1] || "L-Arginine";
  const m3 = mets[2] || "L-Glutamine";

  const e1 = rows[0]?.rowId ?? 1;
  const e2 = rows[1]?.rowId ?? 2;
  const e3 = rows[2]?.rowId ?? 3;

  const think =
    "I will answer strictly based on the injected Top rows CSV.\n" +
    `1) Scan the Metabolite column and surface frequent / high-weight candidates: ${[m1, m2, m3].join(", ")}.\n` +
    "2) Use Sender/Receiver distribution to identify dominant cell-pair axes and likely directionality.\n" +
    "3) Bind each claim to RowId (evidence_row_ids) for traceable review.\n" +
    (reason ? `4) Demo fallback mode (${reason}) is enabled to keep the full workflow runnable without external LLM access.\n` : "");

  const reportMd =
    `### Metabolite-mediated mCCC interpretation (Demo)\n\n` +
    `1. **Key metabolite signals**: In the injected Top rows, **${m1}**, **${m2}**, and **${m3}** appear frequently / with high weights, suggesting they may drive the dominant communication axes under the current filters.\n` +
    `2. **Directionality & cell pairs**: Prioritize the top sender→receiver edges (see evidence), because they form the most stable structural backbone across Network/Matrix/DotPlot views.\n` +
    `3. **Statistical caution**: If you observe many **FDR=0** values (common with limited permutations), document it and apply caps / sensitivity checks to avoid inflating -log10(FDR).\n` +
    `4. **Complementarity with LR**: LR emphasizes ligand–receptor signaling pathways, while mCCC/MEBOCOST emphasizes metabolite supply–demand / flux feasibility. Agreement strengthens the story; disagreements often point to filtering choices or annotation coverage.\n\n` +
    `Takeaway: Under the current filters and weight mode, the Top rows suggest a communication signal dominated by **${m1}/${m2}/${m3}**. Use the claims→evidence chain to cross-check in linked plots, and add robustness / null controls to improve review confidence.`;

  const payload = {
    claims: [
      {
        id: "C1",
        title: "Traceable evidence for top metabolite signals",
        confidence: "high",
        statement_md: `- In the Top rows, **${m1}**/**${m2}**/**${m3}** recur, suggesting they dominate communication strength under the current settings.`,
        evidence_row_ids: [e1, e2, e3],
        caveats: ["Demo-mode output; in a real deployment, support this with robustness checks and null controls."],
      },
      {
        id: "C2",
        title: "Validate the strongest sender→receiver backbone first",
        confidence: "medium",
        statement_md: "- Start by validating the top edges in Network/Matrix, then expand to metabolite/annotation-stratified interpretation.",
        evidence_row_ids: [e1],
        caveats: ["TopEdges truncation affects the appearance; run a sensitivity analysis."],
      },
    ],
    entities: {
      senders,
      receivers,
      metabolites: [m1, m2, m3].filter(Boolean),
      pairs,
    },
    filterPatch: mets[0] ? { metaboliteQuery: mets[0], topEdges: 300 } : { topEdges: 300 },
    evidence: { metabolites: [m1, m2, m3].filter(Boolean), pairs },
  };

  return `<think>\n${think}\n</think>\n\n[REPORT_MD]\n${reportMd}\n[/REPORT_MD]\n[PAYLOAD_JSON]\n\`\`\`json\n${JSON.stringify(
    payload,
    null,
    2,
  )}\n\`\`\`\n[/PAYLOAD_JSON]\n`;
}

export function mockChatCompletions({ body, reason = "MOCK_FALLBACK" }) {
  const user = Array.isArray(body?.messages) ? body.messages.find((m) => m?.role === "user") : null;
  const prompt = user?.content ?? "";
  const content = buildDemoStructuredContent({ prompt, reason });
  return {
    id: `mock-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: body?.model ?? "mock",
    mock: true,
    mockReason: reason,
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}
