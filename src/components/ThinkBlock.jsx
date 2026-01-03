import React from "react";

export default function ThinkBlock({ think, defaultOpen = false }) {
  const t = typeof think === "string" ? think.trim() : "";
  if (!t) return null;
  return (
    <details className="think-block" open={defaultOpen}>
      <summary className="think-summary">
        <span className="think-title">View Reasoning Process</span>
        <span className="think-meta">
          <span className="pill think-pill">Reasoning</span>
        </span>
      </summary>
      <pre className="think-pre">{t}</pre>
    </details>
  );
}
