import React from "react";
import { loadLlmConfig, resetLlmConfig, saveLlmConfig } from "../lib/llmConfig";
import { chatCompletions, extractAssistantText } from "../lib/llmClient";
import { splitThink } from "../lib/llmThink";
import { parseStructuredLlmAnswer } from "../lib/llmStructured";
import { getLlmApiUrl, isMockMode } from "../lib/llmEnv";
import SmartLoader from "./SmartLoader";
import TypewriterMarkdown from "./TypewriterMarkdown";

const DEFAULT_PROMPT =
  "Write a concise but information-dense analysis.\n" +
  "Topic: Ligand–Receptor Interaction (LR).\n" +
  "Include: its role in single-cell cell–cell communication (CCC), common pitfalls/limitations, and how it complements metabolite-mediated mCCC/MEBOCOST.\n" +
  "Output: 3–6 bullet points + 1 short summary paragraph (no formulas).";

export default function LlmPanel() {
  const [cfg, setCfg] = React.useState(() => loadLlmConfig());
  const [prompt, setPrompt] = React.useState(DEFAULT_PROMPT);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState({ think: "", markdown: "", payload: null, raw: "" });
  const [error, setError] = React.useState("");
  const [showKey, setShowKey] = React.useState(false);
  const [runId, setRunId] = React.useState(0);
  const [meta, setMeta] = React.useState({ mock: false, reason: "" });
  const apiUrl = getLlmApiUrl();

  const save = () => {
    saveLlmConfig(cfg);
    setError("");
  };

  const reset = () => {
    resetLlmConfig();
    const next = loadLlmConfig();
    setCfg(next);
    setError("");
    setResult({ think: "", markdown: "", payload: null, raw: "" });
  };

  const run = async () => {
    setBusy(true);
    setError("");
    setResult({ think: "", markdown: "", payload: null, raw: "" });
    setRunId((x) => x + 1);
    setMeta({ mock: false, reason: "" });
    try {
      saveLlmConfig(cfg);
      const resp = await chatCompletions({
        apiKey: cfg.apiKey,
        body: {
          model: cfg.model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 500,
          temperature: 0.3,
        },
      });
      setMeta({ mock: !!resp?.mock, reason: String(resp?.mockReason ?? "") });
      if (resp?.mock && String(resp?.mockReason ?? "") && String(resp?.mockReason ?? "") !== "ENV_MISSING") {
        setError("The analysis service is temporarily unavailable (auto-falling back to demo mock output).");
      }
      const text = extractAssistantText(resp);
      if (!text) throw new Error("LLM returned empty content (choices[0].message.content missing).");
      const { think, answer } = splitThink(text);
      const structured = parseStructuredLlmAnswer(answer);
      setResult({ think, ...structured });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The analysis service is temporarily unavailable (auto-falling back to demo mock output).");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className={isMockMode() ? "warning" : "notice"}>
        <div style={{ fontWeight: 850, marginBottom: 6 }}>LLM Status</div>
        <div>
          api url: <span className="mono">{apiUrl || "(empty) → mock mode"}</span>
        </div>
        {meta.mock ? <div style={{ marginTop: 6 }}>Demo Mock: {meta.reason || "ON"}</div> : null}
      </div>

      <div className="card pad soft" style={{ boxShadow: "var(--shadow-soft)" }}>
        <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
          <div>
            <div className="card-title">LLM API Settings</div>
            <div className="card-sub">Stores model/apiKey only (base URL comes from VITE_LLM_API_URL).</div>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn small" onClick={save} disabled={busy}>
              Save
            </button>
            <button className="btn small" onClick={reset} disabled={busy}>
              Reset
            </button>
            <button className="btn small primary" onClick={run} disabled={busy}>
              <span className="row" style={{ gap: 8 }}>
                {busy ? <span className="spinner" /> : null}
                <span>{busy ? "Computing..." : "Test connection / Generate sample"}</span>
              </span>
            </button>
          </div>
        </div>

        <div style={{ height: 10 }} />
        <div style={{ display: "grid", gap: 10 }}>
          <div className="field">
            <div className="label">API Base URL</div>
            <input className="input" value={apiUrl || ""} readOnly placeholder="Provided by VITE_LLM_API_URL; empty → mock mode" />
          </div>
          <div className="field">
            <div className="label">Model</div>
            <input className="input" value={cfg.model} onChange={(e) => setCfg((p) => ({ ...p, model: e.target.value }))} />
          </div>
          <div className="field">
              <div className="row split" style={{ gap: 10 }}>
                <div className="label">API Key</div>
                <button className="btn small" type="button" onClick={() => setShowKey((v) => !v)} disabled={busy}>
                {showKey ? "Hide" : "Show"}
                </button>
              </div>
            <input
              className="input"
              type={showKey ? "text" : "password"}
              value={cfg.apiKey}
              onChange={(e) => setCfg((p) => ({ ...p, apiKey: e.target.value }))}
              placeholder="sk-..."
            />
          </div>
        </div>
      </div>

      <div className="card pad" style={{ boxShadow: "var(--shadow-soft)" }}>
        <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
          <div>
            <div className="card-title">Prompt</div>
            <div className="card-sub">Quick connectivity check. For data-injected analysis, use Insights.</div>
          </div>
          <span className="pill">max_tokens=500 · temp=0.3</span>
        </div>
        <div style={{ height: 10 }} />
        <textarea
          className="input"
          style={{ minHeight: 160 }}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </div>

      {error ? <div className="warning">{error}</div> : null}

      {busy ? (
        <div key={`busy-${runId}`} className="card pad anim-in" style={{ boxShadow: "var(--shadow-soft)" }}>
          <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
            <div className="card-title">LLM Output</div>
            <SmartLoader />
          </div>
          <div style={{ height: 10 }} />
          <details className="details-block pulse" open>
            <summary className="details-summary">🧬 View AI Reasoning Process</summary>
            <div className="reasoning-pre" aria-hidden="true">
              <div className="skeleton-line" style={{ width: "86%" }} />
              <div className="skeleton-line" style={{ width: "72%" }} />
              <div className="skeleton-line" style={{ width: "80%" }} />
            </div>
          </details>
          <div style={{ display: "grid", gap: 10 }}>
            <div className="skeleton-line" style={{ width: "92%" }} />
            <div className="skeleton-line" style={{ width: "84%" }} />
            <div className="skeleton-line" style={{ width: "78%" }} />
          </div>
        </div>
      ) : result.markdown || result.think ? (
        <div className="card pad" style={{ boxShadow: "var(--shadow-soft)" }}>
          <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
            <div className="card-title">LLM Output</div>
            <button className="btn small" onClick={() => navigator.clipboard.writeText(result.markdown || "")} disabled={!result.markdown}>
              Copy
            </button>
          </div>
          <div style={{ height: 10 }} />
          <details className="details-block">
            <summary className="details-summary">🧬 View AI Reasoning Process</summary>
            <pre className="reasoning-pre">{result.think?.trim() ? result.think.trim() : "(No reasoning returned.)"}</pre>
          </details>
          {result.markdown ? (
            <TypewriterMarkdown markdown={result.markdown} cps={90} />
          ) : (
            <div className="notice">No final answer returned (only reasoning content).</div>
          )}
          {result.payload ? (
            <details className="details-block" style={{ marginTop: 10 }}>
              <summary className="details-summary">View PAYLOAD_JSON</summary>
              <pre className="details-pre">{JSON.stringify(result.payload, null, 2)}</pre>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
