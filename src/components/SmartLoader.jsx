import React from "react";

export default function SmartLoader({
  messages = ["Analyzing interactions...", "Checking pathways...", "Synthesizing report..."],
  intervalMs = 1100,
  className = "",
}) {
  const list = Array.isArray(messages) && messages.length ? messages : ["Loading..."];
  const [idx, setIdx] = React.useState(0);

  React.useEffect(() => {
    setIdx(0);
    const t = setInterval(() => setIdx((i) => (i + 1) % list.length), Math.max(500, Number(intervalMs) || 1100));
    return () => clearInterval(t);
  }, [intervalMs, list.length]);

  return (
    <div className={`smart-loader ${className}`.trim()}>
      <span className="spinner" aria-hidden="true" />
      <span className="smart-loader-text">{list[idx] || "Loading..."}</span>
    </div>
  );
}

