import React from "react";
import { loadLlmConfig, resetLlmConfig, saveLlmConfig } from "../lib/llmConfig";
import { chatCompletions, extractAssistantText } from "../lib/llmClient";
import { splitThink } from "../lib/llmThink";
import { parseStructuredLlmAnswer } from "../lib/llmStructured";
import { getLlmApiUrl, isMockMode } from "../lib/llmEnv";
import ThinkBlock from "./ThinkBlock";
import TypewriterMarkdown from "./TypewriterMarkdown";

const DEFAULT_PROMPT =
  "请用中文给出一段简洁但有信息密度的分析：\n" +
  "主题：Ligand-Receptor Interaction（配体-受体相互作用）。\n" +
  "要求：说明它在单细胞细胞间通讯（CCC）分析中的意义、常见误读/局限、以及如何与代谢介导的 mCCC/MEBOCOST 结果互补解读。\n" +
  "输出：3-6 条要点 + 1 段总结（不要写公式）。";

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
      const text = extractAssistantText(resp);
      if (!text) throw new Error("LLM 返回为空（choices[0].message.content 缺失）");
      const { think, answer } = splitThink(text);
      const structured = parseStructuredLlmAnswer(answer);
      setResult({ think, ...structured });
    } catch (e) {
      setError(e instanceof Error ? e.message : "请求失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="notice">
        部署模式：LLM 端点只从环境变量读取 <span className="mono">VITE_LLM_API_URL</span>。未设置时自动进入 Demo Mock 模式（保证教授打开链接也能演示）。
      </div>

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
            <div className="card-title">LLM API 配置</div>
            <div className="card-sub">只保存 model/apiKey（URL 由 VITE_LLM_API_URL 提供）。</div>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="btn small" onClick={save} disabled={busy}>
              保存配置
            </button>
            <button className="btn small" onClick={reset} disabled={busy}>
              重置
            </button>
            <button className="btn small primary" onClick={run} disabled={busy}>
              <span className="row" style={{ gap: 8 }}>
                {busy ? <span className="spinner" /> : null}
                <span>{busy ? "Computing..." : "测试连接 / 生成示例"}</span>
              </span>
            </button>
          </div>
        </div>

        <div style={{ height: 10 }} />
        <div style={{ display: "grid", gap: 10 }}>
          <div className="field">
            <div className="label">API Base URL</div>
            <input className="input" value={apiUrl || ""} readOnly placeholder="由 VITE_LLM_API_URL 提供；为空则进入 mock" />
          </div>
          <div className="field">
            <div className="label">Model</div>
            <input className="input" value={cfg.model} onChange={(e) => setCfg((p) => ({ ...p, model: e.target.value }))} />
          </div>
          <div className="field">
            <div className="row split" style={{ gap: 10 }}>
              <div className="label">API Key</div>
              <button className="btn small" type="button" onClick={() => setShowKey((v) => !v)} disabled={busy}>
                {showKey ? "隐藏" : "显示"}
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
            <div className="card-sub">用于快速验证连通性；正式“数据注入”请在 Insights 里生成。</div>
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
            <div className="card-title">LLM 输出</div>
            <span className="pill">Computing…</span>
          </div>
          <div style={{ height: 10 }} />
          <div className="think-block pulse" style={{ marginBottom: 10 }}>
            <div className="row split">
              <div className="think-summary" style={{ fontSize: 12, fontWeight: 800 }}>
                View Reasoning Process (AI 思考过程)
              </div>
              <span className="pill think-pill">Thinking…</span>
            </div>
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <div className="skeleton-line" style={{ width: "86%" }} />
              <div className="skeleton-line" style={{ width: "72%" }} />
              <div className="skeleton-line" style={{ width: "80%" }} />
            </div>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            <div className="skeleton-line" style={{ width: "92%" }} />
            <div className="skeleton-line" style={{ width: "84%" }} />
            <div className="skeleton-line" style={{ width: "78%" }} />
          </div>
        </div>
      ) : result.markdown || result.think ? (
        <div className="card pad" style={{ boxShadow: "var(--shadow-soft)" }}>
          <div className="row split" style={{ gap: 10, flexWrap: "wrap" }}>
            <div className="card-title">LLM 输出</div>
            <button className="btn small" onClick={() => navigator.clipboard.writeText(result.markdown || "")} disabled={!result.markdown}>
              复制
            </button>
          </div>
          <div style={{ height: 10 }} />
          <ThinkBlock think={result.think} />
          {result.markdown ? (
            <TypewriterMarkdown markdown={result.markdown} cps={90} />
          ) : (
            <div className="notice">模型未返回正文内容（仅返回了思考过程）。</div>
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
