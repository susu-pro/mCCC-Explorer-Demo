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
    "我将严格基于注入的 Top rows CSV 作答。\n" +
    `1) 先扫描 Metabolite 列，提取重复出现/高权重的候选：${[m1, m2, m3].join(", ")}。\n` +
    "2) 结合 Sender/Receiver 分布，定位最突出的细胞对与可能的方向性。\n" +
    "3) 将每条结论绑定到 RowId（evidence_row_ids）以便审稿可追溯。\n" +
    (reason ? `4) 当前为演示模式（${reason}），用于确保无 GPU 也能展示完整闭环。\n` : "");

  const reportMd =
    `### 代谢物介导的 mCCC 结果解读（Demo）\n\n` +
    `1. **关键代谢物信号**：在注入的 Top rows 中，**${m1}**、**${m2}**、**${m3}** 出现频繁/权重靠前，提示它们可能驱动当前筛选口径下的主要通讯轴。\n` +
    `2. **方向性与细胞对**：优先关注 Top 边对应的 sender→receiver（见 evidence），因为这些组合在 Network/Matrix/DotPlot 中会形成最稳定的结构骨架。\n` +
    `3. **统计口径提醒**：若观察到大量 **FDR=0**（常见于有限 permutation），建议在报告中说明并进行截断/敏感性分析，避免 -log10(FDR) 夸大。\n` +
    `4. **与 LR 互补**：LR 更偏“配体-受体信号通路”，mCCC/MEBOCOST 更偏“代谢供需/通量可行性”；二者一致时强化因果叙事，不一致时优先排查过滤口径与代谢注释覆盖。\n\n` +
    `总结：在当前筛选与权重口径下，Top rows 指向由 **${m1}/${m2}/${m3}** 主导的通讯信号；建议用 claims→evidence→图/表联动复核，并用 robustness/null control 提升审稿可信度。`;

  const payload = {
    claims: [
      {
        id: "C1",
        title: "Top 代谢物信号具有可追溯证据",
        confidence: "high",
        statement_md: `- 在 Top rows 中 **${m1}**/**${m2}**/**${m3}** 多次出现，提示其在当前口径下主导通讯强度。`,
        evidence_row_ids: [e1, e2, e3],
        caveats: ["演示模式输出；真实部署时仍需 robustness 与 null control 支撑稳健性。"],
      },
      {
        id: "C2",
        title: "优先复核最强 sender→receiver 结构骨架",
        confidence: "medium",
        statement_md: "- 建议先在 Network/Matrix 绑定并复核 Top 边，再扩展到代谢物/注释分层解释。",
        evidence_row_ids: [e1],
        caveats: ["TopEdges 截断会影响结构外观；请做敏感性分析。"],
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

