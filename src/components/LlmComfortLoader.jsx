import React from "react";

export default function LlmComfortLoader({ mockHint = false }) {
  const lines = mockHint
    ? [
        "Loading your filtered subset (CSV injection)…",
        "Verifying Sender/Receiver/Metabolite/Sensor mappings…",
        "Checking Flux_PASS and FDR semantics and thresholds…",
        "Extracting key entities (cell types / metabolites / sensors)…",
        "Ranking top edges and selecting representative evidence rows…",
        "Building a claim → evidence chain with traceable row IDs…",
        "Drafting an actionable filterPatch and polishing the narrative…",
      ]
    : ["Parsing injected rows…", "Running QC and summarization…", "Generating evidence-backed, structured recommendations…", "Formatting the report…"];

  return (
      <div className="llm-comfort">
        <div className="llm-comfort-head">
        <div className="llm-comfort-title">{mockHint ? "Mock Mode · Demo output is generated locally" : "Working…"}</div>
        <div className="llm-comfort-bar" aria-hidden="true" />
      </div>
      <div className="llm-comfort-body">
        {lines.map((t, idx) => (
          <div key={t} className="llm-comfort-line" style={{ animationDelay: `${idx * 820}ms` }}>
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}
