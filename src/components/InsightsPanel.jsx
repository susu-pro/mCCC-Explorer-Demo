import React from "react";
import { toMarkdown } from "../lib/intelligence";
import { downloadJson, downloadText } from "../lib/report";
import { loadLlmConfig } from "../lib/llmConfig";
import { chatCompletions, extractAssistantText } from "../lib/llmClient";
import { buildMcccDataInterpretationPrompt, buildTopRowsCsv } from "../lib/llmPrompts";
import { splitThink } from "../lib/llmThink";
import { parseStructuredLlmAnswer } from "../lib/llmStructured";
import { computeNullControl, computeRobustness } from "../lib/robustness";
import { getLlmApiUrl } from "../lib/llmEnv";
import ThinkBlock from "./ThinkBlock";
import SmartLoader from "./SmartLoader";
import MarkdownLite from "./MarkdownLite";
import TypewriterMarkdown from "./TypewriterMarkdown";
import LlmComfortLoader from "./LlmComfortLoader";

function Badge({ tone, children }) {
  const style =
    tone === "warn"
      ? { background: "rgba(220,38,38,0.10)", borderColor: "rgba(220,38,38,0.26)", color: "rgba(153,27,27,0.96)" }
      : tone === "info"
        ? { background: "rgba(37,99,235,0.08)", borderColor: "rgba(37,99,235,0.20)", color: "rgba(30,64,175,0.96)" }
        : { background: "rgba(15,23,42,0.04)", borderColor: "rgba(15,23,42,0.14)", color: "rgba(15,23,42,0.72)" };
  return (
    <span className="pill" style={{ ...style, fontWeight: 700 }}>
      {children}
    </span>
  );
}

function KeyValueTable({ title, headers, rows }) {
  return (
    <div className="card pad" style={{ boxShadow: "var(--shadow-soft)" }}>
      <div className="row split" style={{ gap: 10 }}>
        <div className="card-title">{title}</div>
        <div className="pill">Top {Math.min(rows.length, 8)}</div>
      </div>
	      <div style={{ height: 10 }} />
	      <div className="scroll" style={{ borderRadius: 12 }}>
	        <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
	          <thead>
	            <tr style={{ background: "rgba(248,250,252,0.94)" }}>
              {headers.map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "10px 10px",
                    fontSize: 12,
                    borderBottom: "1px solid rgba(15,23,42,0.10)",
                    color: "rgba(15,23,42,0.72)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 8).map((r, idx) => (
              <tr key={idx} style={{ background: idx % 2 ? "white" : "rgba(248,250,252,0.55)" }}>
                {r.map((c, j) => (
                  <td
                    key={j}
                    style={{
                      padding: "8px 10px",
                      fontSize: 12,
                      borderBottom: "1px solid rgba(15,23,42,0.06)",
	                      whiteSpace: "nowrap",
	                      overflow: "hidden",
	                      textOverflow: "ellipsis",
	                      maxWidth: 240,
	                    }}
	                    title={String(c)}
	                  >
	                    {c}
	                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function InsightsPanel({
  title,
  fileLabel,
  insights,
  onApplyRecommendations,
  events,
  eventsAll,
  filters,
  weightMode,
  selectedPair,
  onSelectPair,
  onNavigate,
}) {
  const [llmBusy, setLlmBusy] = React.useState(false);
  const [llmError, setLlmError] = React.useState("");
  const [llmResult, setLlmResult] = React.useState({ think: "", markdown: "", payload: null, raw: "" });
  const [llmRunId, setLlmRunId] = React.useState(0);
  const [llmMeta, setLlmMeta] = React.useState({ mock: false, reason: "" });
  const [llmTopRows, setLlmTopRows] = React.useState(20);
  const [llmSender, setLlmSender] = React.useState("");
  const [llmReceiver, setLlmReceiver] = React.useState("");

  const [llmCfg, setLlmCfg] = React.useState(() => loadLlmConfig());
  const apiUrl = getLlmApiUrl();

  const [robBusy, setRobBusy] = React.useState(false);
  const [rob, setRob] = React.useState(null);
  const [nullBusy, setNullBusy] = React.useState(false);
  const [nullRes, setNullRes] = React.useState(null);

  const hasRec = !!(insights?.recommendations && Object.keys(insights.recommendations).length > 0);
  const md = React.useMemo(() => (insights ? toMarkdown(insights, title || "MEBOCOST Insights") : ""), [insights, title]);
  const baseName = String(fileLabel || insights?.kind || "insights").replace(/\s+/g, "_");

  const exportMd = () => downloadText(`${baseName}.md`, md, "text/markdown;charset=utf-8");
  const exportJson = () => downloadJson(`${baseName}.json`, insights);

  const applyRec = () => {
    if (!hasRec) return;
    if (typeof onApplyRecommendations === "function") onApplyRecommendations(insights.recommendations);
  };

  const llmInputEvents = React.useMemo(() => {
    const inputEvents = Array.isArray(events) ? events : [];
    const subset = inputEvents.filter((e) => {
      if (llmSender.trim() && (e.sender ?? "") !== llmSender.trim()) return false;
      if (llmReceiver.trim() && (e.receiver ?? "") !== llmReceiver.trim()) return false;
      return true;
    });
    return subset.length ? subset : inputEvents;
  }, [events, llmSender, llmReceiver]);

  const injectedCsvPreview = React.useMemo(() => buildTopRowsCsv(llmInputEvents, llmTopRows), [llmInputEvents, llmTopRows]);

  const injectedPromptPreview = React.useMemo(
    () =>
      buildMcccDataInterpretationPrompt({
        events: llmInputEvents,
        filters: filters ?? null,
        weightMode: weightMode ?? insights?.weightMode,
        maxRows: llmTopRows,
      }),
    [llmInputEvents, llmTopRows, filters, weightMode, insights?.weightMode],
  );

  const evidenceRows = React.useMemo(() => {
    const top = [...(llmInputEvents ?? [])].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, llmTopRows);
    return top.map((e, idx) => ({
      idx: idx + 1,
      sender: e.sender,
      receiver: e.receiver,
      metabolite: e.metabolite ?? "",
      fdr: typeof e.fdr === "number" ? e.fdr : "",
      weight: typeof e.weight === "number" ? e.weight : "",
    }));
  }, [llmInputEvents, llmTopRows]);

  const runRobustness = async () => {
    setRobBusy(true);
    try {
      const r = computeRobustness({
        eventsAll: Array.isArray(eventsAll) ? eventsAll : [],
        baseFilters: filters ?? {},
        weightMode: weightMode ?? insights?.weightMode,
        topK: 10,
      });
      setRob(r);
    } finally {
      setRobBusy(false);
    }
  };

  const runNull = async () => {
    setNullBusy(true);
    try {
      const r = computeNullControl({
        eventsAll: Array.isArray(eventsAll) ? eventsAll : [],
        baseFilters: filters ?? {},
        weightMode: weightMode ?? insights?.weightMode,
        n: 60,
        seed: 42,
      });
      setNullRes(r);
    } finally {
      setNullBusy(false);
    }
  };

  const runLlm = async () => {
    setLlmBusy(true);
    setLlmError("");
    setLlmResult({ think: "", markdown: "", payload: null, raw: "" });
    setLlmRunId((x) => x + 1);
    setLlmMeta({ mock: false, reason: "" });
    try {
      const cfg = loadLlmConfig();
      setLlmCfg(cfg);
      const prompt = injectedPromptPreview;

      const t0 = performance.now();
      const resp = await chatCompletions({
        apiKey: cfg.apiKey,
        body: {
          model: cfg.model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 900,
          temperature: 0.2,
        },
      });

      // In demo mock mode, keep the loader visible briefly so users can see progress and "work" happening.
      const elapsed = performance.now() - t0;
      if (resp?.mock) {
        const minMs = 6800;
        if (elapsed < minMs) await new Promise((r) => setTimeout(r, minMs - elapsed));
      }

      setLlmMeta({ mock: !!resp?.mock, reason: String(resp?.mockReason ?? "") });
      if (resp?.mock && String(resp?.mockReason ?? "") && String(resp?.mockReason ?? "") !== "ENV_MISSING") {
        setLlmError("The analysis service is temporarily unavailable (auto-falling back to demo mock output).");
      }
      const text = extractAssistantText(resp);
      if (!text) throw new Error("LLM returned empty content (choices[0].message.content missing).");
      const { think, answer } = splitThink(text);
      const structured = parseStructuredLlmAnswer(answer);
      setLlmResult({ think, ...structured });
    } catch (e) {
      setLlmError(e instanceof Error ? e.message : "The analysis service is temporarily unavailable (auto-falling back to demo mock output).");
    } finally {
      setLlmBusy(false);
    }
  };

  const payloadEntities = llmResult?.payload?.entities ?? null;
  const payloadPatch = llmResult?.payload?.filterPatch ?? null;
  const payloadClaims = Array.isArray(llmResult?.payload?.claims) ? llmResult.payload.claims : [];

  const normalizeArray = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()) : []);

  const mdEntities = React.useMemo(() => {
    const out = [];
    const mets = normalizeArray(payloadEntities?.metabolites);
    for (const m of mets) out.push({ kind: "metabolite", value: m });
    const cells = [...normalizeArray(payloadEntities?.senders), ...normalizeArray(payloadEntities?.receivers)];
    for (const c of cells) out.push({ kind: "cell", value: c });
    return out;
  }, [payloadEntities]);

  if (!insights) return <div className="notice">Import data and apply filters first to generate automated summary/QC.</div>;

  const navigate = (nextView) => {
    if (typeof onNavigate === "function" && nextView) onNavigate(nextView);
  };

  const applyPatch = (patch) => {
    if (!patch || typeof patch !== "object") return;
    if (typeof onApplyRecommendations === "function") onApplyRecommendations(patch);
  };

  const onEntityClick = (kind, value) => {
    if (kind === "metabolite") {
      applyPatch({ metaboliteQuery: value });
      navigate("table");
      return;
    }
    if (kind === "cell") {
      applyPatch({ focusCell: value, focusMode: "any" });
      navigate("network");
    }
  };

  const isSelectedEvidence = (r) => selectedPair?.sender === r.sender && selectedPair?.receiver === r.receiver;

  const claimConfidenceTone = (c) => {
    const v = typeof c?.confidence === "string" ? c.confidence.toLowerCase() : "";
    if (v === "high") return { bg: "rgba(16,185,129,0.10)", bd: "rgba(16,185,129,0.22)", fg: "rgba(6,95,70,0.96)" };
    if (v === "low") return { bg: "rgba(220,38,38,0.10)", bd: "rgba(220,38,38,0.22)", fg: "rgba(153,27,27,0.96)" };
    return { bg: "rgba(37,99,235,0.08)", bd: "rgba(37,99,235,0.20)", fg: "rgba(30,64,175,0.96)" };
  };

  const selectEvidenceRowId = (rowId) => {
    const n = Number(rowId);
    if (!Number.isFinite(n) || n < 1) return;
    const r = evidenceRows.find((x) => x.idx === n);
    if (!r) return;
    if (typeof onSelectPair === "function") onSelectPair({ sender: r.sender, receiver: r.receiver });
    navigate("table");
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="row split" style={{ flexWrap: "wrap", gap: 10 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="pill">{insights.kind === "compare" ? "Compare insights" : "Single insights"}</span>
          <span className="pill">weight mode: {insights.weightMode}</span>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {hasRec ? (
            <button className="btn small primary" onClick={applyRec} title="Apply the suggested filters on the left (and write them into the URL)">
              Apply Recommendations
            </button>
          ) : null}
          <button className="btn small" onClick={exportMd}>
            Export Summary (MD)
          </button>
          <button className="btn small" onClick={exportJson}>
            Export JSON
          </button>
        </div>
      </div>

      {Array.isArray(events) && events.length ? (
        <div className="card pad soft" style={{ boxShadow: "var(--shadow-soft)" }}>
          <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
            <div>
	              <div className="card-title">LLM Interpretation (using the current filtered table)</div>
	              <div className="card-sub">Injects the Top N filtered rows (CSV) into the prompt to avoid generic commentary.</div>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button className="btn small primary" disabled={llmBusy} onClick={runLlm}>
                <span className="row" style={{ gap: 8 }}>
                  {llmBusy ? <span className="spinner" /> : null}
                  <span>{llmBusy ? "Computing..." : "Generate Insights (LLM)"}</span>
                </span>
              </button>
	              <button className="btn small" disabled={llmBusy} onClick={() => setLlmCfg(loadLlmConfig())}>
	                Refresh Config
	              </button>
              <button
                className="btn small"
                disabled={!llmResult.markdown}
                onClick={() => navigator.clipboard.writeText(llmResult.markdown || "")}
	              >
	                Copy Output
	              </button>
            </div>
          </div>

          <div style={{ height: 10 }} />
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="pill">model: {llmCfg.model}</span>
            <span className="pill">api: {apiUrl || "mock"}</span>
            {llmMeta.mock ? <span className="pill" style={{ fontWeight: 800 }}>DEMO MOCK{llmMeta.reason ? ` · ${llmMeta.reason}` : ""}</span> : null}
            <span className="pill">Top {llmTopRows} rows injected</span>
            {llmSender.trim() ? <span className="pill">sender={llmSender.trim()}</span> : null}
            {llmReceiver.trim() ? <span className="pill">receiver={llmReceiver.trim()}</span> : null}
          </div>

          <div style={{ height: 10 }} />
	          <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
	            <div className="field" style={{ minWidth: 0 }}>
	              <div className="label">Top rows</div>
	              <select className="select" value={String(llmTopRows)} onChange={(e) => setLlmTopRows(Number(e.target.value))} disabled={llmBusy}>
	                <option value="10">10</option>
	                <option value="20">20</option>
	                <option value="40">40</option>
	              </select>
	            </div>
	            <div className="field" style={{ flex: 1, minWidth: 0 }}>
		              <div className="label">Sender (optional)</div>
		              <input className="input" value={llmSender} onChange={(e) => setLlmSender(e.target.value)} placeholder="e.g., T cells" disabled={llmBusy} />
	            </div>
	            <div className="field" style={{ flex: 1, minWidth: 0 }}>
		              <div className="label">Receiver (optional)</div>
		              <input className="input" value={llmReceiver} onChange={(e) => setLlmReceiver(e.target.value)} placeholder="e.g., B cells" disabled={llmBusy} />
	            </div>
	          </div>

          <div style={{ height: 10 }} />
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
	            <button className="btn small" type="button" disabled={llmBusy} onClick={() => navigator.clipboard.writeText(injectedCsvPreview)}>
	              Copy Injected CSV
	            </button>
	            <button className="btn small" type="button" disabled={llmBusy} onClick={() => navigator.clipboard.writeText(injectedPromptPreview)}>
	              Copy Prompt
	            </button>
	          </div>

          <div style={{ height: 10 }} />
          <details className="details-block">
            <summary className="details-summary">View injected CSV (Top rows)</summary>
            <pre className="details-pre">{injectedCsvPreview}</pre>
          </details>
          <details className="details-block">
            <summary className="details-summary">View full prompt</summary>
            <pre className="details-pre">{injectedPromptPreview}</pre>
          </details>

          {llmError ? (
            <div className="warning" style={{ marginTop: 10 }}>
              {llmError}
            </div>
          ) : null}

              {llmBusy ? (
            <div key={`busy-${llmRunId}`} className="anim-in" style={{ marginTop: 10, display: "grid", gap: 10 }}>
              <div className="card pad" style={{ boxShadow: "var(--shadow-soft)" }}>
                <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
                  <div className="card-title">LLM Output</div>
                  <SmartLoader
                    intervalMs={1800}
                    messages={[
                      "Preparing filtered evidence…",
                      "Checking mapping and thresholds…",
                      "Extracting key entities…",
                      "Building claim → evidence links…",
                      "Drafting a structured report…",
                      "Finalizing (almost there)…",
                    ]}
                  />
                </div>
                <div style={{ height: 10 }} />
                <LlmComfortLoader mockHint={!apiUrl} />
              </div>
              <div className="think-block pulse">
                <div className="row split">
                  <div className="think-summary" style={{ fontSize: 12, fontWeight: 800 }}>
                    View Reasoning Process
                  </div>
                  <span className="pill think-pill">Thinking…</span>
                </div>
                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  <div className="skeleton-line" style={{ width: "88%" }} />
                  <div className="skeleton-line" style={{ width: "74%" }} />
                  <div className="skeleton-line" style={{ width: "82%" }} />
                </div>
              </div>
              <div className="card pad" style={{ boxShadow: "var(--shadow-soft)" }}>
                <div className="skeleton-line" style={{ width: "92%" }} />
                <div style={{ height: 10 }} />
                <div className="skeleton-line" style={{ width: "85%" }} />
                <div style={{ height: 10 }} />
                <div className="skeleton-line" style={{ width: "78%" }} />
              </div>
            </div>
          ) : llmResult.think || llmResult.markdown ? (
            <div key={`res-${llmRunId}`} className="anim-in" style={{ marginTop: 10 }}>
              <ThinkBlock think={llmResult.think} />

              <div className="card pad" style={{ marginTop: 10, boxShadow: "var(--shadow-soft)" }}>
                <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div className="card-title">Robustness & Negative Control</div>
                    <div className="card-sub">For review: stability across parameter variants + randomized null controls.</div>
                  </div>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <button className="btn small" disabled={robBusy} onClick={runRobustness} type="button">
                      <span className="row" style={{ gap: 8 }}>
                        {robBusy ? <span className="spinner" /> : null}
                        <span>{robBusy ? "Computing..." : "Compute robustness"}</span>
                      </span>
                    </button>
                    <button className="btn small" disabled={nullBusy} onClick={runNull} type="button">
                      <span className="row" style={{ gap: 8 }}>
                        {nullBusy ? <span className="spinner" /> : null}
                        <span>{nullBusy ? "Computing..." : "Run null control"}</span>
                      </span>
                    </button>
                  </div>
                </div>

                {rob ? (
                  <div className="anim-in" style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    {rob.warnings?.length ? (
                      <div className="warning">
                        <div style={{ fontWeight: 850, marginBottom: 6 }}>Robustness warnings</div>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {rob.warnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="notice">Robustness: no obvious instability detected (still validate with biological priors).</div>
                    )}

                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <span className="pill">variants: {rob.variants}</span>
                      <span className="pill">TopK: {rob.topK}</span>
                    </div>

	                    <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
	                      <div className="card pad" style={{ flex: 1, minWidth: 0, boxShadow: "var(--shadow-soft)" }}>
	                        <div className="card-title">Baseline Top pairs stability</div>
                        <div style={{ height: 10 }} />
                        <div className="scroll" style={{ borderRadius: 12 }}>
	                    <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
                            <thead>
                              <tr style={{ background: "rgba(248,250,252,0.94)" }}>
                                {["Sender", "Receiver", "Support", "avgRank"].map((h) => (
                                  <th
                                    key={h}
                                    style={{
                                      textAlign: "left",
                                      padding: "10px 10px",
                                      fontSize: 12,
                                      borderBottom: "1px solid rgba(15,23,42,0.10)",
                                      color: "rgba(15,23,42,0.72)",
                                    }}
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {rob.stability.pairs.slice(0, 10).map((p, idx) => (
                                <tr
                                  key={`${p.sender}\t${p.receiver}`}
                                  style={{ background: idx % 2 ? "white" : "rgba(248,250,252,0.55)", cursor: "pointer" }}
                                  title="Click to jump to Table and bind highlight to charts"
                                  onClick={() => {
                                    if (typeof onSelectPair === "function") onSelectPair({ sender: p.sender, receiver: p.receiver });
                                    navigate("table");
                                  }}
                                >
                                  <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                                    {p.sender}
                                  </td>
                                  <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                                    {p.receiver}
                                  </td>
                                  <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                                    {(p.support * 100).toFixed(0)}%
                                  </td>
                                  <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                                    {Number.isFinite(p.avgRank) ? p.avgRank.toFixed(1) : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

	                      <div className="card pad" style={{ flex: 1, minWidth: 0, boxShadow: "var(--shadow-soft)" }}>
	                        <div className="card-title">Baseline Top metabolites stability</div>
                        <div style={{ height: 10 }} />
                        <div className="scroll" style={{ borderRadius: 12 }}>
	                    <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
                            <thead>
                              <tr style={{ background: "rgba(248,250,252,0.94)" }}>
                                {["Metabolite", "Support", "avgRank"].map((h) => (
                                  <th
                                    key={h}
                                    style={{
                                      textAlign: "left",
                                      padding: "10px 10px",
                                      fontSize: 12,
                                      borderBottom: "1px solid rgba(15,23,42,0.10)",
                                      color: "rgba(15,23,42,0.72)",
                                    }}
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {rob.stability.metabolites.slice(0, 10).map((m, idx) => (
                                <tr
                                  key={m.metabolite}
                                  style={{ background: idx % 2 ? "white" : "rgba(248,250,252,0.55)", cursor: "pointer" }}
                                  title="Click to filter by this metabolite and jump to Table"
                                  onClick={() => {
                                    applyPatch({ metaboliteQuery: m.metabolite });
                                    navigate("table");
                                  }}
                                >
                                  <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                                    {m.metabolite}
                                  </td>
                                  <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                                    {(m.support * 100).toFixed(0)}%
                                  </td>
                                  <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                                    {Number.isFinite(m.avgRank) ? m.avgRank.toFixed(1) : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {nullRes ? (
                  <div className="anim-in" style={{ marginTop: 10 }}>
                    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                      <span className="pill">null n={nullRes.n}</span>
                      <span className="pill">metric={nullRes.metric}</span>
                      <span className="pill">obs={nullRes.observed.toFixed(4)}</span>
                      <span className="pill">mean={nullRes.mean.toFixed(4)}</span>
                      <span className="pill">sd={nullRes.sd.toFixed(4)}</span>
                      <span className="pill">p≈{nullRes.pValue.toFixed(3)}</span>
                    </div>
                    <div className={nullRes.pValue < 0.05 ? "notice" : "warning"} style={{ marginTop: 10 }}>
                      {nullRes.pValue < 0.05
                        ? "Null control: observed structure concentration is significantly higher than random (supports non-random network structure)."
                        : "Null control: observed structure concentration is not significantly higher than random (be cautious: filters may be too strict, sample too small, or structure unstable)."}
                      <div style={{ marginTop: 6 }} className="subtle">
                        {nullRes.note}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {payloadClaims.length ? (
                <div className="card pad" style={{ marginTop: 10, boxShadow: "var(--shadow-soft)" }}>
                  <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <div className="card-title">Claims (traceable)</div>
                      <div className="card-sub">Each claim is linked to evidence_row_ids; click an ID to jump to Table and highlight the corresponding edge.</div>
                    </div>
                    <div className="pill">{payloadClaims.length} claims</div>
                  </div>
                  <div style={{ height: 10 }} />
                  <div style={{ display: "grid", gap: 10 }}>
                    {payloadClaims.slice(0, 8).map((c, idx) => {
                      const tone = claimConfidenceTone(c);
                      const ids = Array.isArray(c?.evidence_row_ids) ? c.evidence_row_ids : [];
                      const title = (typeof c?.title === "string" && c.title.trim()) || `Claim ${idx + 1}`;
                      return (
                        <div
                          key={c?.id || idx}
                          style={{
                            border: "1px solid rgba(15,23,42,0.12)",
                            borderRadius: 14,
                            padding: "10px 12px",
                            background: "rgba(255,255,255,0.78)",
                          }}
                        >
                          <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
                            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                              <span
                                className="pill"
                                style={{ background: tone.bg, borderColor: tone.bd, color: tone.fg, fontWeight: 800 }}
                                title="Confidence reflects robustness under the current filtering/weighting choices, not 'how strong' the conclusion is"
                              >
                                {String(c?.confidence || "medium").toUpperCase()}
                              </span>
                              <div style={{ fontWeight: 850 }}>{title}</div>
                            </div>
                            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                              {(ids ?? []).slice(0, 10).map((rid) => (
                                <button
                                  key={`${c?.id || idx}-rid-${rid}`}
                                  type="button"
                                  className="chip"
                                  onClick={() => selectEvidenceRowId(rid)}
                                  title="Click to jump to Table and highlight the sender→receiver for this RowId"
                                >
                                  evidence #{rid}
                                </button>
                              ))}
                            </div>
                          </div>
                          {typeof c?.statement_md === "string" && c.statement_md.trim() ? (
                            <div style={{ marginTop: 8 }}>
                              <MarkdownLite markdown={c.statement_md.trim()} entities={mdEntities} onEntityClick={onEntityClick} />
                            </div>
                          ) : null}
                          {Array.isArray(c?.caveats) && c.caveats.length ? (
                            <div className="notice" style={{ marginTop: 8 }}>
                              <div style={{ fontWeight: 800, marginBottom: 6 }}>Caveats</div>
                              <ul style={{ margin: 0, paddingLeft: 18 }}>
                                {c.caveats.slice(0, 6).map((x, j) => (
                                  <li key={j}>{String(x)}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {payloadEntities ? (
                <div className="card pad" style={{ marginTop: 10, boxShadow: "var(--shadow-soft)" }}>
                  <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <div className="card-title">Key Entities (clickable)</div>
                      <div className="card-sub">Click to apply a filter on the left (and write it into the URL).</div>
                    </div>
                    {payloadPatch && typeof payloadPatch === "object" ? (
                      <button className="btn small primary" onClick={() => applyPatch(payloadPatch)}>
                        Apply LLM Filter Patch
                      </button>
                    ) : null}
                  </div>
                  <div style={{ height: 10 }} />

                  <div className="chips">
                    {normalizeArray(payloadEntities.metabolites).length ? (
                      normalizeArray(payloadEntities.metabolites).map((m) => (
                        <button
                          key={`met-${m}`}
                          className="chip"
                          onClick={() => {
                            applyPatch({ metaboliteQuery: m });
                            navigate("table");
                          }}
                          type="button"
                        >
                          metabolite: {m}
                        </button>
                      ))
                    ) : (
                      <span className="chip muted">no metabolites</span>
                    )}

                    {normalizeArray(payloadEntities.senders).map((c) => (
                      <button
                        key={`s-${c}`}
                        className="chip"
                        onClick={() => {
                          applyPatch({ focusCell: c, focusMode: "outgoing" });
                          navigate("network");
                        }}
                        type="button"
                      >
                        sender: {c}
                      </button>
                    ))}
                    {normalizeArray(payloadEntities.receivers).map((c) => (
                      <button
                        key={`r-${c}`}
                        className="chip"
                        onClick={() => {
                          applyPatch({ focusCell: c, focusMode: "incoming" });
                          navigate("network");
                        }}
                        type="button"
                      >
                        receiver: {c}
                      </button>
                    ))}
                    {(Array.isArray(payloadEntities.pairs) ? payloadEntities.pairs : []).slice(0, 6).map((p, idx) => {
                      const s = typeof p?.sender === "string" ? p.sender.trim() : "";
                      const r = typeof p?.receiver === "string" ? p.receiver.trim() : "";
                      if (!s || !r) return null;
                      return (
                        <button
                          key={`p-${idx}-${s}-${r}`}
                          className="chip"
                          onClick={() => {
                            if (typeof onSelectPair === "function") onSelectPair({ sender: s, receiver: r });
                            navigate("network");
                          }}
                          type="button"
                          title="Click to select this pair and jump to Network (also binds highlight to Matrix/DotPlot/Table)"
                        >
                          pair: {s} → {r}
                        </button>
                      );
                    })}
                  </div>

                  <details className="details-block" style={{ marginTop: 10 }}>
                    <summary className="details-summary">View PAYLOAD_JSON</summary>
                    <pre className="details-pre">{JSON.stringify(llmResult.payload, null, 2)}</pre>
                  </details>
                </div>
              ) : null}

              {evidenceRows.length ? (
                <div className="card pad" style={{ marginTop: 10, boxShadow: "var(--shadow-soft)" }}>
                  <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <div className="card-title">Evidence (Injected Top rows)</div>
                      <div className="card-sub">Click a row to jump to Table and highlight the sender→receiver; use the buttons to bind it to charts.</div>
                    </div>
                    <div className="pill">rows: {evidenceRows.length}</div>
                  </div>
                  <div style={{ height: 10 }} />
	                  <div className="scroll" style={{ borderRadius: 12 }}>
	                    <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
                      <thead>
                        <tr style={{ background: "rgba(248,250,252,0.94)" }}>
                          {["#", "Sender", "Receiver", "Metabolite", "FDR", "Bind"].map((h) => (
                            <th
                              key={h}
                              style={{
                                textAlign: "left",
                                padding: "10px 10px",
                                fontSize: 12,
                                borderBottom: "1px solid rgba(15,23,42,0.10)",
                                color: "rgba(15,23,42,0.72)",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {evidenceRows.map((r) => (
                          <tr
                            key={`${r.idx}-${r.sender}-${r.receiver}-${r.metabolite}`}
                            className={isSelectedEvidence(r) ? "row-pair-hl" : ""}
                            style={{
                              background: r.idx % 2 ? "white" : "rgba(248,250,252,0.55)",
                              cursor: "pointer",
                            }}
                            onClick={() => {
                              if (typeof onSelectPair === "function") onSelectPair({ sender: r.sender, receiver: r.receiver });
                              navigate("table");
                            }}
                            title="Click to jump to Table and highlight"
                          >
	                            <td
	                              style={{
	                                padding: "8px 10px",
	                                fontSize: 12,
	                                borderBottom: "1px solid rgba(15,23,42,0.06)",
	                                overflowWrap: "anywhere",
	                              }}
	                            >
	                              {r.idx}
	                            </td>
	                            <td
	                              style={{
	                                padding: "8px 10px",
	                                fontSize: 12,
	                                borderBottom: "1px solid rgba(15,23,42,0.06)",
	                                overflowWrap: "anywhere",
	                              }}
	                            >
	                              {r.sender}
	                            </td>
	                            <td
	                              style={{
	                                padding: "8px 10px",
	                                fontSize: 12,
	                                borderBottom: "1px solid rgba(15,23,42,0.06)",
	                                overflowWrap: "anywhere",
	                              }}
	                            >
	                              {r.receiver}
	                            </td>
	                            <td
	                              style={{
	                                padding: "8px 10px",
	                                fontSize: 12,
	                                borderBottom: "1px solid rgba(15,23,42,0.06)",
	                                overflowWrap: "anywhere",
	                              }}
	                            >
	                              <button
	                                type="button"
	                                className="chip"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  applyPatch({ metaboliteQuery: r.metabolite });
                                  navigate("table");
                                }}
                                title="Click to filter by this metabolite and jump to Table"
                              >
                                {r.metabolite || "NA"}
                              </button>
                            </td>
                            <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                              {r.fdr}
                            </td>
                            <td style={{ padding: "8px 10px", fontSize: 12, borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                                {["network", "matrix", "dotplot"].map((v) => (
                                  <button
                                    key={v}
                                    type="button"
                                    className="btn small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (typeof onSelectPair === "function") onSelectPair({ sender: r.sender, receiver: r.receiver });
                                      navigate(v);
                                    }}
                                  >
                                    {v === "network" ? "Network" : v === "matrix" ? "Matrix" : "DotPlot"}
                                  </button>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {llmResult.markdown ? (
                <div className="card pad" style={{ marginTop: 10, boxShadow: "var(--shadow-soft)" }}>
                  <div className="card-title">LLM Report</div>
                  <div style={{ height: 10 }} />
                  <TypewriterMarkdown markdown={llmResult.markdown} cps={40} entities={mdEntities} onEntityClick={onEntityClick} />
                </div>
              ) : (
                <div className="notice">The model returned no final answer text.</div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="card pad" style={{ boxShadow: "var(--shadow-soft)" }}>
        <div className="card-title">{title || "Auto Summary"}</div>
        <div style={{ height: 10 }} />
        <ul style={{ margin: 0, paddingLeft: 18, color: "rgba(15,23,42,0.82)", fontSize: 13 }}>
          {(insights.summaryLines ?? []).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>

      <div className="card pad" style={{ boxShadow: "var(--shadow-soft)" }}>
        <div className="row split">
          <div className="card-title">QC (Explainable Checks)</div>
          <div className="pill">{insights.qc?.length ? `${insights.qc.length} items` : "0 item"}</div>
        </div>
        <div style={{ height: 10 }} />
        {insights.qc?.length ? (
          <div style={{ display: "grid", gap: 10 }}>
            {insights.qc.map((q, idx) => (
              <div key={`${q.title}-${idx}`} className={q.level === "warn" ? "warning" : "notice"}>
                <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                  <Badge tone={q.level}>{q.level.toUpperCase()}</Badge>
                  <div style={{ fontWeight: 800 }}>{q.title}</div>
                </div>
                <div style={{ marginTop: 6 }}>{q.detail}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="notice">No obvious issues detected (still validate with raw data and biological priors).</div>
        )}
      </div>

      {hasRec ? (
        <div className="card pad" style={{ boxShadow: "var(--shadow-soft)" }}>
          <div className="row split" style={{ flexWrap: "wrap", gap: 10 }}>
            <div>
              <div className="card-title">Recommendations</div>
              <div className="card-sub">Apply to the left panel to quickly reduce scale and improve robustness.</div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn small primary" onClick={applyRec}>Apply</button>
            </div>
          </div>
          <div style={{ height: 10 }} />
          <pre style={{ margin: 0, fontSize: 12, color: "rgba(15,23,42,0.72)", whiteSpace: "pre-wrap" }}>
            {JSON.stringify(insights.recommendations, null, 2)}
          </pre>
        </div>
      ) : null}

      {insights.kind === "single" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <KeyValueTable
            title="Top senders"
            headers={["Cell", "outWeight", "outCount"]}
            rows={(insights.top?.topSenders ?? []).map((r) => [r.id, r.outWeight.toFixed(2), String(r.outCount)])}
          />
          <KeyValueTable
            title="Top receivers"
            headers={["Cell", "inWeight", "inCount"]}
            rows={(insights.top?.topReceivers ?? []).map((r) => [r.id, r.inWeight.toFixed(2), String(r.inCount)])}
          />
          <KeyValueTable
            title="Top metabolites"
            headers={["Metabolite", "weight", "count"]}
            rows={(insights.top?.topMet ?? []).map((r) => [r.key, r.weight.toFixed(2), String(r.count)])}
          />
          <KeyValueTable
            title="Top sensors"
            headers={["Sensor", "weight", "count"]}
            rows={(insights.top?.topSens ?? []).map((r) => [r.key, r.weight.toFixed(2), String(r.count)])}
          />
          <div style={{ gridColumn: "1 / -1" }}>
            <KeyValueTable
              title="Top edges (aggregated)"
              headers={["Sender", "Receiver", "weight", "count"]}
              rows={(insights.top?.topEdges ?? []).map((r) => [r.sender, r.receiver, r.weight.toFixed(2), String(r.count)])}
            />
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <KeyValueTable
            title="Top increased (B-A)"
            headers={["Sender", "Receiver", "Δ"]}
            rows={(insights.top?.topUp ?? []).map((r) => [r.sender, r.receiver, r.delta.toFixed(2)])}
          />
          <KeyValueTable
            title="Top decreased (B-A)"
            headers={["Sender", "Receiver", "Δ"]}
            rows={(insights.top?.topDown ?? []).map((r) => [r.sender, r.receiver, r.delta.toFixed(2)])}
          />
          <KeyValueTable
            title="By Annotation (Δ)"
            headers={["Annotation", "A", "B", "Δ(B-A)"]}
            rows={(insights.top?.annDiffRows ?? []).map((r) => [r.key, r.weightA.toFixed(2), r.weightB.toFixed(2), r.delta.toFixed(2)])}
          />
          <KeyValueTable
            title="By Flux_PASS (Δ)"
            headers={["Flux_PASS", "A", "B", "Δ(B-A)"]}
            rows={(insights.top?.fluxDiffRows ?? []).map((r) => [r.key, r.weightA.toFixed(2), r.weightB.toFixed(2), r.delta.toFixed(2)])}
          />
        </div>
      )}
    </div>
  );
}
